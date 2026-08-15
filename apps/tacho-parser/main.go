package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	tachograph "github.com/way-platform/tachograph-go"
	"google.golang.org/protobuf/encoding/protojson"
)

const maxFileSize = 20 << 20

type parseResponse struct {
	OK            bool            `json:"ok"`
	FileType      string          `json:"fileType,omitempty"`
	Authenticated bool            `json:"authenticated"`
	ParsedAt      string          `json:"parsedAt,omitempty"`
	Data          json.RawMessage `json:"data,omitempty"`
	Error         string          `json:"error,omitempty"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "fleetos-tachograph-parser"})
	})
	mux.HandleFunc("POST /parse", parseHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("FleetOS tachograph parser listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func parseHandler(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("TACHO_PARSER_SECRET")
	if secret == "" || r.Header.Get("x-fleetos-parser-secret") != secret {
		writeJSON(w, http.StatusUnauthorized, parseResponse{OK: false, Error: "unauthorized"})
		return
	}
	if contentType := r.Header.Get("content-type"); contentType != "" && !strings.HasPrefix(contentType, "application/octet-stream") {
		writeJSON(w, http.StatusUnsupportedMediaType, parseResponse{OK: false, Error: "expected application/octet-stream"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxFileSize+1))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, parseResponse{OK: false, Error: "could not read tachograph file"})
		return
	}
	if len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, parseResponse{OK: false, Error: "empty tachograph file"})
		return
	}
	if len(body) > maxFileSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, parseResponse{OK: false, Error: "tachograph file exceeds 20 MB"})
		return
	}

	raw, err := tachograph.Unmarshal(body)
	if err != nil {
		writeParseError(w, err)
		return
	}
	parsed, err := (tachograph.ParseOptions{PreserveRawData: false}).Parse(raw)
	if err != nil {
		writeParseError(w, err)
		return
	}
	encoded, err := (protojson.MarshalOptions{UseProtoNames: true}).Marshal(parsed)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, parseResponse{OK: false, Error: "tachograph file decoded but structured output could not be produced"})
		return
	}

	writeJSON(w, http.StatusOK, parseResponse{
		OK:            true,
		FileType:      parsed.GetType().String(),
		Authenticated: false,
		ParsedAt:      time.Now().UTC().Format(time.RFC3339),
		Data:          encoded,
	})
}

func writeParseError(w http.ResponseWriter, err error) {
	if errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusUnprocessableEntity, parseResponse{OK: false, Error: "incomplete tachograph file"})
		return
	}
	writeJSON(w, http.StatusUnprocessableEntity, parseResponse{OK: false, Error: "file is not a supported tachograph .ddd download"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.Header().Set("x-content-type-options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
