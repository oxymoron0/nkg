package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/jena"
)

// Server holds shared dependencies for all HTTP handlers.
type Server struct {
	nc *client.Client
	jc *jena.Client
}

// NewServeMux creates the HTTP router with all API routes.
func NewServeMux(nc *client.Client, jc *jena.Client) http.Handler {
	s := &Server{nc: nc, jc: jc}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /api/v1/docs", s.handleSwaggerUI)
	mux.HandleFunc("GET /api/v1/openapi.yaml", s.handleOpenAPISpec)
	mux.HandleFunc("GET /api/v1/graph", s.handleGraph)
	mux.HandleFunc("GET /api/v1/pages", s.handleListPages)
	mux.HandleFunc("GET /api/v1/pages/{id}", s.handleGetPage)
	mux.HandleFunc("POST /api/v1/pages/{id}/relations", s.handleLinkRelation)
	mux.HandleFunc("DELETE /api/v1/pages/{id}/relations", s.handleUnlinkRelation)

	if jc != nil {
		mux.HandleFunc("POST /api/v1/sync", s.handleSync)
		mux.HandleFunc("GET /api/v1/sync/status", s.handleSyncStatus)
	}

	return corsMiddleware(mux)
}

type apiResponse struct {
	Data any `json:"data,omitempty"`
}

type apiError struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(apiResponse{Data: data}); err != nil {
		log.Printf("writeJSON: encode error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(apiError{
		Error: errorBody{
			Code:    http.StatusText(status),
			Message: msg,
		},
	}); err != nil {
		log.Printf("writeError: encode error: %v", err)
	}
}

// internalError logs the real error and returns an opaque message to the client.
func internalError(w http.ResponseWriter, context string, err error) {
	log.Printf("%s: %v", context, err)
	writeError(w, http.StatusInternalServerError, context)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
