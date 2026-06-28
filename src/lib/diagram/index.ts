import {
	DIAGRAM_VERSION,
	type Diagram,
	type DiagramEdge,
	type DiagramNode,
} from "./types";

export * from "./types";

/** The canonical empty diagram. From-scratch gen is `patch(emptyDiagram(), d)`. */
export function emptyDiagram(): Diagram {
	return { version: DIAGRAM_VERSION, nodes: [], edges: [] };
}

/** Index a diagram's nodes by id for O(1) lookup. */
export function nodeMap(d: Diagram): Map<string, DiagramNode> {
	return new Map(d.nodes.map((n) => [n.id, n]));
}

/** Index a diagram's edges by id. */
export function edgeMap(d: Diagram): Map<string, DiagramEdge> {
	return new Map(d.edges.map((e) => [e.id, e]));
}

/** Serialize a diagram to canonical JSON (stable key ordering). */
export function serialize(d: Diagram): string {
	return JSON.stringify(d, null, 2);
}

/**
 * Parse and validate a diagram from JSON. Throws on malformed input so callers
 * can surface a precise error instead of silently corrupting state.
 */
export function parse(json: string): Diagram {
	const raw = JSON.parse(json) as unknown;
	return validate(raw);
}

/** Validate an unknown value as a Diagram, throwing on the first problem. */
export function validate(raw: unknown): Diagram {
	if (typeof raw !== "object" || raw === null)
		throw new Error("Diagram must be an object");
	const d = raw as Record<string, unknown>;
	if (d.version !== DIAGRAM_VERSION)
		throw new Error(`Unsupported diagram version: ${String(d.version)}`);
	if (!Array.isArray(d.nodes)) throw new Error("Diagram.nodes must be an array");
	if (!Array.isArray(d.edges)) throw new Error("Diagram.edges must be an array");

	const ids = new Set<string>();
	for (const n of d.nodes as DiagramNode[]) {
		if (!n.id) throw new Error("Node missing id");
		if (ids.has(n.id)) throw new Error(`Duplicate node id: ${n.id}`);
		ids.add(n.id);
		if (!["component", "screen", "model"].includes(n.kind))
			throw new Error(`Node ${n.id} has invalid kind: ${n.kind}`);
	}

	const edgeIds = new Set<string>();
	for (const e of d.edges as DiagramEdge[]) {
		if (!e.id) throw new Error("Edge missing id");
		if (edgeIds.has(e.id)) throw new Error(`Duplicate edge id: ${e.id}`);
		edgeIds.add(e.id);
		if (!ids.has(e.source))
			throw new Error(`Edge ${e.id} references missing source: ${e.source}`);
		if (!ids.has(e.target))
			throw new Error(`Edge ${e.id} references missing target: ${e.target}`);
	}

	return d as unknown as Diagram;
}
