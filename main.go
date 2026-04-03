package main

import (
	"log"
	"os"

	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/config"
	"github.com/leorca/nkg/internal/jena"
	"github.com/leorca/nkg/internal/tools"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	// Find project root (where go.mod lives)
	execPath, err := os.Executable()
	if err != nil {
		execPath = "."
	}
	projectRoot, err := config.FindProjectRoot(execPath)
	if err != nil {
		// Fallback: try current working directory
		cwd, _ := os.Getwd()
		projectRoot, err = config.FindProjectRoot(cwd)
		if err != nil {
			log.Fatalf("failed to find project root: %v", err)
		}
	}

	// Load configuration
	cfg, err := config.Load(projectRoot)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// Create Notion API client
	notionClient := client.New(cfg.Token, cfg.DatabaseID)
	defer notionClient.Close()

	// Create Jena client (optional)
	var jenaClient *jena.Client
	if cfg.JenaEndpoint != "" {
		jenaClient = jena.New(cfg.JenaEndpoint, cfg.JenaUser, cfg.JenaPassword)
		defer jenaClient.Close()
	}

	// Create MCP server
	s := server.NewMCPServer(
		"nkg",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// Register all tools
	tools.RegisterAll(s, notionClient, jenaClient)

	// Start stdio transport
	if err := server.ServeStdio(s); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
