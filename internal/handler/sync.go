package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	pkgsync "github.com/leorca/nkg/internal/sync"
)

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var body struct {
		Mode string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Mode == "" {
		body.Mode = "incremental"
	}

	var result *pkgsync.SyncResult
	var err error

	switch body.Mode {
	case "full":
		result, err = pkgsync.FullSync(ctx, s.nc, s.jc)
	case "incremental":
		result, err = pkgsync.IncrementalSync(ctx, s.nc, s.jc)
	default:
		writeError(w, http.StatusBadRequest, "invalid mode: use 'full' or 'incremental'")
		return
	}

	if err != nil {
		internalError(w, "sync failed", err)
		return
	}

	out := map[string]any{
		"mode":   body.Mode,
		"synced": result.Synced,
	}
	if len(result.Errors) > 0 {
		out["errors"] = result.Errors
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	result, err := pkgsync.DiffState(ctx, s.nc, s.jc)
	if err != nil {
		internalError(w, "failed to get sync status", err)
		return
	}

	out := map[string]any{
		"consistent":  result.Consistent,
		"notion_only": len(result.NotionOnly),
		"jena_only":   len(result.JenaOnly),
	}
	if len(result.NotionOnly) > 0 {
		out["notion_only_details"] = result.NotionOnly
	}
	if len(result.JenaOnly) > 0 {
		out["jena_only_details"] = result.JenaOnly
	}

	writeJSON(w, http.StatusOK, out)
}
