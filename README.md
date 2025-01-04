# Mermaid AI

> Use OpenAI advanced voice to create [mermaid](https://mermaid.live) diagrams.

## Install

```
go install github.com/icholy/mermaidai@latest
```

## Usage

Start the server, and open the UI in your browser: http://localhost:8000

```
mermaidai
```

**Note**: If you don't have an `OPENAI_API_KEY` environment variable, you can pass it using the `--apikey` flag.

## Screenshot

![](./images/screenshot.png)

## Diagram

``` mermaid
sequenceDiagram;
    participant Mermaid as Mermaid Diagram;
    participant Browser as Browser Client;
    participant Server as Server;
    participant OpenAI as OpenAI Real-time API;
    Browser->>Server: Request Session;
    Server->>OpenAI: Request Temporary Token;
    OpenAI-->>Server: Provide Temporary Token;
    Server-->>Browser: Provide Session (Token);
    Browser->>OpenAI: Request with Token;
    OpenAI-->>Browser: Return SDP;
    Browser->>OpenAI: Establish RTC Connection;
    loop RTC Communication
        Browser->>OpenAI: Send Mermaid Diagram State;
        Browser->>OpenAI: Send Voice Information;
        OpenAI-->>Browser: Tool Call (updateMermaidDefinition);
        Browser->>Mermaid: Update Diagram with Parameters;
    end
```
