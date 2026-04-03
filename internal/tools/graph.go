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

type graphNode struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Depth int    `json:"depth"`
	Via   string `json:"via,omitempty"`
}

type graphEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Relation string `json:"relation"`
}

func registerTraverseGraph(s *server.MCPServer, c *client.Client) {
	tool := mcp.NewTool(
		"traverse_graph",
		mcp.WithDescription("Traverse the knowledge graph from a starting page, following relations up to a specified depth. Returns nodes and edges."),
		mcp.WithString("id", mcp.Description("Starting page ID")),
		mcp.WithString("name", mcp.Description("Starting page name")),
		mcp.WithNumber("depth", mcp.Description("Maximum traversal depth (default: 1)")),
		mcp.WithArray("relations", mcp.Description("Relation types to follow (default: all). Array of strings like [\"skos:broader\", \"skos:narrower\"]")),
	)

	s.AddTool(tool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := req.GetArguments()
		id := stringArg(args, "id", "")
		name := stringArg(args, "name", "")
		depth := intArg(args, "depth", 1)
		relations := stringArrayArg(args, "relations")

		if id == "" && name == "" {
			return toolError("either 'id' or 'name' is required"), nil
		}

		// Build relation filter set
		followAll := len(relations) == 0
		relSet := make(map[string]bool, len(relations))
		for _, r := range relations {
			if !model.ValidRelation(r) {
				return toolError("invalid relation %q. %s", r, relEnumDescription()), nil
			}
			relSet[r] = true
		}

		// Resolve starting page
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

		// BFS traversal
		var nodes []graphNode
		var edges []graphEdge
		visited := map[string]bool{pageID: true}

		type queueItem struct {
			id    string
			name  string
			depth int
		}
		queue := []queueItem{{id: pageID, name: pageName, depth: 0}}
		nodes = append(nodes, graphNode{ID: pageID, Name: pageName, Depth: 0})

		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]

			if current.depth >= depth {
				continue
			}

			page, err := api.GetPageFull(ctx, c, current.id)
			if err != nil {
				continue
			}

			for relName, refs := range page.Relations {
				if !followAll && !relSet[relName] {
					continue
				}

				for _, ref := range refs {
					edges = append(edges, graphEdge{
						From:     current.id,
						To:       ref.ID,
						Relation: relName,
					})

					if visited[ref.ID] {
						continue
					}
					visited[ref.ID] = true

					refName := ref.Name
					if refName == "" {
						refName = ref.ID
					}

					nodes = append(nodes, graphNode{
						ID:    ref.ID,
						Name:  refName,
						Depth: current.depth + 1,
						Via:   relName,
					})

					queue = append(queue, queueItem{
						id:    ref.ID,
						name:  refName,
						depth: current.depth + 1,
					})
				}
			}
		}

		out := map[string]any{
			"root":  map[string]any{"id": pageID, "name": pageName},
			"nodes": nodes,
			"edges": edges,
		}

		data, _ := json.MarshalIndent(out, "", "  ")
		return mcp.NewToolResultText(string(data)), nil
	})
}
