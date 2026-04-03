package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerDeletePage(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"delete_page",
		mcp.WithDescription("Archive (soft-delete) a knowledge page. The page can be restored from Notion's trash. Provide either id or name."),
		mcp.WithString("id", mcp.Description("Notion page ID")),
		mcp.WithString("name", mcp.Description("Page name (must match exactly one page)")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		id := stringArg(args, "id", "")
		name := stringArg(args, "name", "")

		if id == "" && name == "" {
			return toolError("either 'id' or 'name' is required"), nil
		}

		var pageID, pageName string
		if id != "" {
			p, err := api.GetPage(ctx, c, id)
			if err != nil {
				return toolError("page not found: %v", err), nil
			}
			pageID, pageName = p.ID, p.Name
		} else {
			var err error
			pageID, pageName, err = api.ResolvePageRef(ctx, c, name)
			if err != nil {
				return toolError("%v", err), nil
			}
		}

		if err := api.ArchivePage(ctx, c, pageID); err != nil {
			return toolError("delete failed: %v", err), nil
		}

		out := map[string]any{
			"deleted": true,
			"page": map[string]any{
				"id":   pageID,
				"name": pageName,
			},
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
