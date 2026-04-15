package handler

import (
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/model"
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

// parseRelationFilter parses a comma-separated list from the `relations` query
// parameter into a set. Returns nil when no filter is specified (meaning all
// relations are allowed).
func parseRelationFilter(raw string) map[string]bool {
	if raw == "" {
		return nil
	}
	allowed := make(map[string]bool)
	for _, rel := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(rel); trimmed != "" {
			allowed[trimmed] = true
		}
	}
	if len(allowed) == 0 {
		return nil
	}
	return allowed
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	allowed := parseRelationFilter(r.URL.Query().Get("relations"))

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

	// Lazy-load the database schema only when at least one page has a
	// truncated relation property — the common case has no truncation and
	// pays zero extra Notion API calls.
	var propIDs map[string]string
	ensureSchema := func() (map[string]string, error) {
		if propIDs != nil {
			return propIDs, nil
		}
		m, err := api.GetDatabaseSchema(ctx, s.nc)
		if err != nil {
			return nil, err
		}
		propIDs = m
		return propIDs, nil
	}

	edgeSet := make(map[string]bool)
	relationSet := make(map[string]bool)
	var edges []graphEdge

	for _, p := range pages {
		for rel, refs := range p.Relations {
			if allowed != nil && !allowed[rel] {
				continue
			}

			if p.RelationTruncated[rel] {
				schema, err := ensureSchema()
				if err != nil {
					log.Printf("handleGraph: schema fetch failed (keeping truncated list for %s/%s): %v", p.ID, rel, err)
				} else if pid, ok := schema[rel]; ok {
					ids, err := api.GetRelationPropertyIDs(ctx, s.nc, p.ID, pid)
					if err != nil {
						log.Printf("handleGraph: pagination failed for %s/%s (keeping truncated list): %v", p.ID, rel, err)
					} else {
						refs = make([]model.Ref, len(ids))
						for i, id := range ids {
							refs[i] = model.Ref{ID: id}
						}
					}
				}
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
