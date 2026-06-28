import {
	emptyDiagram,
	validate,
	type Diagram,
	type DiagramEdge,
	type DiagramNode,
	type EdgeKind,
	type NodeKind,
} from "../diagram";
import { patch, type PatchResult } from "../compiler";

let counter = 0;
function uid(prefix: string): string {
	counter += 1;
	return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Reactive editor state, backed by Svelte 5 runes. */
class EditorStore {
	/** The working ("new") diagram being edited. */
	diagram = $state<Diagram>(emptyDiagram());
	/** The last committed ("old") diagram — the anchor patch() diffs against. */
	committed = $state<Diagram>(emptyDiagram());

	/** Currently selected node or edge id (for the inspector). */
	selectedId = $state<string | null>(null);
	/** When set, the next node click completes an edge from this source. */
	connectFrom = $state<string | null>(null);

	readonly result = $derived<PatchResult>(patch(this.committed, this.diagram));

	get selectedNode(): DiagramNode | undefined {
		return this.diagram.nodes.find((n) => n.id === this.selectedId);
	}
	get selectedEdge(): DiagramEdge | undefined {
		return this.diagram.edges.find((e) => e.id === this.selectedId);
	}

	addNode(kind: NodeKind, x?: number, y?: number): DiagramNode {
		// Cascade new nodes so they don't stack on top of each other.
		const n = this.diagram.nodes.length;
		const base = {
			id: uid(kind),
			name: defaultName(kind),
			x: x ?? 60 + (n % 6) * 180,
			y: y ?? 70 + Math.floor(n / 6) * 100 + (n % 3) * 24,
		};
		let node: DiagramNode;
		if (kind === "component") node = { ...base, kind, props: [], state: [] };
		else if (kind === "screen") node = { ...base, kind, route: "/" };
		else node = { ...base, kind, fields: [] };
		this.diagram.nodes.push(node);
		this.selectedId = node.id;
		return node;
	}

	deleteNode(id: string) {
		this.diagram.nodes = this.diagram.nodes.filter((n) => n.id !== id);
		this.diagram.edges = this.diagram.edges.filter((e) => e.source !== id && e.target !== id);
		if (this.selectedId === id) this.selectedId = null;
	}

	moveNode(id: string, x: number, y: number) {
		const n = this.diagram.nodes.find((n) => n.id === id);
		if (n) {
			n.x = x;
			n.y = y;
		}
	}

	/** Begin or complete an edge. First call sets the source; second creates it. */
	connect(targetId: string) {
		if (!this.connectFrom) {
			this.connectFrom = targetId;
			return;
		}
		if (this.connectFrom !== targetId) {
			this.addEdge("render", this.connectFrom, targetId);
		}
		this.connectFrom = null;
	}

	addEdge(kind: EdgeKind, source: string, target: string): DiagramEdge {
		const base = { id: uid("e"), source, target };
		let edge: DiagramEdge;
		if (kind === "event") edge = { ...base, kind, event: "click", handler: "onEvent" };
		else if (kind === "data") edge = { ...base, kind, field: "" };
		else edge = { ...base, kind };
		this.diagram.edges.push(edge);
		this.selectedId = edge.id;
		return edge;
	}

	deleteEdge(id: string) {
		this.diagram.edges = this.diagram.edges.filter((e) => e.id !== id);
		if (this.selectedId === id) this.selectedId = null;
	}

	/** Commit the current diagram as the new anchor (simulates "code generated"). */
	commit() {
		this.committed = structuredClone($state.snapshot(this.diagram));
	}

	clear() {
		this.diagram = emptyDiagram();
		this.committed = emptyDiagram();
		this.selectedId = null;
		this.connectFrom = null;
	}

	exportJSON(): string {
		return JSON.stringify($state.snapshot(this.diagram), null, 2);
	}

	loadJSON(json: string) {
		const d = validate(JSON.parse(json));
		this.diagram = d;
		this.selectedId = null;
		this.connectFrom = null;
	}
}

function defaultName(kind: NodeKind): string {
	if (kind === "component") return "NewComponent";
	if (kind === "screen") return "NewScreen";
	return "NewModel";
}

export const editor = new EditorStore();
