import { type Block, BLOCK_TYPES, type Connector, DIAGRAM_VERSION, type Diagram } from "./types";

export * from "./types";

/** The canonical empty diagram. */
export function emptyDiagram(): Diagram {
	return { version: DIAGRAM_VERSION, blocks: [], connectors: [] };
}

/** Depth-first walk over every block, with its parent (null for roots). */
export function walk(blocks: Block[], fn: (b: Block, parent: Block | null) => void, parent: Block | null = null): void {
	for (const b of blocks) {
		fn(b, parent);
		walk(b.children, fn, b);
	}
}

/** Find a block anywhere in the tree. */
export function findBlock(d: Diagram, id: string): Block | undefined {
	let found: Block | undefined;
	walk(d.blocks, (b) => {
		if (b.id === id) found = b;
	});
	return found;
}

/** Find the array (root list or a parent's children) that directly contains `id`. */
export function ownerList(d: Diagram, id: string): { list: Block[]; parent: Block | null } | undefined {
	if (d.blocks.some((b) => b.id === id)) return { list: d.blocks, parent: null };
	let result: { list: Block[]; parent: Block | null } | undefined;
	walk(d.blocks, (b) => {
		if (b.children.some((c) => c.id === id)) result = { list: b.children, parent: b };
	});
	return result;
}

/** True when `ancestorId` is `id` or an ancestor of `id` (used to prevent nesting cycles). */
export function isAncestor(d: Diagram, ancestorId: string, id: string): boolean {
	const a = findBlock(d, ancestorId);
	if (!a) return false;
	let hit = false;
	walk([a], (b) => {
		if (b.id === id) hit = true;
	});
	return hit;
}

/** Is this a root (canvas) block? */
export function isRoot(d: Diagram, id: string): boolean {
	return d.blocks.some((b) => b.id === id);
}

export function serialize(d: Diagram): string {
	return JSON.stringify(d, null, 2);
}

export function parse(json: string): Diagram {
	return validate(JSON.parse(json) as unknown);
}

/** Validate an unknown value as a Diagram, throwing on the first problem. */
export function validate(raw: unknown): Diagram {
	if (typeof raw !== "object" || raw === null) throw new Error("Diagram must be an object");
	const d = raw as Record<string, unknown>;
	if (d.version !== DIAGRAM_VERSION) throw new Error(`Unsupported diagram version: ${String(d.version)}`);
	if (!Array.isArray(d.blocks)) throw new Error("Diagram.blocks must be an array");
	if (!Array.isArray(d.connectors)) throw new Error("Diagram.connectors must be an array");

	const ids = new Set<string>();
	const check = (blocks: Block[]) => {
		for (const b of blocks) {
			if (!b.id) throw new Error("Block missing id");
			if (ids.has(b.id)) throw new Error(`Duplicate block id: ${b.id}`);
			ids.add(b.id);
			if (b.type !== undefined && !BLOCK_TYPES.includes(b.type)) throw new Error(`Block ${b.id} has invalid type: ${b.type}`);
			if (!Array.isArray(b.comments)) throw new Error(`Block ${b.id} comments must be an array`);
			if (!Array.isArray(b.children)) throw new Error(`Block ${b.id} children must be an array`);
			check(b.children);
		}
	};
	check(d.blocks as Block[]);

	const cIds = new Set<string>();
	for (const c of d.connectors as Connector[]) {
		if (!c.id) throw new Error("Connector missing id");
		if (cIds.has(c.id)) throw new Error(`Duplicate connector id: ${c.id}`);
		cIds.add(c.id);
		if (!ids.has(c.source)) throw new Error(`Connector ${c.id} missing source: ${c.source}`);
		if (!ids.has(c.target)) throw new Error(`Connector ${c.id} missing target: ${c.target}`);
	}

	return d as unknown as Diagram;
}
