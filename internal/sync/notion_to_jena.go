package sync

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/model"
	"github.com/leorca/nkg/internal/rdf"
)

// SyncResult summarizes the outcome of a sync operation.
type SyncResult struct {
	Synced int      `json:"synced"`
	Errors []string `json:"errors,omitempty"`
}

const batchSize = 10

// FullSync reads all Notion pages and replaces the Jena named graph entirely.
// Pages are inserted in batches to avoid timeout on large datasets.
// Uses context.Background() for API calls to prevent MCP context cancellation.
func FullSync(_ context.Context, nc *client.Client, jc *jena.Client) (*SyncResult, error) {
	ctx := context.Background()

	// 1. Fetch all pages from Notion (lightweight, no relations)
	pages, err := api.QueryPages(ctx, nc, nil, 0)
	if err != nil {
		return nil, fmt.Errorf("query all pages: %w", err)
	}

	// 2. Drop the existing NKG graph
	if err := jc.Update(ctx, rdf.DropGraph(model.NSGraph)); err != nil {
		return nil, fmt.Errorf("drop graph: %w", err)
	}

	// 3. Fetch full pages and insert in batches
	var errs []string
	synced := 0

	for i := 0; i < len(pages); i += batchSize {
		end := i + batchSize
		if end > len(pages) {
			end = len(pages)
		}
		batch := pages[i:end]

		var sparql strings.Builder
		for _, p := range batch {
			full, err := api.GetPageFull(ctx, nc, p.ID)
			if err != nil {
				errs = append(errs, fmt.Sprintf("get page %s: %v", p.Name, err))
				continue
			}
			sparql.WriteString(rdf.PageToInsert(full) + ";\n")
			synced++
		}

		if sparql.Len() > 0 {
			if err := jc.Update(ctx, sparql.String()); err != nil {
				errs = append(errs, fmt.Sprintf("insert batch %d-%d: %v", i, end-1, err))
			}
		}
	}

	// 4. Set watermark
	now := time.Now().UTC().Format(time.RFC3339)
	if err := jc.Update(ctx, rdf.SetWatermark(model.NSMeta, now)); err != nil {
		errs = append(errs, fmt.Sprintf("set watermark: %v", err))
	}

	return &SyncResult{
		Synced: synced,
		Errors: errs,
	}, nil
}

// IncrementalSync reads Notion changes since the last watermark and updates Jena.
// Uses context.Background() for API calls to prevent MCP context cancellation.
func IncrementalSync(_ context.Context, nc *client.Client, jc *jena.Client) (*SyncResult, error) {
	ctx := context.Background()

	// 1. Get watermark
	watermark, err := getWatermark(ctx, jc)
	if err != nil {
		return nil, fmt.Errorf("get watermark: %w", err)
	}

	// 2. Query pages edited after watermark
	filter := lastEditedAfterFilter(watermark)
	pages, err := api.QueryPages(ctx, nc, filter, 0)
	if err != nil {
		return nil, fmt.Errorf("query changed pages: %w", err)
	}

	if len(pages) == 0 {
		return &SyncResult{Synced: 0}, nil
	}

	// 3. For each changed page: delete old triples, insert new (in batches)
	var errs []string
	synced := 0

	for i := 0; i < len(pages); i += batchSize {
		end := i + batchSize
		if end > len(pages) {
			end = len(pages)
		}
		batch := pages[i:end]

		var sparql strings.Builder
		for _, p := range batch {
			full, err := api.GetPageFull(ctx, nc, p.ID)
			if err != nil {
				errs = append(errs, fmt.Sprintf("get page %s: %v", p.Name, err))
				continue
			}
			sparql.WriteString(rdf.PageToDelete(p.ID) + ";\n")
			sparql.WriteString(rdf.PageToInsert(full) + ";\n")
			synced++
		}

		if sparql.Len() > 0 {
			if err := jc.Update(ctx, sparql.String()); err != nil {
				errs = append(errs, fmt.Sprintf("update batch %d-%d: %v", i, end-1, err))
			}
		}
	}

	// 4. Update watermark
	now := time.Now().UTC().Format(time.RFC3339)
	if err := jc.Update(ctx, rdf.SetWatermark(model.NSMeta, now)); err != nil {
		errs = append(errs, fmt.Sprintf("set watermark: %v", err))
	}

	return &SyncResult{
		Synced: synced,
		Errors: errs,
	}, nil
}

// getWatermark reads the last sync timestamp from Jena meta graph.
func getWatermark(ctx context.Context, jc *jena.Client) (string, error) {
	bindings, err := jc.Query(ctx, rdf.GetWatermark(model.NSMeta))
	if err != nil {
		return "", err
	}
	if len(bindings) == 0 {
		return "", nil // no watermark = first sync, treat as epoch
	}
	return bindings[0]["ts"].Value, nil
}

// lastEditedAfterFilter returns a Notion API filter for pages edited after timestamp.
func lastEditedAfterFilter(timestamp string) map[string]any {
	if timestamp == "" {
		return nil
	}
	return map[string]any{
		"timestamp": "last_edited_time",
		"last_edited_time": map[string]any{
			"after": timestamp,
		},
	}
}
