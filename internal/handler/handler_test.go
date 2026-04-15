package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- writeJSON tests ---

func TestWriteJSON_StatusAndContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, map[string]string{"key": "value"})

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}
}

func TestWriteJSON_Envelope(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, map[string]string{"status": "ok"})

	var envelope struct {
		Data map[string]string `json:"data"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Data["status"] != "ok" {
		t.Errorf("data.status = %q, want %q", envelope.Data["status"], "ok")
	}
}

func TestWriteJSON_CustomStatus(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusCreated, "created")

	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusCreated)
	}
}

func TestWriteJSON_NilData(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, nil)

	var raw map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// With omitempty on Data, nil data should omit the "data" key.
	if _, exists := raw["data"]; exists {
		t.Errorf("expected 'data' key to be omitted for nil, got %v", raw)
	}
}

// --- writeError tests ---

func TestWriteError_StatusAndContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusBadRequest, "something went wrong")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}
}

func TestWriteError_Envelope(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusNotFound, "page not found")

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Error.Code != "Not Found" {
		t.Errorf("error.code = %q, want %q", envelope.Error.Code, "Not Found")
	}
	if envelope.Error.Message != "page not found" {
		t.Errorf("error.message = %q, want %q", envelope.Error.Message, "page not found")
	}
}

func TestWriteError_InternalServerError(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusInternalServerError, "db timeout")

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Error.Code != "Internal Server Error" {
		t.Errorf("error.code = %q, want %q", envelope.Error.Code, "Internal Server Error")
	}
}

// --- CORS middleware tests ---

func TestCORSMiddleware_HeadersOnGET(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	tests := []struct {
		header string
		want   string
	}{
		{"Access-Control-Allow-Origin", "*"},
		{"Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"},
		{"Access-Control-Allow-Headers", "Content-Type"},
	}

	for _, tt := range tests {
		got := rec.Header().Get(tt.header)
		if got != tt.want {
			t.Errorf("%s = %q, want %q", tt.header, got, tt.want)
		}
	}

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestCORSPreflight_Returns204(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("inner handler should not be called for OPTIONS")
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/pages", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	origin := rec.Header().Get("Access-Control-Allow-Origin")
	if origin != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", origin, "*")
	}
}

func TestCORSMiddleware_PassesThroughNonOptions(t *testing.T) {
	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Error("inner handler was not called for POST request")
	}
}

// --- Healthz endpoint test ---

func TestHealthz(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	s.handleHealthz(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var envelope struct {
		Data map[string]string `json:"data"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Data["status"] != "ok" {
		t.Errorf("data.status = %q, want %q", envelope.Data["status"], "ok")
	}
}

// --- Healthz via mux test ---

func TestHealthz_ViaMux(t *testing.T) {
	mux := NewServeMux(nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

// --- Route registration tests ---

func TestRoutes_CoreRoutesRegistered(t *testing.T) {
	mux := NewServeMux(nil, nil)

	// These routes should all be registered (even with nil clients).
	// We test that the mux routes the request (not 404).
	// The handlers will fail internally due to nil clients, but that's fine —
	// we only check they're not 404/405.
	tests := []struct {
		method string
		path   string
	}{
		{"GET", "/healthz"},
		// Other routes require non-nil clients to work, but they're still
		// registered in the mux. They'll panic or error, but won't 404.
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code == http.StatusNotFound {
				t.Errorf("%s %s returned 404, route not registered", tt.method, tt.path)
			}
		})
	}
}

func TestRoutes_SyncNotRegistered_WhenJenaClientNil(t *testing.T) {
	mux := NewServeMux(nil, nil) // jc = nil

	syncRoutes := []struct {
		method string
		path   string
	}{
		{"POST", "/api/v1/sync"},
		{"GET", "/api/v1/sync/status"},
	}

	for _, tt := range syncRoutes {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, nil)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			// With jc=nil, sync routes should NOT be registered.
			// Go 1.22+ method-based mux returns 405 for wrong method
			// and 404 for unregistered paths.
			if rec.Code != http.StatusNotFound && rec.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s status = %d, want 404 or 405 (not registered)", tt.method, tt.path, rec.Code)
			}
		})
	}
}

// --- Relation handler validation tests ---

func TestLinkRelation_InvalidBody(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pages/abc123/relations", strings.NewReader("not json"))
	rec := httptest.NewRecorder()
	s.handleLinkRelation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Error.Message != "invalid request body" {
		t.Errorf("message = %q, want %q", envelope.Error.Message, "invalid request body")
	}
}

func TestLinkRelation_MissingFields(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"missing target_id", `{"relation": "skos:broader"}`},
		{"missing relation", `{"target_id": "abc"}`},
		{"both empty", `{"target_id": "", "relation": ""}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{nc: nil, jc: nil}

			req := httptest.NewRequest(http.MethodPost, "/api/v1/pages/abc123/relations", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			s.handleLinkRelation(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
			}

			var envelope apiError
			if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if envelope.Error.Message != "'target_id' and 'relation' are required" {
				t.Errorf("message = %q, want %q", envelope.Error.Message, "'target_id' and 'relation' are required")
			}
		})
	}
}

func TestLinkRelation_InvalidRelation(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	body := `{"target_id": "abc123", "relation": "invalid:relation"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/pages/abc123/relations", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.handleLinkRelation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(envelope.Error.Message, "invalid relation") {
		t.Errorf("message = %q, want it to contain 'invalid relation'", envelope.Error.Message)
	}
}

func TestUnlinkRelation_InvalidBody(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/pages/abc123/relations", strings.NewReader("{bad"))
	rec := httptest.NewRecorder()
	s.handleUnlinkRelation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Error.Message != "invalid request body" {
		t.Errorf("message = %q, want %q", envelope.Error.Message, "invalid request body")
	}
}

func TestUnlinkRelation_MissingFields(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	body := `{"target_id": "", "relation": "skos:broader"}`
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/pages/abc123/relations", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.handleUnlinkRelation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Error.Message != "'target_id' and 'relation' are required" {
		t.Errorf("message = %q, want %q", envelope.Error.Message, "'target_id' and 'relation' are required")
	}
}

func TestUnlinkRelation_InvalidRelation(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	body := `{"target_id": "abc123", "relation": "bogus"}`
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/pages/abc123/relations", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.handleUnlinkRelation(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(envelope.Error.Message, "invalid relation") {
		t.Errorf("message = %q, want it to contain 'invalid relation'", envelope.Error.Message)
	}
}

// --- Sync handler validation tests ---

func TestSync_InvalidMode(t *testing.T) {
	s := &Server{nc: nil, jc: nil}

	body := `{"mode": "bad"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sync", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.handleSync(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var envelope apiError
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(envelope.Error.Message, "invalid mode") {
		t.Errorf("message = %q, want it to contain 'invalid mode'", envelope.Error.Message)
	}
}

func TestSync_MultipleInvalidModes(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"unknown mode", `{"mode": "snapshot"}`},
		{"typo mode", `{"mode": "ful"}`},
		{"numeric mode", `{"mode": "123"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{nc: nil, jc: nil}

			req := httptest.NewRequest(http.MethodPost, "/api/v1/sync", strings.NewReader(tt.body))
			rec := httptest.NewRecorder()
			s.handleSync(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
			}

			var envelope apiError
			if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if !strings.Contains(envelope.Error.Message, "invalid mode") {
				t.Errorf("message = %q, want it to contain 'invalid mode'", envelope.Error.Message)
			}
		})
	}
}
