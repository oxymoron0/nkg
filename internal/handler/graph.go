package handler

import (
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/leorca/nkg/internal/api"
)

type graphNode struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Summary string `json:"summary,omitempty"`
	Group   string `json:"group"`
}

type graphEdge struct {
	ID       string `json:"id"`
	Source   string `json:"source"`
	Target   string `json:"target"`
	Label    string `json:"label"`
	Relation string `json:"relation"`
}

type graphMeta struct {
	NodeCount int      `json:"node_count"`
	EdgeCount int      `json:"edge_count"`
	Relations []string `json:"relations"`
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var allowedRelations map[string]bool
	if relParam := r.URL.Query().Get("relations"); relParam != "" {
		allowedRelations = make(map[string]bool)
		for _, rel := range strings.Split(relParam, ",") {
			allowedRelations[strings.TrimSpace(rel)] = true
		}
	}

	pages, err := api.QueryPages(ctx, s.nc, nil, 0)
	if err != nil {
		internalError(w, "failed to fetch graph data", err)
		return
	}

	nodes := make([]graphNode, 0, len(pages))
	pageIDs := make(map[string]bool, len(pages))
	for _, p := range pages {
		nodes = append(nodes, graphNode{
			ID:      p.ID,
			Label:   p.Name,
			Summary: p.Summary,
			Group:   "concept",
		})
		pageIDs[p.ID] = true
	}

	edgeSet := make(map[string]bool)
	var edges []graphEdge
	relationSet := make(map[string]bool)

	for _, p := range pages {
		full, err := api.GetPageFull(ctx, s.nc, p.ID)
		if err != nil {
			log.Printf("handleGraph: get page %s: %v", p.Name, err)
			continue
		}

		for rel, refs := range full.Relations {
			if allowedRelations != nil && !allowedRelations[rel] {
				continue
			}
			for _, ref := range refs {
				if !pageIDs[ref.ID] {
					continue
				}
				edgeID := p.ID + "|" + rel + "|" + ref.ID
				if edgeSet[edgeID] {
					continue
				}
				edgeSet[edgeID] = true
				relationSet[rel] = true
				edges = append(edges, graphEdge{
					ID:       edgeID,
					Source:   p.ID,
					Target:   ref.ID,
					Label:    rel,
					Relation: rel,
				})
			}
		}
	}

	relations := make([]string, 0, len(relationSet))
	for rel := range relationSet {
		relations = append(relations, rel)
	}
	sort.Strings(relations)

	writeJSON(w, http.StatusOK, map[string]any{
		"nodes": nodes,
		"edges": edges,
		"meta": graphMeta{
			NodeCount: len(nodes),
			EdgeCount: len(edges),
			Relations: relations,
		},
	})
}
