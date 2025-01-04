import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

mermaid.initialize({ startOnLoad: false });

async function updateDiagram(definition) {
	const element = document.getElementById("diagram");
	const { svg } = await mermaid.render('graphDiv', definition);
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
document.getElementById("diagramDefinition").value = defaultDiagram;
updateDiagram(defaultDiagram);

const fns = {
	async updateMermaidDefinition({ definition }) {
		document.getElementById("diagramDefinition").value = definition;
		try {
			await updateDiagram(definition);
			return { success: true, newDefinition: definition };
		} catch (err) {
			return { success: false, error: err.message };
		}
	},
};

const updateButton = document.getElementById("update");
updateButton.addEventListener("click", async () => {
	const definition = document.getElementById("diagramDefinition").value;
	await updateDiagram(definition);
	sendText(getCurrentDiagramText());
});

const contextButton = document.getElementById("updateContext");
contextButton.addEventListener("click", async () => {
	sendText(getContextText());
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
	const el = document.createElement('audio');
	el.srcObject = event.streams[0];
	el.autoplay = true;
	document.body.appendChild(el);
};

// Add local audio track for microphone input in the browser
const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioTrack = ms.getTracks()[0];
peer.addTrack(audioTrack);

// Setup mute toggle functionality
const toggleMuteButton = document.getElementById('toggleMute');
toggleMuteButton.addEventListener('click', () => {
	audioTrack.enabled = !audioTrack.enabled;
	toggleMuteButton.textContent = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
	toggleMuteButton.classList.toggle('muted', !audioTrack.enabled);
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
	channel.send(JSON.stringify({
		type: "conversation.item.create",
		item: {
			type: "message",
			role: "user",
			content: [
				{
					"type": "input_text",
					"text": text,
				}
			]
		},
	}));
}

// The "open" event will fire once the RTC connection is established.
// Once that happens, we can send it instructions about the tools we have.
channel.addEventListener("open", async () => {
	channel.send(JSON.stringify({
		type: "session.update",
		session: {
			modalities: ["text", "audio"],
			instructions: [
				"You are a helpful assistant.",
				"You are an expert in writing mermaid diagrams.",
				"You only speak when asked a direct question.",
				"You do not explain your actions unless asked.",
				"When you speak, it is brief and to the point.",
			].join("\n"),
			tools: [
				{
					type: "function",
					name: "updateMermaidDefinition",
					description: "Updates and re-renders the Mermaid diagram with a new definition",
					parameters: {
						type: "object",
						properties: {
							definition: {
								type: "string",
								description: "The mermaid definition text to set"
							}
						},
						required: ["definition"]
					}
				},
			]
		}
	}));
	sendText([
		getCurrentDiagramText(),
		getContextText(),
	].join("\n"))
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
		channel.send(JSON.stringify({
			type: "conversation.item.create",
			item: {
				type: "function_call_output",
				call_id: msg.call_id,
				output: JSON.stringify(result),
			},
		}));
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

	const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${session.model}`, {
		method: "POST",
		body: offer.sdp,
		headers: {
			Authorization: `Bearer ${session.client_secret.value}`,
			"Content-Type": "application/sdp"
		},
	});

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
