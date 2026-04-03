package tools

import (
	"context"
	"encoding/json"

	"github.com/leorca/nkg/internal/api"
	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/model"
	"github.com/leorca/nkg/internal/sync"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func registerSyncToJena(s *server.MCPServer, nc *client.Client, jc *jena.Client) {
	tool := mcp.NewTool(
		"sync_to_jena",
		mcp.WithDescription("Sync Notion knowledge pages to Jena triplestore. "+
			"mode=full replaces all triples; mode=incremental syncs only changes since last sync."),
		mcp.WithString("mode", mcp.Description("Sync mode: 'full' or 'incremental' (default: incremental)")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		mode := stringArg(args, "mode", "incremental")

		var result *sync.SyncResult
		var err error

		switch mode {
		case "full":
			result, err = sync.FullSync(ctx, nc, jc)
		case "incremental":
			result, err = sync.IncrementalSync(ctx, nc, jc)
		default:
			return toolError("invalid mode %q: use 'full' or 'incremental'", mode), nil
		}

		if err != nil {
			return toolError("sync_to_jena: %v", err), nil
		}

		out := map[string]any{
			"mode":   mode,
			"synced": result.Synced,
		}
		if len(result.Errors) > 0 {
			out["errors"] = result.Errors
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}

func registerSyncFromJena(s *server.MCPServer, nc *client.Client, jc *jena.Client) {
	tool := mcp.NewTool(
		"sync_from_jena",
		mcp.WithDescription("Modify a relation in Jena with transactional Notion sync. "+
			"If Notion update fails, Jena change is rolled back. "+relEnumDescription()),
		mcp.WithString("action", mcp.Required(), mcp.Description("Action: 'link' or 'unlink'")),
		mcp.WithString("from", mcp.Required(), mcp.Description("Source page (ID or name)")),
		mcp.WithString("to", mcp.Required(), mcp.Description("Target page (ID or name)")),
		mcp.WithString("relation", mcp.Required(), mcp.Description(relEnumDescription())),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		action := stringArg(args, "action", "")
		from := stringArg(args, "from", "")
		to := stringArg(args, "to", "")
		rel := stringArg(args, "relation", "")

		if action == "" || from == "" || to == "" || rel == "" {
			return toolError("'action', 'from', 'to', and 'relation' are all required"), nil
		}

		if !model.ValidRelation(rel) {
			return toolError("invalid relation %q. %s", rel, relEnumDescription()), nil
		}

		// Resolve page references
		fromID, fromName, err := api.ResolvePageRef(ctx, nc, from)
		if err != nil {
			return toolError("resolve 'from': %v", err), nil
		}
		toID, toName, err := api.ResolvePageRef(ctx, nc, to)
		if err != nil {
			return toolError("resolve 'to': %v", err), nil
		}

		switch action {
		case "link":
			err = sync.LinkWithSync(ctx, nc, jc, fromID, toID, rel)
		case "unlink":
			err = sync.UnlinkWithSync(ctx, nc, jc, fromID, toID, rel)
		default:
			return toolError("invalid action %q: use 'link' or 'unlink'", action), nil
		}

		if err != nil {
			return toolError("sync_from_jena %s: %v", action, err), nil
		}

		out := map[string]any{
			"action":   action,
			"from":     map[string]any{"id": fromID, "name": fromName},
			"to":       map[string]any{"id": toID, "name": toName},
			"relation": rel,
			"synced":   true,
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}

func registerSyncStatus(s *server.MCPServer, nc *client.Client, jc *jena.Client) {
	tool := mcp.NewTool(
		"sync_status",
		mcp.WithDescription("Compare Notion and Jena states, showing relations that exist in only one system."),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := sync.DiffState(ctx, nc, jc)
		if err != nil {
			return toolError("sync_status: %v", err), nil
		}

		out := map[string]any{
			"consistent":  result.Consistent,
			"notion_only": len(result.NotionOnly),
			"jena_only":   len(result.JenaOnly),
		}
		if len(result.NotionOnly) > 0 {
			out["notion_only_details"] = result.NotionOnly
		}
		if len(result.JenaOnly) > 0 {
			out["jena_only_details"] = result.JenaOnly
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
