.PHONY: help setup build run clean dev

# Default target
.DEFAULT_GOAL := help

# Variables
GO := go
BINARY_NAME := mermaidai
ENV_FILE := .env
ENV_EXAMPLE := .env.example

# Load env file if it exists
ifneq (,$(wildcard $(ENV_FILE)))
    include $(ENV_FILE)
    export
endif

help: ## Display available commands
	@echo "MermaidAI - Mermaid Diagram Editor with AI"
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies and setup environment
	@echo "Setting up project..."
	$(GO) mod download
	@if [ ! -f $(ENV_FILE) ]; then \
		if [ -f $(ENV_EXAMPLE) ]; then \
			cp $(ENV_EXAMPLE) $(ENV_FILE); \
			echo "Created $(ENV_FILE) from example. Please update with your settings."; \
		else \
			echo "OPENAI_API_KEY=" > $(ENV_FILE); \
			echo "Created empty $(ENV_FILE). Please add your OpenAI API key."; \
		fi \
	fi
	@echo "Setup complete! Don't forget to update your $(ENV_FILE) with your OpenAI API key."

build: ## Build the Go application
	@echo "Building..."
	$(GO) build -o $(BINARY_NAME)

run: build ## Run the application
	@echo "Running MermaidAI..."
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "Error: $(ENV_FILE) not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@if [ -z "$$OPENAI_API_KEY" ]; then \
		echo "Error: OPENAI_API_KEY not set in $(ENV_FILE)"; \
		exit 1; \
	fi
	./$(BINARY_NAME)

dev: ## Run in development mode with hot reload
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "Error: $(ENV_FILE) not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@if [ -z "$$OPENAI_API_KEY" ]; then \
		echo "Error: OPENAI_API_KEY not set in $(ENV_FILE)"; \
		exit 1; \
	fi
	@if command -v air > /dev/null; then \
		air; \
	else \
		echo "Installing air for hot reload..."; \
		$(GO) install github.com/air-verse/air@latest; \
		air; \
	fi

clean: ## Clean up build artifacts
	@echo "Cleaning..."
	$(GO) clean
	rm -f $(BINARY_NAME)
	@echo "Cleaned!"

test: ## Run tests
	$(GO) test ./... -v

# Additional targets can be added as needed 