package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerCreatePage(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"create_page",
		mcp.WithDescription("Create a new knowledge entry in the Notion database."),
		mcp.WithString("name", mcp.Required(), mcp.Description("Title of the knowledge entry")),
		mcp.WithString("summary", mcp.Description("Brief description of the knowledge entry")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		name := stringArg(args, "name", "")
		summary := stringArg(args, "summary", "")

		if name == "" {
			return toolError("'name' is required"), nil
		}

		page, err := api.CreatePage(ctx, c, name, summary)
		if err != nil {
			return toolError("create failed: %v", err), nil
		}

		out := map[string]any{
			"created": true,
			"page": map[string]any{
				"id":      page.ID,
				"name":    page.Name,
				"summary": page.Summary,
			},
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
