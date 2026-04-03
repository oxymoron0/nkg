package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/model"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerQueryPages(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"query_pages",
		mcp.WithDescription("Search and list knowledge pages in the Notion database. Returns page IDs, names, and summaries."),
		mcp.WithString("name", mcp.Description("Filter by page name (case-insensitive contains match)")),
		mcp.WithBoolean("exact", mcp.Description("Use exact title match instead of contains")),
		mcp.WithNumber("limit", mcp.Description("Maximum number of results to return (default: all)")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		name := stringArg(args, "name", "")
		exact := boolArg(args, "exact")
		limit := intArg(args, "limit", 0)

		var filter any
		if name != "" {
			filter = model.TitleFilter(name, exact)
		}

		pages, err := api.QueryPages(ctx, c, filter, limit)
		if err != nil {
			return toolError("query failed: %v", err), nil
		}

		type pageResult struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Summary string `json:"summary,omitempty"`
		}

		results := make([]pageResult, len(pages))
		for i, p := range pages {
			results[i] = pageResult{ID: p.ID, Name: p.Name, Summary: p.Summary}
		}

		out := map[string]any{
			"count": len(results),
			"pages": results,
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
