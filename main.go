package main

import (
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log/slog"
	"net/http"
	"os"

	"github.com/icholy/mermaidai/internal/logutil"
	"github.com/icholy/mermaidai/internal/openai"
)

//go:embed static/*
var embedded embed.FS

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	var client openai.Client
	var addr string
	var model string
	var dev bool
	flag.StringVar(&addr, "addr", ":8000", "http server address")
	flag.StringVar(&client.APIKey, "apikey", os.Getenv("OPENAI_API_KEY"), "OpenAI API Key")
	flag.StringVar(&model, "model", "gpt-4o-realtime-preview-2024-12-17", "Model to use")
	flag.BoolVar(&dev, "dev", true, "dev mode")
	flag.Parse()
	if client.APIKey == "" {
		log.Error("no api key provided")
		os.Exit(1)
	}

	// indent the json logs if we're in dev mode
	if dev {
		indenter := logutil.Indenter{W: os.Stdout}
		log = slog.New(slog.NewJSONHandler(&indenter, nil))
	}

	// this route serves the webpage assets
	// in dev mode, we read from the filesystem so that we don't need to
	// keep restarting the server.
	static, _ := fs.Sub(embedded, "static")
	if dev {
		static = os.DirFS("static")
	}
	http.Handle("GET /", http.FileServerFS(static))

	// this endpoint provides the api key for the webpage to use.
	// It uses our real api key to create a temporary key with less permissions.
	http.HandleFunc("GET /session", func(w http.ResponseWriter, r *http.Request) {
		session, err := client.CreateRealtimeSession(openai.RealtimeSessionInput{Model: model})
		if err != nil {
			log.Error("failed to create session", "err", err)
			http.Error(w, "failed to create session", http.StatusInternalServerError)
			return
		}
		if err := json.NewEncoder(w).Encode(session); err != nil {
			log.Error("failed to marshal session", "err", err)
		}
	})

	log.Info("starting http server", "addr", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Error("failed to start http server", "err", err)
		os.Exit(1)
	}
}
