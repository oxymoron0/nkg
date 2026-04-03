package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerUpdatePage(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"update_page",
		mcp.WithDescription("Update properties of a knowledge page. Provide id or name to identify the page, then the properties to update."),
		mcp.WithString("id", mcp.Description("Notion page ID")),
		mcp.WithString("name", mcp.Description("Page name (for identification; must match exactly one)")),
		mcp.WithString("new_name", mcp.Description("New title for the page")),
		mcp.WithString("summary", mcp.Description("New summary text")),
		mcp.WithString("exact_match", mcp.Description("Set skos:exactMatch value")),
		mcp.WithString("close_match", mcp.Description("Set skos:closeMatch URL")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		id := stringArg(args, "id", "")
		name := stringArg(args, "name", "")
		newName := stringArg(args, "new_name", "")
		summary := stringArg(args, "summary", "")
		exactMatch := stringArg(args, "exact_match", "")
		closeMatch := stringArg(args, "close_match", "")

		if id == "" && name == "" {
			return toolError("either 'id' or 'name' is required"), nil
		}

		var pageID, pageName string
		if id != "" {
			pageID = id
			p, err := api.GetPage(ctx, c, id)
			if err != nil {
				return toolError("page not found: %v", err), nil
			}
			pageName = p.Name
		} else {
			var err error
			pageID, pageName, err = api.ResolvePageRef(ctx, c, name)
			if err != nil {
				return toolError("%v", err), nil
			}
		}

		// Build update properties
		properties := make(map[string]any)

		if newName != "" {
			properties["Name"] = map[string]any{
				"title": []map[string]any{
					{"text": map[string]any{"content": newName}},
				},
			}
			pageName = newName
		}

		if summary != "" {
			properties["Summary"] = map[string]any{
				"rich_text": []map[string]any{
					{"text": map[string]any{"content": summary}},
				},
			}
		}

		if exactMatch != "" {
			properties["skos:exactMatch"] = map[string]any{
				"rich_text": []map[string]any{
					{"text": map[string]any{"content": exactMatch}},
				},
			}
		}

		if closeMatch != "" {
			properties["skos:closeMatch"] = map[string]any{
				"url": closeMatch,
			}
		}

		if len(properties) == 0 {
			return toolError("no properties to update — provide at least one of: new_name, summary, exact_match, close_match"), nil
		}

		if err := api.UpdatePageProperties(ctx, c, pageID, properties); err != nil {
			return toolError("update failed: %v", err), nil
		}

		out := map[string]any{
			"updated": true,
			"page": map[string]any{
				"id":   pageID,
				"name": pageName,
			},
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
