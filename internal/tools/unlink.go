package tools

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/model"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerUnlinkPages(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"unlink_pages",
		mcp.WithDescription("Remove a semantic relation between two knowledge pages. "+relEnumDescription()),
		mcp.WithString("from", mcp.Required(), mcp.Description("Source page (ID or name)")),
		mcp.WithString("to", mcp.Required(), mcp.Description("Target page (ID or name)")),
		mcp.WithString("relation", mcp.Required(), mcp.Description(relEnumDescription())),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		from := stringArg(args, "from", "")
		to := stringArg(args, "to", "")
		rel := stringArg(args, "relation", "")

		if from == "" || to == "" || rel == "" {
			return toolError("'from', 'to', and 'relation' are all required"), nil
		}

		if !model.ValidRelation(rel) {
			return toolError("invalid relation %q. %s", rel, relEnumDescription()), nil
		}

		fromID, fromName, err := api.ResolvePageRef(ctx, c, from)
		if err != nil {
			return toolError("resolve 'from': %v", err), nil
		}
		toID, toName, err := api.ResolvePageRef(ctx, c, to)
		if err != nil {
			return toolError("resolve 'to': %v", err), nil
		}

		currentIDs, err := api.GetRelationIDs(ctx, c, fromID, rel)
		if err != nil {
			return toolError("read current relations: %v", err), nil
		}

		// Filter out the target ID
		cleanToID := strings.ReplaceAll(toID, "-", "")
		found := false
		newIDs := make([]string, 0, len(currentIDs))
		for _, id := range currentIDs {
			if strings.ReplaceAll(id, "-", "") == cleanToID {
				found = true
				continue
			}
			newIDs = append(newIDs, id)
		}

		if !found {
			out := map[string]any{
				"unlinked":  true,
				"not_found": true,
				"message":   "relation did not exist",
				"from":      map[string]any{"id": fromID, "name": fromName},
				"to":        map[string]any{"id": toID, "name": toName},
				"relation":  rel,
			}
			data, _ := json.MarshalIndent(out, "", "  ")
			return mcp.NewToolResultText(string(data)), nil
		}

		if err := api.SetRelation(ctx, c, fromID, rel, newIDs); err != nil {
			return toolError("set relation: %v", err), nil
		}

		out := map[string]any{
			"unlinked": true,
			"from":     map[string]any{"id": fromID, "name": fromName},
			"to":       map[string]any{"id": toID, "name": toName},
			"relation": rel,
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
