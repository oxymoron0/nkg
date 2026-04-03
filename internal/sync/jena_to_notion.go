package sync

import (
	"context"
	"fmt"
	"strings"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/rdf"
)

// LinkWithSync adds a relation in both Jena and Notion with compensating transaction.
// Order: Jena first → Notion second → rollback Jena on Notion failure.
// Uses context.Background() to prevent MCP context cancellation.
func LinkWithSync(_ context.Context, nc *client.Client, jc *jena.Client,
	fromID, toID, relation string) error {
	ctx := context.Background()

	// 1. Insert triple into Jena
	insertSPARQL := rdf.TripleInsert(fromID, toID, relation)
	if err := jc.Update(ctx, insertSPARQL); err != nil {
		return fmt.Errorf("jena insert: %w", err)
	}

	// 2. Link in Notion (read-modify-write)
	currentIDs, err := api.GetRelationIDs(ctx, nc, fromID, relation)
	if err != nil {
		// Compensate: remove from Jena
		_ = jc.Update(ctx, rdf.TripleDelete(fromID, toID, relation))
		return fmt.Errorf("notion get relations (jena rolled back): %w", err)
	}

	// Check idempotency
	cleanToID := strings.ReplaceAll(toID, "-", "")
	for _, id := range currentIDs {
		if strings.ReplaceAll(id, "-", "") == cleanToID {
			return nil // already linked in both
		}
	}

	newIDs := append(currentIDs, toID)
	if err := api.SetRelation(ctx, nc, fromID, relation, newIDs); err != nil {
		// Compensate: remove from Jena
		rollbackErr := jc.Update(ctx, rdf.TripleDelete(fromID, toID, relation))
		if rollbackErr != nil {
			return fmt.Errorf("notion set relation failed: %w; jena rollback also failed: %v (INCONSISTENT STATE)", err, rollbackErr)
		}
		return fmt.Errorf("notion set relation (jena rolled back): %w", err)
	}

	return nil
}

// UnlinkWithSync removes a relation from both Jena and Notion with compensating transaction.
// Order: Jena first → Notion second → rollback Jena on Notion failure.
// Uses context.Background() to prevent MCP context cancellation.
func UnlinkWithSync(_ context.Context, nc *client.Client, jc *jena.Client,
	fromID, toID, relation string) error {
	ctx := context.Background()

	// 1. Delete triple from Jena
	deleteSPARQL := rdf.TripleDelete(fromID, toID, relation)
	if err := jc.Update(ctx, deleteSPARQL); err != nil {
		return fmt.Errorf("jena delete: %w", err)
	}

	// 2. Unlink in Notion (read-modify-write)
	currentIDs, err := api.GetRelationIDs(ctx, nc, fromID, relation)
	if err != nil {
		// Compensate: re-insert into Jena
		_ = jc.Update(ctx, rdf.TripleInsert(fromID, toID, relation))
		return fmt.Errorf("notion get relations (jena rolled back): %w", err)
	}

	cleanToID := strings.ReplaceAll(toID, "-", "")
	filtered := make([]string, 0, len(currentIDs))
	for _, id := range currentIDs {
		if strings.ReplaceAll(id, "-", "") != cleanToID {
			filtered = append(filtered, id)
		}
	}

	if len(filtered) == len(currentIDs) {
		return nil // not linked in Notion, Jena delete was idempotent
	}

	if err := api.SetRelation(ctx, nc, fromID, relation, filtered); err != nil {
		// Compensate: re-insert into Jena
		rollbackErr := jc.Update(ctx, rdf.TripleInsert(fromID, toID, relation))
		if rollbackErr != nil {
			return fmt.Errorf("notion set relation failed: %w; jena rollback also failed: %v (INCONSISTENT STATE)", err, rollbackErr)
		}
		return fmt.Errorf("notion set relation (jena rolled back): %w", err)
	}

	return nil
}
