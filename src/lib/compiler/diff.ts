/**
 * Semantic diff of two diagrams. Layout (x/y/w/h, showComments) is ignored:
 * moving a box around is not a change in what gets built.
 */
import { type Block, type Connector, type Diagram, walk } from "../diagram";
import { meaningfulComments } from "./emit";

export type ChangeStatus = "added" | "removed" | "modified";

export interface BlockChange {
	id: string;
	status: ChangeStatus;
	before?: Block;
	after?: Block;
	/** Human-readable field-level changes (empty for added/removed). */
	details: string[];
}

export interface ConnectorChange {
	id: string;
	status: ChangeStatus;
	before?: Connector;
	after?: Connector;
}

export interface DiffResult {
	blocks: BlockChange[];
	connectors: ConnectorChange[];
	empty: boolean;
}

interface Located {
	block: Block;
	parentId: string | null;
}

function index(d: Diagram): Map<string, Located> {
	const m = new Map<string, Located>();
	walk(d.blocks, (block, parent) => m.set(block.id, { block, parentId: parent?.id ?? null }));
	return m;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Field-level differences of one block, excluding its subtree (children diff on their own). */
function describe(a: Located, b: Located): string[] {
	const out: string[] = [];
	if (a.block.name !== b.block.name) out.push(`renamed from "${a.block.name}" to "${b.block.name}"`);
	if ((a.block.type ?? "") !== (b.block.type ?? "")) out.push(`type changed to ${b.block.type ?? "default"}`);
	if (!sameList(meaningfulComments(a.block), meaningfulComments(b.block))) out.push("comments changed");
	if (a.parentId !== b.parentId) out.push(b.parentId ? "moved into another block" : "promoted to a root block");
	const childIds = (l: Located) => l.block.children.map((c) => c.id);
	if (!sameList(childIds(a), childIds(b))) out.push("children changed");
	return out;
}

function connectorKey(c: Connector): string {
	return JSON.stringify([c.source, c.target, c.kind, c.description?.trim() ?? ""]);
}

export function diff(oldD: Diagram, newD: Diagram): DiffResult {
	const before = index(oldD);
	const after = index(newD);

	const blocks: BlockChange[] = [];
	for (const [id, b] of after) {
		const a = before.get(id);
		if (!a) {
			blocks.push({ id, status: "added", after: b.block, details: [] });
			continue;
		}
		const details = describe(a, b);
		if (details.length) blocks.push({ id, status: "modified", before: a.block, after: b.block, details });
	}
	for (const [id, a] of before) {
		if (!after.has(id)) blocks.push({ id, status: "removed", before: a.block, details: [] });
	}

	const oldC = new Map(oldD.connectors.map((c) => [c.id, c]));
	const newC = new Map(newD.connectors.map((c) => [c.id, c]));
	const connectors: ConnectorChange[] = [];
	for (const [id, c] of newC) {
		const prev = oldC.get(id);
		if (!prev) connectors.push({ id, status: "added", after: c });
		else if (connectorKey(prev) !== connectorKey(c)) connectors.push({ id, status: "modified", before: prev, after: c });
	}
	for (const [id, c] of oldC) if (!newC.has(id)) connectors.push({ id, status: "removed", before: c });

	return { blocks, connectors, empty: !blocks.length && !connectors.length };
}
