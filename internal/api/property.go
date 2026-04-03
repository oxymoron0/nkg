package api

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/leorca/nkg/internal/client"
)

// GetRelationPropertyIDs retrieves all related page IDs for a relation property,
// handling cursor-based pagination.
func GetRelationPropertyIDs(ctx context.Context, c *client.Client, pageID, propertyID string) ([]string, error) {
	var allIDs []string
	cursor := ""

	for {
		path := fmt.Sprintf("/pages/%s/properties/%s", pageID, propertyID)
		if cursor != "" {
			path += "?start_cursor=" + cursor
		}

		data, err := c.Do(ctx, "GET", path, nil)
		if err != nil {
			return nil, fmt.Errorf("get relation property: %w", err)
		}

		var resp struct {
			Results []struct {
				Relation struct {
					ID string `json:"id"`
				} `json:"relation"`
			} `json:"results"`
			HasMore    bool   `json:"has_more"`
			NextCursor string `json:"next_cursor"`
			// For non-paginated (single value) responses
			Relation *struct {
				ID string `json:"id"`
			} `json:"relation"`
		}

		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, fmt.Errorf("parse relation property: %w", err)
		}

		// Handle single-value response (when property has few items)
		if resp.Relation != nil && resp.Relation.ID != "" {
			allIDs = append(allIDs, resp.Relation.ID)
			return allIDs, nil
		}

		for _, r := range resp.Results {
			if r.Relation.ID != "" {
				allIDs = append(allIDs, r.Relation.ID)
			}
		}

		if !resp.HasMore {
			break
		}
		cursor = resp.NextCursor
	}

	return allIDs, nil
}
