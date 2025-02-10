# MermaidAI - Mermaid Diagram Editor with AI

An interactive Mermaid diagram editor powered by OpenAI's real-time API. Create and modify diagrams through natural language using voice or text input.

## Features

- Real-time diagram updates using OpenAI's API
- Voice and text input support
- Version history tracking for diagrams
- Live preview of Mermaid diagrams
- Hot-reloading in development mode

## Prerequisites

- Go 1.20 or later
- OpenAI API key
- Modern web browser with WebRTC support

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mermaidai.git
   cd mermaidai
   ```

2. Set up the project:
   ```bash
   make setup
   ```

3. Add your OpenAI API key to `.env`:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

4. Run the application:
   ```bash
   make run
   ```

   For development with hot-reload:
   ```bash
   make dev
   ```

5. Open your browser and navigate to `http://localhost:8080`

## Development

The project includes several make commands to help with development:

- `make help` - Display available commands
- `make setup` - Install dependencies and setup environment
- `make build` - Build the Go application
- `make run` - Run the application
- `make dev` - Run in development mode with hot reload
- `make clean` - Clean up build artifacts
- `make test` - Run tests

## Project Structure

```
.
├── main.go              # Main Go server file
├── internal/            # Internal Go packages
├── static/             # Static web files
│   ├── index.html      # Main HTML file
│   └── main.mjs        # Main JavaScript module
├── Makefile            # Build and run commands
└── .env                # Environment configuration
```
