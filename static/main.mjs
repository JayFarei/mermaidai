import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

mermaid.initialize({ startOnLoad: false });

// Add version history tracking
const diagramVersions = [];

function addDiagramVersion(definition) {
  const version = {
    id: diagramVersions.length + 1,
    timestamp: new Date().toISOString(),
    identifier: definition
      .split("\n")[0]
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim(),
    definition: definition,
  };
  diagramVersions.push(version);
  updateVersionHistory();
  return version;
}

function updateVersionHistory() {
  const historyElement = document.getElementById("versionHistory");
  historyElement.innerHTML = diagramVersions
    .map(
      (version) => `
		<div class="version-item" data-version="${version.id}">
			<span class="version-number">#${version.id}</span>
			<span class="version-identifier">${version.identifier}</span>
			<span class="version-time">${new Date(
        version.timestamp
      ).toLocaleTimeString()}</span>
			<button onclick="window.restoreVersion(${version.id})">Restore</button>
		</div>
	`
    )
    .join("");
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

const fns = {
  async updateMermaidDefinition({ definition }) {
    document.getElementById("diagramDefinition").value = definition;
    try {
      await updateDiagram(definition);
      addDiagramVersion(definition);
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

// Create a peer connection
const peer = new RTCPeerConnection();

peer.ontrack = (event) => {
  const el = document.createElement("audio");
  el.srcObject = event.streams[0];
  el.autoplay = true;
  document.body.appendChild(el);
};

// Add local audio track for microphone input in the browser
const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioTrack = ms.getTracks()[0];
peer.addTrack(audioTrack);

// Setup mute toggle functionality
const toggleMuteButton = document.getElementById("toggleMute");
toggleMuteButton.addEventListener("click", () => {
  audioTrack.enabled = !audioTrack.enabled;
  toggleMuteButton.textContent = audioTrack.enabled ? "Mute Mic" : "Unmute Mic";
  toggleMuteButton.classList.toggle("muted", !audioTrack.enabled);
});

// Setup disconnect functionality
const disconnectButton = document.getElementById("disconnect");
disconnectButton.addEventListener("click", () => {
  // Close the peer connection
  peer?.close();

  // Stop all tracks
  for (const track of ms?.getTracks() ?? []) {
    track.stop();
  }

  // Reset UI state
  const status = document.getElementById("status");
  status.textContent = "Disconnected";
  status.className = "status disconnected";

  // Disable buttons
  toggleMuteButton.disabled = true;
  disconnectButton.disabled = true;
  updateButton.disabled = true;
  contextButton.disabled = true;

  // Remove any audio elements
  document.querySelectorAll("audio").forEach((el) => el.remove());
});

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
const channel = peer.createDataChannel("response");

function sendText(text) {
  channel.send(
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

// The "open" event will fire once the RTC connection is established.
// Once that happens, we can send it instructions about the tools we have.
channel.addEventListener("open", async () => {
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

// This is how the LLM sends us information.
// This callback recieves tool calls, text message, notifications, and errors.
channel.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);

  // for debugging. There are way too many of these delta events
  // so I'm filtering them out for now.
  if (!msg.type.endsWith(".delta")) {
    console.log(JSON.stringify(msg, null, 2));
  }
  // the voice communication is not available
  // until we get this message. We use it to
  // notify the user.
  if (msg.type === "session.updated") {
    const status = document.getElementById("status");
    status.textContent = "Connected to OpenAI";
    status.className = "status connected";
  }

  // this is the LLM asking to run a function
  if (msg.type === "response.function_call_arguments.done") {
    const fn = fns[msg.name];
    if (!fn) {
      return;
    }
    const args = JSON.parse(msg.arguments);
    const result = await fn(args);
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

async function connect() {
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

try {
  await connect();
} catch (err) {
  showError(err.message);
}

// Initialize with the default diagram version
addDiagramVersion(defaultDiagram);
