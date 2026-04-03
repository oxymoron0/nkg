package api

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/model"
)

// QueryPages queries the database with the given filter and returns all matching pages.
// It handles cursor-based pagination automatically.
func QueryPages(ctx context.Context, c *client.Client, filter any, limit int) ([]model.Page, error) {
	var allPages []model.Page
	cursor := ""

	for {
		pageSize := 100
		if limit > 0 {
			remaining := limit - len(allPages)
			if remaining <= 0 {
				break
			}
			if remaining < pageSize {
				pageSize = remaining
			}
		}

		reqBody := model.QueryRequest{
			Filter:   filter,
			PageSize: pageSize,
			Sorts: []model.SortObject{
				{Timestamp: "last_edited_time", Direction: "descending"},
			},
		}
		if cursor != "" {
			reqBody.StartCursor = cursor
		}

		path := fmt.Sprintf("/databases/%s/query", c.DatabaseID)
		data, err := c.Do(ctx, "POST", path, reqBody)
		if err != nil {
			return nil, fmt.Errorf("query database: %w", err)
		}

		var resp struct {
			Results    []json.RawMessage `json:"results"`
			HasMore    bool              `json:"has_more"`
			NextCursor string            `json:"next_cursor"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, fmt.Errorf("parse query response: %w", err)
		}

		for _, raw := range resp.Results {
			page, err := parsePageFromResult(raw)
			if err != nil {
				return nil, err
			}
			allPages = append(allPages, page)
		}

		if !resp.HasMore || (limit > 0 && len(allPages) >= limit) {
			break
		}
		cursor = resp.NextCursor
	}

	return allPages, nil
}

// FindPageByName searches for pages by title.
func FindPageByName(ctx context.Context, c *client.Client, name string, exact bool) ([]model.Page, error) {
	filter := model.TitleFilter(name, exact)
	return QueryPages(ctx, c, filter, 0)
}

// ResolvePageRef resolves a page reference (ID or name) to a page ID and name.
// If the input looks like a Notion page ID (32 hex chars), it fetches by ID.
// Otherwise, it searches by name (exact match).
func ResolvePageRef(ctx context.Context, c *client.Client, ref string) (string, string, error) {
	cleaned := strings.ReplaceAll(ref, "-", "")
	if len(cleaned) == 32 && isHex(cleaned) {
		page, err := GetPage(ctx, c, cleaned)
		if err != nil {
			return "", "", fmt.Errorf("page not found by ID %q: %w", ref, err)
		}
		return page.ID, page.Name, nil
	}

	pages, err := FindPageByName(ctx, c, ref, true)
	if err != nil {
		return "", "", err
	}

	switch len(pages) {
	case 0:
		return "", "", fmt.Errorf("no page found with name %q", ref)
	case 1:
		return pages[0].ID, pages[0].Name, nil
	default:
		names := make([]string, len(pages))
		for i, p := range pages {
			names[i] = fmt.Sprintf("%s (%s)", p.Name, p.ID)
		}
		return "", "", fmt.Errorf("multiple pages match %q: %s — use page ID instead", ref, strings.Join(names, ", "))
	}
}

// GetDatabaseSchema retrieves the database schema to get property IDs.
func GetDatabaseSchema(ctx context.Context, c *client.Client) (map[string]string, error) {
	path := fmt.Sprintf("/databases/%s", c.DatabaseID)
	data, err := c.Do(ctx, "GET", path, nil)
	if err != nil {
		return nil, fmt.Errorf("get database: %w", err)
	}

	var resp struct {
		Properties map[string]struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("parse database schema: %w", err)
	}

	propIDs := make(map[string]string, len(resp.Properties))
	for name, prop := range resp.Properties {
		propIDs[name] = prop.ID
	}
	return propIDs, nil
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// parsePageFromResult extracts a Page from a Notion API page result JSON.
func parsePageFromResult(raw json.RawMessage) (model.Page, error) {
	var result struct {
		ID         string `json:"id"`
		CreatedTime    string `json:"created_time"`
		LastEditedTime string `json:"last_edited_time"`
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return model.Page{}, fmt.Errorf("parse page result: %w", err)
	}

	page := model.Page{
		ID:             strings.ReplaceAll(result.ID, "-", ""),
		CreatedTime:    result.CreatedTime,
		LastEditedTime: result.LastEditedTime,
		Relations:      make(map[string][]model.Ref),
	}

	// Parse title (Name)
	if titleRaw, ok := result.Properties["Name"]; ok {
		var titleProp struct {
			Title []struct {
				PlainText string `json:"plain_text"`
			} `json:"title"`
		}
		if err := json.Unmarshal(titleRaw, &titleProp); err == nil {
			for _, t := range titleProp.Title {
				page.Name += t.PlainText
			}
		}
	}

	// Parse rich_text (Summary)
	if summaryRaw, ok := result.Properties["Summary"]; ok {
		var rtProp struct {
			RichText []struct {
				PlainText string `json:"plain_text"`
			} `json:"rich_text"`
		}
		if err := json.Unmarshal(summaryRaw, &rtProp); err == nil {
			for _, t := range rtProp.RichText {
				page.Summary += t.PlainText
			}
		}
	}

	// Parse exactMatch
	if emRaw, ok := result.Properties["skos:exactMatch"]; ok {
		var rtProp struct {
			RichText []struct {
				PlainText string `json:"plain_text"`
			} `json:"rich_text"`
		}
		if err := json.Unmarshal(emRaw, &rtProp); err == nil {
			for _, t := range rtProp.RichText {
				page.ExactMatch += t.PlainText
			}
		}
	}

	// Parse closeMatch (URL type)
	if cmRaw, ok := result.Properties["skos:closeMatch"]; ok {
		var urlProp struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(cmRaw, &urlProp); err == nil {
			page.CloseMatch = urlProp.URL
		}
	}

	// Parse relation properties
	for _, relName := range model.RelationProperties {
		relRaw, ok := result.Properties[relName]
		if !ok {
			continue
		}
		var relProp struct {
			Relation []struct {
				ID string `json:"id"`
			} `json:"relation"`
			HasMore bool `json:"has_more"`
		}
		if err := json.Unmarshal(relRaw, &relProp); err == nil {
			refs := make([]model.Ref, 0, len(relProp.Relation))
			for _, r := range relProp.Relation {
				refs = append(refs, model.Ref{ID: strings.ReplaceAll(r.ID, "-", "")})
			}
			page.Relations[relName] = refs
		}
	}

	return page, nil
}
