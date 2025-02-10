package openai

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

type Client struct {
	APIKey     string
	HTTPClient *http.Client
}

func (c *Client) httpClient() *http.Client {
	return cmp.Or(c.HTTPClient, http.DefaultClient)
}

// RealtimeSessionInput was generated with https://mholt.github.io/json-to-go/ and may be incorrect
type RealtimeSessionInput struct {
	Modalities              []string                 `json:"modalities,omitempty"`
	Model                   string                   `json:"model"`
	Instructions            string                   `json:"instructions,omitempty"`
	Voice                   string                   `json:"voice,omitempty"`
	InputAudioFormat        string                   `json:"input_audio_format,omitempty"`
	OutputAudioFormat       string                   `json:"output_audio_format,omitempty"`
	InputAudioTranscription *InputAudioTranscription `json:"input_audio_transcription,omitempty"`
	TurnDetection           *json.RawMessage         `json:"turn_detection,omitempty"`
	Tools                   []json.RawMessage        `json:"tools,omitempty"`
	ToolChoice              string                   `json:"tool_choice,omitempty"`
	Temperature             *float64                 `json:"temperature,omitempty"`
	MaxResponseOutputTokens interface{}              `json:"max_response_output_tokens,omitempty"`
}

type MaxResponseOutputTokens struct {
	Value    int
	Infinity bool
}

func (m *MaxResponseOutputTokens) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte(`"inf"`)) {
		m.Infinity = true
		return nil
	}
	return json.Unmarshal(data, &m.Value)
}

// RealtimeSessionOutput was generated with https://mholt.github.io/json-to-go/ and may be incorrect
type RealtimeSessionOutput struct {
	ID                      string                  `json:"id"`
	Object                  string                  `json:"object"`
	Model                   string                  `json:"model"`
	Modalities              []string                `json:"modalities"`
	Instructions            string                  `json:"instructions"`
	Voice                   string                  `json:"voice"`
	InputAudioFormat        string                  `json:"input_audio_format"`
	OutputAudioFormat       string                  `json:"output_audio_format"`
	InputAudioTranscription InputAudioTranscription `json:"input_audio_transcription"`
	TurnDetection           any                     `json:"turn_detection"`
	Tools                   []any                   `json:"tools"`
	ToolChoice              string                  `json:"tool_choice"`
	Temperature             float64                 `json:"temperature"`
	MaxResponseOutputTokens MaxResponseOutputTokens `json:"max_response_output_tokens"`
	ClientSecret            ClientSecret            `json:"client_secret"`
}

type InputAudioTranscription struct {
	Model string `json:"model"`
}

type ClientSecret struct {
	Value     string `json:"value"`
	ExpiresAt int    `json:"expires_at"`
}

type RealtimeSession struct {
	Model        string       `json:"model"`
	ClientSecret ClientSecret `json:"client_secret"`
}

// ChatCompletion represents a response from the chat completion API
type ChatCompletion struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}

// ChatRequest represents a request to the chat completion API
type ChatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
}

// ChatMessage represents a message in the chat completion request
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// CreateChatCompletion sends a request to the OpenAI chat completion API
func (c *Client) CreateChatCompletion(ctx context.Context, req ChatRequest) (*ChatCompletion, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		"POST",
		"https://api.openai.com/v1/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.httpClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %s", resp.Status)
	}

	var completion ChatCompletion
	if err := json.NewDecoder(resp.Body).Decode(&completion); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &completion, nil
}

func (c *Client) CreateRealtimeSession(input RealtimeSessionInput) (*RealtimeSession, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	req, err := http.NewRequest(
		"POST",
		"https://api.openai.com/v1/realtime/sessions",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %s", resp.Status)
	}
	var session RealtimeSession
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &session, nil
}

type Error struct {
	Message string
	Type    string
	Param   any
	Code    int
}

func (e Error) Error() string {
	return fmt.Sprintf("openai: %s: %s", e.Type, e.Message)
}

func ReadError(r io.Reader) error {
	var e Error
	err := json.NewDecoder(r).Decode(&e)
	if err != nil {
		e.Message = err.Error()
		e.Type = "json_unmarshal_error"
		e.Code = -1
		return e
	}
	return e
}

func (e *Error) UnmarshalJSON(data []byte) error {
	var aux struct {
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Param   any    `json:"param"`
			Code    *int   `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	e.Message = aux.Error.Message
	e.Type = aux.Error.Type
	e.Param = aux.Error.Param
	if aux.Error.Code != nil {
		e.Code = *aux.Error.Code
	}
	return nil
}

func (e Error) LogValue() slog.Value {
	return slog.GroupValue(
		slog.String("message", e.Message),
		slog.String("type", e.Type),
		slog.Any("param", e.Param),
		slog.Int("code", e.Code),
	)
}

func (c *Client) do(method, url string, input, output any) error {
	body, err := json.Marshal(input)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", c.APIKey))
	req.Header.Add("Content-Type", "application/json")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ReadError(res.Body)
	}
	if output == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(output)
}
