package tools

import (
	"fmt"

	"github.com/leorca/nkg/internal/client"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// RegisterAll registers all MCP tools on the server.
func RegisterAll(s *server.MCPServer, c *client.Client) {
	registerQueryPages(s, c)
	registerGetPage(s, c)
	registerCreatePage(s, c)
	registerUpdatePage(s, c)
	registerLinkPages(s, c)
	registerUnlinkPages(s, c)
	registerTraverseGraph(s, c)
	registerDeletePage(s, c)
}

// helper to extract a string argument with a default value.
func stringArg(args map[string]any, key, defaultVal string) string {
	if v, ok := args[key].(string); ok && v != "" {
		return v
	}
	return defaultVal
}

// helper to extract a boolean argument.
func boolArg(args map[string]any, key string) bool {
	v, _ := args[key].(bool)
	return v
}

// helper to extract an integer argument with a default value.
func intArg(args map[string]any, key string, defaultVal int) int {
	if v, ok := args[key].(float64); ok {
		return int(v)
	}
	return defaultVal
}

// helper to extract a string array argument.
func stringArrayArg(args map[string]any, key string) []string {
	raw, ok := args[key].([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// relEnumDescription returns a description listing all valid relation names.
func relEnumDescription() string {
	return "Relation type. Valid values: skos:broader, skos:narrower, dcterms:hasPart, dcterms:isPartOf, dcterms:requires, dcterms:isRequiredBy, dcterms:references, dcterms:isReferencedBy, skos:related, schema:previousItem, schema:nextItem"
}

// toolError returns a tool error result with formatted message.
func toolError(format string, args ...any) *mcp.CallToolResult {
	return mcp.NewToolResultError(fmt.Sprintf(format, args...))
}

