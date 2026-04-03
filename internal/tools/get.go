package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerGetPage(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"get_page",
		mcp.WithDescription("Get detailed information about a knowledge page including all relations with resolved names. Provide either id or name."),
		mcp.WithString("id", mcp.Description("Notion page ID (32 hex chars)")),
		mcp.WithString("name", mcp.Description("Page name (must match exactly one page)")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		id := stringArg(args, "id", "")
		name := stringArg(args, "name", "")

		if id == "" && name == "" {
			return toolError("either 'id' or 'name' is required"), nil
		}

		var pageID string
		if id != "" {
			pageID = id
		} else {
			resolvedID, _, err := api.ResolvePageRef(ctx, c, name)
			if err != nil {
				return toolError("%v", err), nil
			}
			pageID = resolvedID
		}

		page, err := api.GetPageFull(ctx, c, pageID)
		if err != nil {
			return toolError("get page failed: %v", err), nil
		}

		// Remove empty relation arrays for cleaner output
		cleanRelations := make(map[string]any)
		for k, v := range page.Relations {
			if len(v) > 0 {
				cleanRelations[k] = v
			}
		}

		out := map[string]any{
			"page": map[string]any{
				"id":               page.ID,
				"name":             page.Name,
				"summary":          page.Summary,
				"created_time":     page.CreatedTime,
				"last_edited_time": page.LastEditedTime,
				"relations":        cleanRelations,
				"skos:exactMatch":  page.ExactMatch,
				"skos:closeMatch":  page.CloseMatch,
			},
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
