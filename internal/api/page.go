package api

import (
	"context"
	"fmt"
	"strings"

	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/model"
)

// GetPage retrieves a page by ID with basic properties.
func GetPage(ctx context.Context, c *client.Client, pageID string) (*model.Page, error) {
	path := fmt.Sprintf("/pages/%s", pageID)
	data, err := c.Do(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	page, err := parsePageFromResult(data)
	if err != nil {
		return nil, err
	}
	return &page, nil
}

// GetPageFull retrieves a page with all relations fully resolved (names included).
// It fetches the database schema for property IDs, then paginates relations with has_more.
func GetPageFull(ctx context.Context, c *client.Client, pageID string) (*model.Page, error) {
	page, err := GetPage(ctx, c, pageID)
	if err != nil {
		return nil, err
	}

	// Get property IDs from database schema
	propIDs, err := GetDatabaseSchema(ctx, c)
	if err != nil {
		return nil, fmt.Errorf("get schema for relation pagination: %w", err)
	}

	// For relations, check if we need to paginate (Notion truncates at 25)
	// Re-fetch full relation lists using property-level endpoint
	for _, relName := range model.RelationProperties {
		propID, ok := propIDs[relName]
		if !ok {
			continue
		}

		ids, err := GetRelationPropertyIDs(ctx, c, pageID, propID)
		if err != nil {
			// Non-fatal: keep partial data
			continue
		}

		refs := make([]model.Ref, 0, len(ids))
		for _, id := range ids {
			refs = append(refs, model.Ref{ID: strings.ReplaceAll(id, "-", "")})
		}
		page.Relations[relName] = refs
	}

	// Resolve relation IDs to names
	if err := resolveRelationNames(ctx, c, page); err != nil {
		// Non-fatal: IDs are still available
		_ = err
	}

	return page, nil
}

// resolveRelationNames fetches page names for all relation references.
func resolveRelationNames(ctx context.Context, c *client.Client, page *model.Page) error {
	// Collect unique IDs
	seen := make(map[string]bool)
	var idsToResolve []string
	for _, refs := range page.Relations {
		for _, ref := range refs {
			if ref.ID != "" && !seen[ref.ID] {
				seen[ref.ID] = true
				idsToResolve = append(idsToResolve, ref.ID)
			}
		}
	}

	if len(idsToResolve) == 0 {
		return nil
	}

	// Fetch names
	nameCache := make(map[string]string)
	for _, id := range idsToResolve {
		p, err := GetPage(ctx, c, id)
		if err != nil {
			continue
		}
		nameCache[id] = p.Name
	}

	// Apply names to refs
	for relName, refs := range page.Relations {
		for i := range refs {
			if name, ok := nameCache[refs[i].ID]; ok {
				refs[i].Name = name
			}
		}
		page.Relations[relName] = refs
	}

	return nil
}

// CreatePage creates a new page in the database.
func CreatePage(ctx context.Context, c *client.Client, name, summary string) (*model.Page, error) {
	properties := map[string]any{
		"Name": map[string]any{
			"title": []map[string]any{
				{"text": map[string]any{"content": name}},
			},
		},
	}

	if summary != "" {
		properties["Summary"] = map[string]any{
			"rich_text": []map[string]any{
				{"text": map[string]any{"content": summary}},
			},
		}
	}

	body := map[string]any{
		"parent": map[string]any{
			"database_id": c.DatabaseID,
		},
		"properties": properties,
	}

	data, err := c.Do(ctx, "POST", "/pages", body)
	if err != nil {
		return nil, fmt.Errorf("create page: %w", err)
	}

	page, err := parsePageFromResult(data)
	if err != nil {
		return nil, err
	}
	return &page, nil
}

// ArchivePage archives (soft-deletes) a page by setting archived: true.
func ArchivePage(ctx context.Context, c *client.Client, pageID string) error {
	body := map[string]any{
		"archived": true,
	}

	path := fmt.Sprintf("/pages/%s", pageID)
	_, err := c.Do(ctx, "PATCH", path, body)
	if err != nil {
		return fmt.Errorf("archive page: %w", err)
	}
	return nil
}

// UpdatePageProperties updates the specified properties on a page.
func UpdatePageProperties(ctx context.Context, c *client.Client, pageID string, properties map[string]any) error {
	body := map[string]any{
		"properties": properties,
	}

	path := fmt.Sprintf("/pages/%s", pageID)
	_, err := c.Do(ctx, "PATCH", path, body)
	if err != nil {
		return fmt.Errorf("update page: %w", err)
	}
	return nil
}

// GetRelationIDs gets the current list of related page IDs for a relation property.
func GetRelationIDs(ctx context.Context, c *client.Client, pageID, relationName string) ([]string, error) {
	propIDs, err := GetDatabaseSchema(ctx, c)
	if err != nil {
		return nil, err
	}

	propID, ok := propIDs[relationName]
	if !ok {
		return nil, fmt.Errorf("relation property %q not found in database schema", relationName)
	}

	return GetRelationPropertyIDs(ctx, c, pageID, propID)
}

// SetRelation sets the full list of related page IDs for a relation property.
func SetRelation(ctx context.Context, c *client.Client, pageID, relationName string, targetIDs []string) error {
	relations := make([]map[string]any, len(targetIDs))
	for i, id := range targetIDs {
		relations[i] = map[string]any{"id": id}
	}

	properties := map[string]any{
		relationName: map[string]any{
			"relation": relations,
		},
	}

	return UpdatePageProperties(ctx, c, pageID, properties)
}
