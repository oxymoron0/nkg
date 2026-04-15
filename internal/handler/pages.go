package handler

import (
	"net/http"
	"strconv"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/model"
)

func (s *Server) handleListPages(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	name := r.URL.Query().Get("name")
	exactStr := r.URL.Query().Get("exact")
	limitStr := r.URL.Query().Get("limit")

	limit := 0
	if limitStr != "" {
		v, err := strconv.Atoi(limitStr)
		if err != nil || v < 0 {
			writeError(w, http.StatusBadRequest, "limit must be a non-negative integer")
			return
		}
		limit = v
	}

	var filter any
	if name != "" {
		exact := exactStr == "true"
		filter = model.TitleFilter(name, exact)
	}

	pages, err := api.QueryPages(ctx, s.nc, filter, limit)
	if err != nil {
		internalError(w, "failed to query pages", err)
		return
	}

	type pageSummary struct {
		ID             string `json:"id"`
		Name           string `json:"name"`
		Summary        string `json:"summary,omitempty"`
		LastEditedTime string `json:"last_edited_time,omitempty"`
	}

	result := make([]pageSummary, len(pages))
	for i, p := range pages {
		result[i] = pageSummary{
			ID:             p.ID,
			Name:           p.Name,
			Summary:        p.Summary,
			LastEditedTime: p.LastEditedTime,
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"count": len(result),
		"pages": result,
	})
}

func (s *Server) handleGetPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	pageID := r.PathValue("id")

	page, err := api.GetPageFull(ctx, s.nc, pageID)
	if err != nil {
		internalError(w, "failed to retrieve page", err)
		return
	}

	cleanRelations := make(map[string][]model.Ref)
	for rel, refs := range page.Relations {
		if len(refs) > 0 {
			cleanRelations[rel] = refs
		}
	}
	page.Relations = cleanRelations

	writeJSON(w, http.StatusOK, page)
}
