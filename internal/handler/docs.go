package handler

import (
	_ "embed"
	"log"
	"net/http"
)

//go:embed openapi.yaml
var openAPISpec []byte

//go:embed swagger_ui.html
var swaggerUIHTML []byte

func (s *Server) handleOpenAPISpec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if _, err := w.Write(openAPISpec); err != nil {
		log.Printf("handleOpenAPISpec: write error: %v", err)
	}
}

func (s *Server) handleSwaggerUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if _, err := w.Write(swaggerUIHTML); err != nil {
		log.Printf("handleSwaggerUI: write error: %v", err)
	}
}
