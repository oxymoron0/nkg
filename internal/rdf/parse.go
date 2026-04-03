package rdf

import (
	"strings"

	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/model"
)

// ParseConcepts converts SPARQL bindings (from AllConcepts query) to Pages.
func ParseConcepts(bindings []map[string]jena.Value) []model.Page {
	pages := make([]model.Page, 0, len(bindings))
	for _, row := range bindings {
		page := model.Page{
			ID:        extractPageID(row["id"].Value),
			Name:      row["label"].Value,
			Relations: make(map[string][]model.Ref),
		}
		if v, ok := row["description"]; ok {
			page.Summary = v.Value
		}
		if v, ok := row["created"]; ok {
			page.CreatedTime = v.Value
		}
		if v, ok := row["modified"]; ok {
			page.LastEditedTime = v.Value
		}
		if v, ok := row["exactMatch"]; ok {
			page.ExactMatch = v.Value
		}
		if v, ok := row["closeMatch"]; ok {
			page.CloseMatch = v.Value
		}
		pages = append(pages, page)
	}
	return pages
}

// Triple represents a single subject-predicate-object relation.
type Triple struct {
	FromID   string `json:"from_id"`
	ToID     string `json:"to_id"`
	Relation string `json:"relation"`
}

// ParseRelationTriples converts SPARQL bindings (from AllRelations query) to Triples.
func ParseRelationTriples(bindings []map[string]jena.Value) []Triple {
	triples := make([]Triple, 0, len(bindings))
	for _, row := range bindings {
		predURI := row["predicate"].Value
		rel, ok := model.URIToRelation[predURI]
		if !ok {
			continue
		}
		triples = append(triples, Triple{
			FromID:   extractPageID(row["from"].Value),
			ToID:     extractPageID(row["to"].Value),
			Relation: rel,
		})
	}
	return triples
}

// extractPageID extracts the page ID from a concept URI.
// e.g. "http://knowledge.local/concept/abc123" → "abc123"
func extractPageID(uri string) string {
	prefix := model.NSConcept
	if strings.HasPrefix(uri, prefix) {
		return uri[len(prefix):]
	}
	return uri
}
