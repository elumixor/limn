import {
	DIAGRAM_VERSION,
	type Box,
	type Connector,
	type Diagram,
} from "./types";

export * from "./types";

/** The canonical empty diagram. */
export function emptyDiagram(): Diagram {
	return { version: DIAGRAM_VERSION, boxes: [], connectors: [] };
}

/** Index boxes by id for O(1) lookup. */
export function boxMap(d: Diagram): Map<string, Box> {
	return new Map(d.boxes.map((b) => [b.id, b]));
}

/** Index connectors by id. */
export function connectorMap(d: Diagram): Map<string, Connector> {
	return new Map(d.connectors.map((c) => [c.id, c]));
}

/** Serialize a diagram to canonical JSON. */
export function serialize(d: Diagram): string {
	return JSON.stringify(d, null, 2);
}

/** Parse and validate a diagram from JSON. Throws on malformed input. */
export function parse(json: string): Diagram {
	return validate(JSON.parse(json) as unknown);
}

/** Validate an unknown value as a Diagram, throwing on the first problem. */
export function validate(raw: unknown): Diagram {
	if (typeof raw !== "object" || raw === null)
		throw new Error("Diagram must be an object");
	const d = raw as Record<string, unknown>;
	if (d.version !== DIAGRAM_VERSION)
		throw new Error(`Unsupported diagram version: ${String(d.version)}`);
	if (!Array.isArray(d.boxes)) throw new Error("Diagram.boxes must be an array");
	if (!Array.isArray(d.connectors))
		throw new Error("Diagram.connectors must be an array");

	const ids = new Set<string>();
	for (const b of d.boxes as Box[]) {
		if (!b.id) throw new Error("Box missing id");
		if (ids.has(b.id)) throw new Error(`Duplicate box id: ${b.id}`);
		ids.add(b.id);
		if (!Array.isArray(b.fields)) throw new Error(`Box ${b.id} fields must be an array`);
		if (!Array.isArray(b.comments)) throw new Error(`Box ${b.id} comments must be an array`);
	}

	const cIds = new Set<string>();
	for (const c of d.connectors as Connector[]) {
		if (!c.id) throw new Error("Connector missing id");
		if (cIds.has(c.id)) throw new Error(`Duplicate connector id: ${c.id}`);
		cIds.add(c.id);
		if (!ids.has(c.source))
			throw new Error(`Connector ${c.id} references missing source: ${c.source}`);
		if (!ids.has(c.target))
			throw new Error(`Connector ${c.id} references missing target: ${c.target}`);
	}

	return d as unknown as Diagram;
}
