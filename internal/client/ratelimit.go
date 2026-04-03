package client

import (
	"context"
	"time"
)

// RateLimiter implements a simple token bucket rate limiter.
type RateLimiter struct {
	ticker *time.Ticker
	tokens chan struct{}
}

// NewRateLimiter creates a rate limiter allowing rps requests per second.
func NewRateLimiter(rps int) *RateLimiter {
	rl := &RateLimiter{
		ticker: time.NewTicker(time.Second / time.Duration(rps)),
		tokens: make(chan struct{}, rps),
	}
	// Pre-fill with one token for immediate first request.
	rl.tokens <- struct{}{}

	go func() {
		for range rl.ticker.C {
			select {
			case rl.tokens <- struct{}{}:
			default:
			}
		}
	}()

	return rl
}

// Wait blocks until a token is available or the context is cancelled.
func (rl *RateLimiter) Wait(ctx context.Context) error {
	select {
	case <-rl.tokens:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Stop releases the rate limiter resources.
func (rl *RateLimiter) Stop() {
	rl.ticker.Stop()
}
