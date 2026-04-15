package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/leorca/nkg/internal/client"
	"github.com/leorca/nkg/internal/config"
	"github.com/leorca/nkg/internal/handler"
	"github.com/leorca/nkg/internal/jena"
)

func main() {
	execPath, err := os.Executable()
	if err != nil {
		execPath = "."
	}
	projectRoot, err := config.FindProjectRoot(execPath)
	if err != nil {
		cwd, err2 := os.Getwd()
		if err2 != nil {
			log.Fatalf("failed to get working directory: %v", err2)
		}
		projectRoot, err = config.FindProjectRoot(cwd)
		if err != nil {
			log.Fatalf("failed to find project root: %v", err)
		}
	}

	cfg, err := config.Load(projectRoot)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	nc := client.New(cfg.Token, cfg.DatabaseID)
	defer nc.Close()

	var jc *jena.Client
	if cfg.JenaEndpoint != "" {
		jc = jena.New(cfg.JenaEndpoint, cfg.JenaUser, cfg.JenaPassword)
		defer jc.Close()
	}

	mux := handler.NewServeMux(nc, jc)

	addr := fmt.Sprintf(":%d", cfg.APIPort)
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log.Printf("NKG API server starting on %s", addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server error: %v", err)
	}
}
