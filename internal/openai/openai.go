package openai

import (
	"bytes"
	"cmp"
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

func (c *Client) CreateRealtimeSession(input RealtimeSessionInput) (*RealtimeSessionOutput, error) {
	var output RealtimeSessionOutput
	if err := c.do(
		http.MethodPost,
		"https://api.openai.com/v1/realtime/sessions",
		input,
		&output,
	); err != nil {
		return nil, err
	}
	return &output, nil
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
