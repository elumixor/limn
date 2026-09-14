/**
 * Turns the Block model into declarative prose an LLM can build from.
 *
 * Every block emits the same way regardless of depth: a name, its comments as
 * intent bullets, then its children indented one level deeper. Connectors are
 * listed on both blocks they touch so each block's section reads standalone.
 */
import { type Block, type BlockType, type Connector, DEFAULT_BLOCK_TYPE, type Diagram, walk } from "../diagram";

const TYPE_LABEL: Record<BlockType, string> = {
	component: "Component",
	module: "Module",
	data: "Data",
	database: "Database",
};

const INDENT = "  ";

/** Block id → display name, across every depth. */
export function nameMap(...diagrams: readonly Diagram[]): Map<string, string> {
	const names = new Map<string, string>();
	for (const d of diagrams) walk(d.blocks, (b) => names.set(b.id, b.name));
	return names;
}

/** Comments with whitespace-only entries dropped — those are placeholders left by the editor. */
export function meaningfulComments(b: Block): readonly string[] {
	return b.comments.map((c) => c.trim()).filter(Boolean);
}

function typeLabel(b: Block): string {
	return TYPE_LABEL[b.type ?? DEFAULT_BLOCK_TYPE];
}

/** One nested block as an indented bullet tree. */
function emitChild(b: Block, depth: number): string[] {
	const pad = INDENT.repeat(depth);
	const comments = meaningfulComments(b);
	const head = `${pad}- \`${b.name}\`${b.type ? ` (${typeLabel(b).toLowerCase()})` : ""}${comments.length ? ` — ${comments.join(" ")}` : ""}`;
	return [head, ...b.children.flatMap((c) => emitChild(c, depth + 1))];
}

/** Human reading of one connector, from the point of view of `id`. */
function relationLine(c: Connector, id: string, names: Map<string, string>): string {
	const other = names.get(c.source === id ? c.target : c.source) ?? "?";
	const outgoing = c.source === id;
	const glyph = c.kind === "double" ? "↔" : c.kind === "line" ? "–" : outgoing ? "→" : "←";
	const desc = c.description?.trim();
	return `- ${glyph} \`${other}\`${desc ? `: ${desc}` : ""}`;
}

/** Connectors touching `id` or anything nested under it (nested blocks can connect too). */
function relationsOf(d: Diagram, root: Block, names: Map<string, string>): string[] {
	const lines: string[] = [];
	walk([root], (b) => {
		for (const c of d.connectors) {
			if (c.source !== b.id && c.target !== b.id) continue;
			const via = b.id === root.id ? "" : ` (via \`${b.name}\`)`;
			lines.push(`${relationLine(c, b.id, names)}${via}`);
		}
	});
	return lines;
}

/** The full section for one root block. */
export function emitRoot(d: Diagram, root: Block, names: Map<string, string>): string {
	const lines: string[] = [`### ${typeLabel(root)} \`${root.name}\``];
	for (const c of meaningfulComments(root)) lines.push(`Intent: ${c}`);
	if (root.children.length) {
		lines.push("Contains:");
		lines.push(...root.children.flatMap((c) => emitChild(c, 0)));
	}
	const relations = relationsOf(d, root, names);
	if (relations.length) {
		lines.push("Relations:");
		lines.push(...relations);
	}
	return lines.join("\n");
}

/** Stable ordering so the same diagram always yields the same text: data first, then storage, modules, components. */
const ORDER: Record<BlockType, number> = { data: 0, database: 1, module: 2, component: 3 };

export function sortedRoots(blocks: readonly Block[]): Block[] {
	return [...blocks].sort(
		(a, b) => ORDER[a.type ?? DEFAULT_BLOCK_TYPE] - ORDER[b.type ?? DEFAULT_BLOCK_TYPE] || a.name.localeCompare(b.name),
	);
}
