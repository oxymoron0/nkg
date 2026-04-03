package jena

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Value represents a single value from a SPARQL result binding.
type Value struct {
	Type     string `json:"type"`
	Value    string `json:"value"`
	Datatype string `json:"datatype,omitempty"`
	Lang     string `json:"xml:lang,omitempty"`
}

// sparqlResult is the JSON structure returned by Fuseki SPARQL queries.
type sparqlResult struct {
	Head    struct{ Vars []string }           `json:"head"`
	Results struct{ Bindings []bindingRow }   `json:"results"`
}

type bindingRow = map[string]Value

// Client communicates with a Jena Fuseki SPARQL endpoint.
type Client struct {
	endpoint   string // base dataset URL (e.g. https://jena.leorca.org/ds)
	user       string
	password   string
	httpClient *http.Client
}

// New creates a Jena SPARQL client.
func New(endpoint, user, password string) *Client {
	return &Client{
		endpoint: strings.TrimRight(endpoint, "/"),
		user:     user,
		password: password,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// Query executes a SPARQL SELECT and returns parsed bindings.
// Uses an independent timeout context to avoid cancellation from the parent.
func (c *Client) Query(_ context.Context, sparql string) ([]map[string]Value, error) {
	reqURL := c.endpoint + "/sparql"
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	form := url.Values{"query": {sparql}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build query request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/sparql-results+json")
	req.SetBasicAuth(c.user, c.password)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute query: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read query response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("query failed (HTTP %d): %s", resp.StatusCode, truncate(body, 200))
	}

	var result sparqlResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse query result: %w", err)
	}

	return result.Results.Bindings, nil
}

// Update executes a SPARQL UPDATE (INSERT DATA, DELETE DATA, etc.).
// Uses an independent timeout context to avoid cancellation from the parent.
func (c *Client) Update(_ context.Context, sparql string) error {
	reqURL := c.endpoint + "/update"
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	form := url.Values{"update": {sparql}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("build update request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.user, c.password)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("update failed (HTTP %d): %s", resp.StatusCode, truncate(body, 200))
	}

	return nil
}

// Close releases HTTP client resources.
func (c *Client) Close() {
	c.httpClient.CloseIdleConnections()
}

func truncate(b []byte, max int) string {
	s := string(b)
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}
