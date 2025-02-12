import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

// Initialize mermaid with theme configuration
function initializeMermaid(theme) {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "default",
    darkMode: theme === "dark",
    sequence: {
      actorFontSize: 14,
      noteFontSize: 14,
      messageFontSize: 14,
      actorFontFamily: '"Segoe UI", Arial, sans-serif',
      noteFontFamily: '"Segoe UI", Arial, sans-serif',
      messageFontFamily: '"Segoe UI", Arial, sans-serif',
      actorFontWeight: 500,
      noteFontWeight: 400,
      messageFontWeight: 400,
      wrap: true,
      useMaxWidth: true,
      boxMargin: 8,
      boxTextMargin: 4,
      noteMargin: 8,
      messageMargin: 24,
    },
  });
}

// Initialize with saved theme
const savedTheme = localStorage.getItem("theme") || "light";
initializeMermaid(savedTheme);

// Add version history tracking
const diagramVersions = [];

// Track the last user query and its response
let lastUserQuery = "";
let lastAssistantResponse = "";

function addDiagramVersion(definition, query = "") {
  const version = {
    id: diagramVersions.length + 1,
    timestamp: new Date().toISOString(),
    identifier: definition
      .split("\n")[0]
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim(),
    definition: definition,
    query: query,
    summary: "", // Will be populated by the LLM or static for initial version
  };
  diagramVersions.push(version);

  // For the first version, set a static summary
  if (diagramVersions.length === 1) {
    version.summary = {
      userIntent: "Initial diagram",
      technicalChanges: getInitialDiagramType(definition),
    };
    updateVersionHistory();
    return version;
  }

  // For subsequent versions, get a summary of changes
  const prevVersion = diagramVersions[diagramVersions.length - 2];
  requestChangeSummary(prevVersion.definition, definition, version.id);

  return version;
}

// Helper function to determine the initial diagram type
function getInitialDiagramType(definition) {
  const firstLine = definition.split("\n")[0].toLowerCase();
  const participants = definition
    .split("\n")
    .filter((line) => line.includes("participant")).length;

  if (firstLine.includes("sequence")) {
    return `Sequence diagram with ${participants} participants`;
  } else if (firstLine.includes("flow")) {
    return "Flow diagram";
  } else if (firstLine.includes("class")) {
    return "Class diagram";
  } else {
    return "Mermaid diagram";
  }
}

function updateVersionHistory() {
  const historyElement = document.getElementById("versionHistory");
  historyElement.innerHTML = diagramVersions
    .map(
      (version) => `
        <div class="version-item">
          <div class="version-meta">
            <div>
              <span>#${version.id}</span>
              <span>${new Date(version.timestamp).toLocaleTimeString()}</span>
            </div>
            <button 
              class="version-restore" 
              onclick="window.restoreVersion(${version.id})"
            >
              Restore
            </button>
          </div>
          <div class="version-content">
            ${
              version.summary
                ? `<div class="version-query">${version.summary.userIntent}</div>
                   <div class="version-summary">${version.summary.technicalChanges}</div>`
                : `<div class="version-query">Analyzing changes...</div>`
            }
          </div>
        </div>
      `
    )
    .join("");
}

async function requestChangeSummary(oldDefinition, newDefinition, versionId) {
  const version = diagramVersions.find((v) => v.id === versionId);

  // Skip if there's no actual change
  if (oldDefinition === newDefinition) {
    version.summary = {
      userIntent: "No changes made",
      technicalChanges: "Diagram unchanged",
    };
    updateVersionHistory();
    return;
  }

  // Create a focused prompt for the summary
  const prompt = {
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "You are a diagram change analyzer. Provide brief, focused summaries of changes to sequence diagrams.",
      },
      {
        role: "user",
        content: `Summarize this diagram change in two parts:
1. User's intent: "${lastUserQuery}"
2. Technical changes made (compare):

Previous:
${oldDefinition}

Current:
${newDefinition}

Respond in JSON format:
{
  "userIntent": "2-3 word summary of user request",
  "technicalChanges": "2-3 word summary of actual changes"
}`,
      },
    ],
  };

  try {
    const response = await fetch("/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prompt),
    });

    if (!response.ok) {
      throw new Error("Failed to get summary");
    }

    const completion = await response.json();
    // Extract the actual content from the completion response
    if (
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message
    ) {
      try {
        const summaryData = JSON.parse(completion.choices[0].message.content);
        version.summary = summaryData;
      } catch (parseError) {
        console.error("Failed to parse summary JSON:", parseError);
        version.summary = {
          userIntent:
            completion.choices[0].message.content.split("\n")[0] ||
            "Parse error",
          technicalChanges:
            completion.choices[0].message.content.split("\n")[1] ||
            "See changes in diagram",
        };
      }
    } else {
      throw new Error("Invalid completion response format");
    }
    updateVersionHistory();
  } catch (error) {
    console.error("Failed to get summary:", error);
    version.summary = {
      userIntent: lastUserQuery.slice(0, 50) + "...",
      technicalChanges: "Compare diagrams manually",
    };
    updateVersionHistory();
  }
}

window.restoreVersion = async (versionId) => {
  const version = diagramVersions.find((v) => v.id === versionId);
  if (version) {
    document.getElementById("diagramDefinition").value = version.definition;
    await updateDiagram(version.definition);
    sendText(getCurrentDiagramText());
  }
};

async function updateDiagram(definition) {
  const element = document.getElementById("diagram");
  const { svg } = await mermaid.render("graphDiv", definition);
  element.innerHTML = svg;
  return svg;
}

// Export functions
async function exportAsSVG() {
  try {
    const definition = document.getElementById("diagramDefinition").value;
    const svg = await updateDiagram(definition);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "diagram.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    showError("Failed to export as SVG: " + error.message);
  }
}

async function exportAsPNG() {
  try {
    const definition = document.getElementById("diagramDefinition").value;
    const svg = await updateDiagram(definition);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Create a temporary img element to load the SVG
    const img = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Convert to PNG and download
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "diagram.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    img.src = url;
  } catch (error) {
    showError("Failed to export as PNG: " + error.message);
  }
}

// Copy to clipboard function
async function copyToClipboard() {
  try {
    const definition = document.getElementById("diagramDefinition").value;
    await navigator.clipboard.writeText(definition);
  } catch (error) {
    showError("Failed to copy to clipboard: " + error.message);
  }
}

const defaultDiagram = [
  "sequenceDiagram;",
  "    participant A as Browser Client;",
  "    participant B as System;",
  "    participant C as DynamoDB;",
  "    A->>B: Request;",
  "    B->>C: Query;",
  "    C-->>B: Result;",
  "    B-->>A: Response;",
].join("\n");

const diagramDefinition = document.getElementById("diagramDefinition");
diagramDefinition.value = defaultDiagram;
updateDiagram(defaultDiagram);

// Event Listeners
document.getElementById("copyBtn").addEventListener("click", copyToClipboard);
document.getElementById("downloadSvg").addEventListener("click", exportAsSVG);
document.getElementById("downloadPng").addEventListener("click", exportAsPNG);

const fns = {
  async updateMermaidDefinition({ definition }) {
    document.getElementById("diagramDefinition").value = definition;
    try {
      await updateDiagram(definition);
      return { success: true, newDefinition: definition };
    } catch (err) {
      return { error: err.message };
    }
  },
};

const updateButton = document.getElementById("update");
updateButton.addEventListener("click", async () => {
  updateButton.disabled = true;
  const definition = document.getElementById("diagramDefinition").value;
  await updateDiagram(definition);
  addDiagramVersion(definition);
  sendText(getCurrentDiagramText());
});

diagramDefinition.addEventListener("input", async () => {
  updateButton.disabled = false;
});

const contextButton = document.getElementById("updateContext");
contextButton.addEventListener("click", async () => {
  contextButton.disabled = true;
  sendText(getContextText());
});

const contextInput = document.getElementById("contextInput");
contextInput.addEventListener("input", async () => {
  contextButton.disabled = false;
});

const errorCloseButton = document.getElementById("errorClose");
const errorMessage = document.getElementById("errorMessage");
const errorContainer = document.getElementById("errorContainer");

errorCloseButton.addEventListener("click", () => {
  errorContainer.classList.remove("show");
});

function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.add("show");
}

// Create initial peer connection and global variables
let peer = null;
let channel = null;
let audioTrack = null;
let mediaStream = null;

async function setupConnection() {
  // Create a new peer connection
  peer = new RTCPeerConnection();

  peer.ontrack = (event) => {
    const el = document.createElement("audio");
    el.srcObject = event.streams[0];
    el.autoplay = true;
    document.body.appendChild(el);
  };

  try {
    // Get new audio track
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioTrack = mediaStream.getTracks()[0];
    peer.addTrack(audioTrack);

    // Set up new data channel
    channel = peer.createDataChannel("response");
    setupChannelListeners();
  } catch (err) {
    showError("Failed to access microphone: " + err.message);
    return false;
  }

  return true;
}

function setupChannelListeners() {
  // The "open" event will fire once the RTC connection is established.
  channel.addEventListener("open", async () => {
    updateConnectionStatus("connected");
    channel.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: [
            "You are a helpful assistant.",
            "You are an expert in writing mermaid diagrams.",
            "When you speak, it is brief and to the point.",
            "You only speak when asked a direct question.",
            "You do not explain your actions unless asked.",
            "Stay quiet unless explicitly asked to speak.",
            "If you encounter an error with tool use, fix the problem described in the error and try again.",
            "After several failed tool use attempts request help from the user.",
          ].join("\n"),
          tools: [
            {
              type: "function",
              name: "updateMermaidDefinition",
              description:
                "Updates and re-renders the Mermaid diagram with a new definition",
              parameters: {
                type: "object",
                properties: {
                  definition: {
                    type: "string",
                    description: "The mermaid definition text to set",
                  },
                },
                required: ["definition"],
              },
            },
          ],
        },
      })
    );
    sendText([getCurrentDiagramText(), getContextText()].join("\n"));
  });
}

async function connect() {
  if (!(await setupConnection())) {
    throw new Error("Failed to setup connection");
  }

  // Start the session using the Session Description Protocol (SDP)
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  // get the token
  const response = await fetch("/session");
  if (!response.ok) {
    throw new Error("failed to get /session from server");
  }
  const session = await response.json();

  const sdpResponse = await fetch(
    `https://api.openai.com/v1/realtime?model=${session.model}`,
    {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${session.client_secret.value}`,
        "Content-Type": "application/sdp",
      },
    }
  );

  await peer.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });
}

// Initialize connection
try {
  await connect();
} catch (err) {
  showError(err.message);
}

// Initialize with the default diagram version
addDiagramVersion(defaultDiagram);

// Add styles for the summary and microphone button
const style = document.createElement("style");
style.textContent = `
  .version-summary {
    font-size: 0.75rem;
    color: var(--text-color);
    margin-top: 0.25rem;
    font-style: italic;
  }

  .controls-section {
    padding: 1rem;
  }

  .controls-row {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    align-items: center;
  }

  .control-button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    background: var(--surface-color);
    color: var(--text-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 0.2s ease;
    box-shadow: 0 2px 5px var(--shadow-color);
  }

  .control-button svg {
    width: 32px;
    height: 32px;
    transition: transform 0.2s ease;
    fill: currentColor;
    stroke: currentColor;
  }

  .control-button:hover {
    border-color: var(--primary-color);
    background: var(--hover-color);
  }

  .control-button:hover svg {
    transform: scale(1.1);
  }

  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--border-color);
  }

  .control-button:disabled:hover svg {
    transform: none;
  }

  /* Mic button specific styles */
  .mic-button.muted {
    background: var(--danger-color);
    color: var(--button-text);
    border-color: var(--danger-color);
  }

  .mic-button.muted:hover {
    background: var(--danger-color);
    opacity: 0.9;
  }

  .mic-button:not(.muted) svg {
    color: var(--primary-color);
  }

  /* Connection button states */
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(var(--pulse-color), 0.2);
      border-color: rgba(var(--pulse-color), 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(var(--pulse-color), 0);
      border-color: rgba(var(--pulse-color), 0.8);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(var(--pulse-color), 0);
      border-color: rgba(var(--pulse-color), 0.4);
    }
  }

  .disconnect-button {
    --pulse-color: 34, 197, 94; /* Green for connected */
    color: rgb(var(--pulse-color));
    border-color: rgb(var(--pulse-color));
    animation: pulse 2s infinite;
    background: var(--surface-color);
  }

  .disconnect-button:hover {
    background: var(--hover-color);
  }

  .disconnect-button.connecting {
    --pulse-color: 234, 179, 8; /* Yellow for connecting */
    color: rgb(var(--pulse-color));
    border-color: rgb(var(--pulse-color));
  }

  .disconnect-button.disconnected {
    --pulse-color: 220, 38, 38; /* Red for disconnected */
    color: rgb(var(--pulse-color));
    border-color: rgb(var(--pulse-color));
    animation: none;
  }

  .disconnect-button.disconnected:hover {
    background: var(--hover-color);
  }
`;
document.head.appendChild(style);

// Setup mute toggle functionality
const toggleMuteButton = document.getElementById("toggleMute");
toggleMuteButton.className = "control-button mic-button";

// Create both mic icons (active and muted)
const micActiveIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
  </svg>
`;

const micMutedIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9l4.19 4.18 1.27-1.27L4.27 3z"/>
  </svg>
`;

toggleMuteButton.innerHTML = micActiveIcon;
toggleMuteButton.title = "Click to mute/unmute microphone";
toggleMuteButton.addEventListener("click", () => {
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    toggleMuteButton.title = audioTrack.enabled
      ? "Click to mute microphone"
      : "Click to unmute microphone";
    toggleMuteButton.classList.toggle("muted", !audioTrack.enabled);
    toggleMuteButton.innerHTML = audioTrack.enabled
      ? micActiveIcon
      : micMutedIcon;
  }
});

// Setup disconnect button
const disconnectButton = document.getElementById("disconnect");
disconnectButton.className = "control-button disconnect-button";

// Create power icons for different states
const powerOnIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm-3-9h6v2H9z"/>
  </svg>
`;

const powerOffIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm-1-11h2v6h-2z"/>
  </svg>
`;

const connectingIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zm-.5-4.5v-7l4 3.5-4 3.5z"/>
  </svg>
`;

disconnectButton.innerHTML = powerOnIcon;
disconnectButton.title = "Connected to OpenAI";

// Update connection status display
function updateConnectionStatus(status) {
  disconnectButton.classList.remove("connecting", "disconnected");
  switch (status) {
    case "connecting":
      disconnectButton.classList.add("connecting");
      disconnectButton.title = "Connecting to OpenAI...";
      disconnectButton.innerHTML = connectingIcon;
      break;
    case "connected":
      disconnectButton.title = "Connected to OpenAI - Click to disconnect";
      disconnectButton.innerHTML = powerOnIcon;
      break;
    case "disconnected":
      disconnectButton.classList.add("disconnected");
      disconnectButton.title = "Disconnected - Click to reconnect";
      disconnectButton.innerHTML = powerOffIcon;
      break;
  }
}

disconnectButton.addEventListener("click", () => {
  const isDisconnected = disconnectButton.classList.contains("disconnected");

  if (!isDisconnected) {
    // Close the peer connection
    peer?.close();

    // Stop all tracks
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }

    // Update UI state
    updateConnectionStatus("disconnected");

    // Update button states
    toggleMuteButton.disabled = true;
    updateButton.disabled = true;
    contextButton.disabled = true;

    // Remove any audio elements
    document.querySelectorAll("audio").forEach((el) => el.remove());
  } else {
    // Show connecting state
    updateConnectionStatus("connecting");

    // Attempt to reconnect
    connect()
      .then(() => {
        // Re-enable buttons on successful connection
        toggleMuteButton.disabled = false;
        updateButton.disabled = false;
        contextButton.disabled = false;

        // Update connection status
        updateConnectionStatus("connected");
      })
      .catch((err) => {
        showError(err.message);
        // Keep disconnected state on error
        updateConnectionStatus("disconnected");
      });
  }
});

// Initialize with connecting state
updateConnectionStatus("connecting");

function getContextText() {
  const context = document.getElementById("contextInput").value;
  if (!context.trim()) return "";
  return [
    "Additional Context:",
    context,
    "Please do no reply to this message",
  ].join("\n");
}

function getCurrentDiagramText() {
  const def = document.getElementById("diagramDefinition").value;
  return [
    "Here is the current diagram definition",
    "```",
    def,
    "```",
    "Please do not respond, but keep the current state in mind going forward",
  ].join("\n");
}

// Set up data channel for sending and receiving events
function sendText(text) {
  // Only capture actual user queries, not system messages
  if (
    !text.startsWith("Additional Context:") &&
    !text.startsWith("Here is the current diagram")
  ) {
    lastUserQuery = text;
  }

  channel?.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: text,
          },
        ],
      },
    })
  );
}

// This is how the LLM sends us information.
// This callback recieves tool calls, text message, notifications, and errors.
channel.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  // for debugging. There are way too many of these delta events
  // so I'm filtering them out for now.
  if (!msg.type.endsWith(".delta")) {
    console.log(JSON.stringify(msg, null, 2));
  }

  // Update connection status when session is updated
  if (msg.type === "session.updated") {
    updateConnectionStatus("connected");
  }

  // Capture assistant's responses
  if (msg.type === "response.message.content.part") {
    lastAssistantResponse += msg.content;
  }

  if (msg.type === "response.message.content.done") {
    // Clear the response buffer after processing
    lastAssistantResponse = "";
  }

  // Track version history for LLM-initiated changes
  if (msg.type === "response.function_call_arguments.done") {
    const fn = fns[msg.name];
    if (!fn) return;

    const args = JSON.parse(msg.arguments);
    const result = await fn(args);

    if (msg.name === "updateMermaidDefinition" && result.success) {
      const prevVersion = diagramVersions[diagramVersions.length - 1];
      addDiagramVersion(result.newDefinition, lastUserQuery);
      if (prevVersion) {
        requestChangeSummary(
          prevVersion.definition,
          result.newDefinition,
          diagramVersions.length
        );
      }
    }

    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: msg.call_id,
          output: JSON.stringify(result),
        },
      })
    );
  }

  // show any errors
  if (msg.type === "error") {
    showError(JSON.stringify(msg, null, 2));
  }
});

// Theme toggle functionality
const themeToggle = document.getElementById("themeToggle");
const lightIcon = themeToggle.querySelector(".theme-icon-light");
const darkIcon = themeToggle.querySelector(".theme-icon-dark");

// Check for saved theme preference or default to light
document.documentElement.dataset.theme = savedTheme;
updateThemeIcons(savedTheme);

themeToggle.addEventListener("click", async () => {
  const currentTheme = document.documentElement.dataset.theme;
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.dataset.theme = newTheme;
  localStorage.setItem("theme", newTheme);
  updateThemeIcons(newTheme);

  // Reinitialize mermaid with new theme
  initializeMermaid(newTheme);

  // Re-render current diagram with new theme
  const currentDefinition = document.getElementById("diagramDefinition").value;
  await updateDiagram(currentDefinition);
});

function updateThemeIcons(theme) {
  if (theme === "dark") {
    lightIcon.style.display = "none";
    darkIcon.style.display = "block";
  } else {
    lightIcon.style.display = "block";
    darkIcon.style.display = "none";
  }
}
