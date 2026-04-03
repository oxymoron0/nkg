package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

const (
	baseURL       = "https://api.notion.com/v1"
	notionVersion = "2022-06-28"
	maxRetries    = 3
)

// Client is the Notion API HTTP client.
type Client struct {
	httpClient  *http.Client
	token       string
	DatabaseID  string
	rateLimiter *RateLimiter
}

// New creates a new Notion API client.
func New(token, databaseID string) *Client {
	return &Client{
		httpClient:  &http.Client{Timeout: 30 * time.Second},
		token:       token,
		DatabaseID:  databaseID,
		rateLimiter: NewRateLimiter(3),
	}
}

// Do performs an HTTP request to the Notion API with rate limiting and retry.
func (c *Client) Do(ctx context.Context, method, path string, body any) ([]byte, error) {
	var lastErr error

	for attempt := range maxRetries {
		if err := c.rateLimiter.Wait(ctx); err != nil {
			return nil, err
		}

		var reqBody io.Reader
		if body != nil {
			data, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("marshal request body: %w", err)
			}
			reqBody = bytes.NewReader(data)
		}

		req, err := http.NewRequestWithContext(ctx, method, baseURL+path, reqBody)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Notion-Version", notionVersion)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("http request: %w", err)
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("read response: %w", err)
			continue
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := 1
			if v := resp.Header.Get("Retry-After"); v != "" {
				if n, err := strconv.Atoi(v); err == nil {
					retryAfter = n
				}
			}
			lastErr = fmt.Errorf("rate limited (attempt %d/%d)", attempt+1, maxRetries)
			select {
			case <-time.After(time.Duration(retryAfter) * time.Second):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			continue
		}

		if resp.StatusCode >= 500 && attempt == 0 {
			lastErr = fmt.Errorf("server error %d (retrying)", resp.StatusCode)
			select {
			case <-time.After(2 * time.Second):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			continue
		}

		if resp.StatusCode >= 400 {
			var notionErr struct {
				Message string `json:"message"`
				Code    string `json:"code"`
			}
			json.Unmarshal(respBody, &notionErr)
			return nil, fmt.Errorf("notion API error %d: %s (%s)", resp.StatusCode, notionErr.Message, notionErr.Code)
		}

		return respBody, nil
	}

	return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}

// Close releases client resources.
func (c *Client) Close() {
	c.rateLimiter.Stop()
}
