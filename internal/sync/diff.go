package sync

import (
	"context"
	"fmt"
	"strings"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/model"
	"github.com/leorca/nkg/internal/rdf"
)

// DiffResult summarizes the differences between Notion and Jena states.
type DiffResult struct {
	NotionOnly []rdf.Triple `json:"notion_only,omitempty"`
	JenaOnly   []rdf.Triple `json:"jena_only,omitempty"`
	Consistent int          `json:"consistent"`
}

// DiffState compares Notion and Jena relation states and returns differences.
// Uses context.Background() to prevent MCP context cancellation on long operations.
func DiffState(_ context.Context, nc *client.Client, jc *jena.Client) (*DiffResult, error) {
	ctx := context.Background()

	// 1. Get all Notion relations
	notionTriples, err := collectNotionTriples(ctx, nc)
	if err != nil {
		return nil, fmt.Errorf("collect notion triples: %w", err)
	}

	// 2. Get all Jena relations
	bindings, err := jc.Query(ctx, rdf.AllRelations(model.NSGraph))
	if err != nil {
		return nil, fmt.Errorf("query jena relations: %w", err)
	}
	jenaTriples := rdf.ParseRelationTriples(bindings)

	// 3. Build sets and compare
	notionSet := tripleSet(notionTriples)
	jenaSet := tripleSet(jenaTriples)

	result := &DiffResult{}

	for key, t := range notionSet {
		if _, ok := jenaSet[key]; ok {
			result.Consistent++
		} else {
			result.NotionOnly = append(result.NotionOnly, t)
		}
	}

	for key, t := range jenaSet {
		if _, ok := notionSet[key]; !ok {
			result.JenaOnly = append(result.JenaOnly, t)
		}
	}

	return result, nil
}

// collectNotionTriples fetches all pages and their relations from Notion.
func collectNotionTriples(ctx context.Context, nc *client.Client) ([]rdf.Triple, error) {
	pages, err := api.QueryPages(ctx, nc, nil, 0)
	if err != nil {
		return nil, err
	}

	var triples []rdf.Triple
	for _, p := range pages {
		full, err := api.GetPageFull(ctx, nc, p.ID)
		if err != nil {
			continue
		}
		for rel, refs := range full.Relations {
			if _, ok := model.RelationToURI[rel]; !ok {
				continue
			}
			for _, ref := range refs {
				triples = append(triples, rdf.Triple{
					FromID:   strings.ReplaceAll(full.ID, "-", ""),
					ToID:     strings.ReplaceAll(ref.ID, "-", ""),
					Relation: rel,
				})
			}
		}
	}
	return triples, nil
}

// tripleSet creates a lookup map keyed by "fromID|relation|toID".
func tripleSet(triples []rdf.Triple) map[string]rdf.Triple {
	set := make(map[string]rdf.Triple, len(triples))
	for _, t := range triples {
		key := t.FromID + "|" + t.Relation + "|" + t.ToID
		set[key] = t
	}
	return set
}
