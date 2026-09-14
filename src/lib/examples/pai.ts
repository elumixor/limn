/**
 * Reference diagram: the architecture of `pai` (a personal assistant daemon
 * with thin clients), transcribed from its docs/architecture.md. Ships with
 * the editor as the worked example of diagram-driven development — load it,
 * open the prompt panel, and see what a real system compiles to.
 */
import { type Block, type BlockType, DIAGRAM_VERSION, type Diagram } from "../diagram";

function b(id: string, name: string, type: BlockType, comments: string[] = [], children: Block[] = []): Block {
	return { id, name, type, comments, children, showComments: comments.length > 0 };
}

const COL = { clients: 40, api: 420, domain: 800, infra: 1180 } as const;

export const PAI_EXAMPLE: Diagram = {
	version: DIAGRAM_VERSION,
	blocks: [
		{
			...b("telegram", "Telegram client", "component", ["grammY bot that polls. Nothing exposed to the internet."], [
				b("tg-stream", "streaming drafts", "component", ["Text streams into the chat as a draft while generated."]),
				b("tg-buttons", "questions as buttons", "component"),
				b("tg-trailer", "rich trailer", "data", ["Structured metadata in a trailing link; stock clients still read plain text."]),
			]),
			x: COL.clients,
			y: 40,
		},
		{
			...b("web", "Web app", "component", ["Served at /app over the tailnet. The one place everything is visible."], [
				b("web-overview", "Overview", "component", ["version, uptime, host, settings, projects, restart and update"]),
				b("web-threads", "Threads", "component", ["every session, its live event stream, compose box, interrupt"]),
				b("web-terminals", "Terminals", "component", ["xterm.js over the terminal WebSocket"]),
				b("web-files", "Files", "component", ["projects, workspace and repo, read-only"]),
				b("web-library", "Library", "component", ["instruction documents and long-term memory"]),
			]),
			x: COL.clients,
			y: 300,
		},
		{ ...b("cli", "CLI", "component", ["Talks only to the API surface."]), x: COL.clients, y: 660 },
		{
			...b("desktop", "Desktop app", "component", ["Tauri 2 window over the same API. Offline-first: cache every read, queue every write."]),
			x: COL.clients,
			y: 760,
		},
		{
			...b("editor", "Editor extension", "component", ["VS Code extension; runs unmodified in desktop VS Code and code-server on port 8788."]),
			x: COL.clients,
			y: 880,
		},
		{
			...b("api", "pai API", "module", ["HTTP + SSE + WebSocket, bound to the Tailscale address only. Token-gated when published via Funnel."], [
				b("api-routes", "routes", "module", ["projects, threads, sessions, settings"]),
				b("api-events", "event stream", "module", ["SSE of the event bus"]),
				b("api-terminal", "terminal socket", "module", ["POST /terminals opens a PTY; GET /terminals/:id/stream is the WebSocket"]),
				b("api-auth", "auth", "module", ["bearer token, required for anything not on the tailnet"]),
			]),
			x: COL.api,
			y: 200,
		},
		{
			...b("protocol", "rich-message codec", "module", ["src/protocol/rich.ts — the only implementation; every client imports it."], [
				b("rich-meta", "RichMeta", "data", ["v, kind, session, project?, tools?, usage?, durationMs?"]),
				b("rich-encode", "encode / decode", "module", ["base64url JSON in a trailing link. Capped at 2048 chars; throws rather than truncates."]),
			]),
			x: COL.api,
			y: 620,
		},
		{
			...b("sessions", "session manager", "module", ["thread ↔ project ↔ cwd ↔ sessionId. One Claude Code session per conversation."], [
				b("sess-resume", "resume", "module", ["Sessions survive restarts: the transcript on disk is the truth, the process is disposable."]),
				b("sess-perms", "permissions", "module"),
				b("sess-tasks", "tasks", "module", ["Anything big becomes a task with its own topic and status card."]),
			]),
			x: COL.domain,
			y: 120,
		},
		{
			...b("terminals", "terminals", "module", ["PTY per project directory, session-lifetime cap, scrollback kept server-side so a reconnect resumes."]),
			x: COL.domain,
			y: 420,
		},
		{
			...b("memory", "memory", "module", ["Long-term memory + instruction documents in workspace/memory."]),
			x: COL.domain,
			y: 560,
		},
		{
			...b("core", "core", "module", ["config, logging, event bus, SQLite. No knowledge of clients."], [
				b("core-bus", "event bus", "module"),
				b("core-db", "pai.db", "database", ["SQLite"]),
			]),
			x: COL.domain,
			y: 700,
		},
		{
			...b("sdk", "Claude Agent SDK", "module", ["Inference is Anthropic-side; the box is a thin client."]),
			x: COL.infra,
			y: 120,
		},
		{
			...b("host", "Hetzner box", "database", ["CX43, built from infra/cloud-init.yaml. Tailscale only, port 22 closed."], [
				b("host-dev", "~/dev/**", "database", ["project checkouts, pushed to GitHub with git"]),
				b("host-sync", "Syncthing", "module", ["two machines, one set of files; supervised like any other child"]),
				b("host-update", "self-update", "module", ["PAI_UPDATE_CHANNEL=tag: host pulls on tag push, no deploy key in CI"]),
			]),
			x: COL.infra,
			y: 360,
		},
		{
			...b("backup", "Storage Box", "database", ["borg backups of pai.db, workspace/memory and project checkouts"]),
			x: COL.infra,
			y: 700,
		},
	],
	connectors: [
		{ id: "c1", source: "telegram", target: "api", kind: "arrow", description: "client of" },
		{ id: "c2", source: "web", target: "api", kind: "arrow", description: "client of" },
		{ id: "c3", source: "cli", target: "api", kind: "arrow", description: "client of" },
		{ id: "c4", source: "desktop", target: "api", kind: "arrow", description: "client of" },
		{ id: "c5", source: "editor", target: "api", kind: "arrow", description: "client of" },
		{ id: "c6", source: "api", target: "sessions", kind: "arrow", description: "drives" },
		{ id: "c7", source: "api", target: "terminals", kind: "arrow", description: "opens and streams" },
		{ id: "c8", source: "api", target: "memory", kind: "arrow", description: "reads and edits" },
		{ id: "c9", source: "sessions", target: "sdk", kind: "arrow", description: "resume, permissions" },
		{ id: "c10", source: "sessions", target: "host-dev", kind: "arrow", description: "works in" },
		{ id: "c11", source: "telegram", target: "protocol", kind: "line", description: "encodes trailers with" },
		{ id: "c12", source: "core-bus", target: "api-events", kind: "arrow", description: "feeds" },
		{ id: "c13", source: "sessions", target: "core-db", kind: "arrow", description: "persists threads in" },
		{ id: "c14", source: "host", target: "backup", kind: "arrow", description: "borg" },
	],
};
