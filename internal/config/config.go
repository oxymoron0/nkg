package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config holds the application configuration.
type Config struct {
	DatabaseID   string `json:"database_id"`
	Token        string `json:"-"`
	JenaEndpoint string `json:"jena_endpoint"`
	JenaUser     string `json:"jena_id"`
	JenaPassword string `json:"jena_passwd"`
}

// Load reads config.json and notion.token from the project root.
// projectRoot is the directory containing config/ and token/ directories.
func Load(projectRoot string) (*Config, error) {
	configPath := filepath.Join(projectRoot, "config", "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	if cfg.DatabaseID == "" {
		return nil, fmt.Errorf("database_id is required in config.json")
	}

	tokenPath := filepath.Join(projectRoot, "token", "notion.token")
	tokenData, err := os.ReadFile(tokenPath)
	if err != nil {
		return nil, fmt.Errorf("read token: %w", err)
	}

	cfg.Token = strings.TrimSpace(string(tokenData))
	if cfg.Token == "" || cfg.Token == "PASTE_YOUR_NOTION_API_TOKEN_HERE" {
		return nil, fmt.Errorf("please set a valid Notion API token in %s", tokenPath)
	}

	return &cfg, nil
}

// FindProjectRoot walks up from the given directory to find go.mod.
func FindProjectRoot(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not find project root (no go.mod found)")
		}
		dir = parent
	}
}
