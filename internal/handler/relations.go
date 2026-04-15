package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/model"
	pkgsync "github.com/leorca/nkg/internal/sync"
)

type relationRequest struct {
	TargetID string `json:"target_id"`
	Relation string `json:"relation"`
}

func (s *Server) handleLinkRelation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	fromID := r.PathValue("id")

	var req relationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.TargetID == "" || req.Relation == "" {
		writeError(w, http.StatusBadRequest, "'target_id' and 'relation' are required")
		return
	}

	if !model.ValidRelation(req.Relation) {
		writeError(w, http.StatusBadRequest, "invalid relation: "+req.Relation)
		return
	}

	jenaSynced := false

	if s.jc != nil {
		if err := pkgsync.LinkWithSync(ctx, s.nc, s.jc, fromID, req.TargetID, req.Relation); err != nil {
			internalError(w, "failed to link relation", err)
			return
		}
		jenaSynced = true
	} else {
		currentIDs, err := api.GetRelationIDs(ctx, s.nc, fromID, req.Relation)
		if err != nil {
			internalError(w, "failed to read relations", err)
			return
		}

		cleanToID := strings.ReplaceAll(req.TargetID, "-", "")
		for _, id := range currentIDs {
			if strings.ReplaceAll(id, "-", "") == cleanToID {
				writeJSON(w, http.StatusOK, map[string]any{"linked": true, "already_existed": true})
				return
			}
		}

		newIDs := make([]string, len(currentIDs)+1)
		copy(newIDs, currentIDs)
		newIDs[len(currentIDs)] = req.TargetID

		if err := api.SetRelation(ctx, s.nc, fromID, req.Relation, newIDs); err != nil {
			internalError(w, "failed to set relation", err)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"linked":      true,
		"from":        fromID,
		"to":          req.TargetID,
		"relation":    req.Relation,
		"jena_synced": jenaSynced,
	})
}

func (s *Server) handleUnlinkRelation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	fromID := r.PathValue("id")

	var req relationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.TargetID == "" || req.Relation == "" {
		writeError(w, http.StatusBadRequest, "'target_id' and 'relation' are required")
		return
	}

	if !model.ValidRelation(req.Relation) {
		writeError(w, http.StatusBadRequest, "invalid relation: "+req.Relation)
		return
	}

	jenaSynced := false

	if s.jc != nil {
		if err := pkgsync.UnlinkWithSync(ctx, s.nc, s.jc, fromID, req.TargetID, req.Relation); err != nil {
			internalError(w, "failed to unlink relation", err)
			return
		}
		jenaSynced = true
	} else {
		currentIDs, err := api.GetRelationIDs(ctx, s.nc, fromID, req.Relation)
		if err != nil {
			internalError(w, "failed to read relations", err)
			return
		}

		cleanToID := strings.ReplaceAll(req.TargetID, "-", "")
		filtered := make([]string, 0, len(currentIDs))
		found := false
		for _, id := range currentIDs {
			if strings.ReplaceAll(id, "-", "") == cleanToID {
				found = true
				continue
			}
			filtered = append(filtered, id)
		}

		if !found {
			writeJSON(w, http.StatusOK, map[string]any{"unlinked": true, "already_absent": true})
			return
		}

		if err := api.SetRelation(ctx, s.nc, fromID, req.Relation, filtered); err != nil {
			internalError(w, "failed to set relation", err)
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"unlinked":    true,
		"from":        fromID,
		"to":          req.TargetID,
		"relation":    req.Relation,
		"jena_synced": jenaSynced,
	})
}
