/**
 * `patch(old, new)` — the one deterministic function Limn is built around.
 *
 * Empty `old` → a from-scratch build spec for the whole diagram. Otherwise a
 * patch spec: a change summary plus the full spec of every root block that
 * changed (or contains a change) and every root connected to one of those, so
 * the LLM sees each affected block in full rather than a bare delta.
 */
import { type Block, type Diagram, walk } from "../diagram";
import { type BlockChange, type ConnectorChange, type DiffResult, diff } from "./diff";
import { emitRoot, nameMap, sortedRoots } from "./emit";

export interface PatchResult {
	prompt: string;
	fromScratch: boolean;
	noChange: boolean;
}

const NO_CHANGE_PROMPT =
	"No changes between the previous and current diagram. The existing code is already correct; do not modify anything.";

const BUILD_PREAMBLE =
	"Build the system described below exactly. Every top-level block is a unit to implement; nested blocks are its parts (fields, sub-components, responsibilities). `Intent` lines are authoritative. `Relations` describe how units depend on and talk to each other.";

const PATCH_PREAMBLE =
	"Apply the changes below to the EXISTING codebase. This is a diff: only the listed units are affected. Leave everything else byte-identical — do not reformat, reorder, or rewrite code outside the scope described here. Make the minimal edits that satisfy the new specification.";

const PATCH_REMINDER =
	"Reminder: edit existing files in place. Any unit not mentioned above must remain exactly as it is in the current codebase.";

/** Root block that contains `id` (or is `id`). */
function rootOf(d: Diagram, id: string): Block | undefined {
	return d.blocks.find((root) => {
		let hit = false;
		walk([root], (b) => {
			if (b.id === id) hit = true;
		});
		return hit;
	});
}

/** Roots to re-specify: those containing a change, plus their direct neighbours via connectors. */
function affectedRoots(d: Diagram, r: DiffResult): Block[] {
	const changed = new Set<Block>();
	for (const c of r.blocks) {
		const root = rootOf(d, c.id);
		if (root) changed.add(root);
	}
	for (const c of r.connectors) {
		for (const end of [c.after?.source, c.after?.target]) {
			const root = end && rootOf(d, end);
			if (root) changed.add(root);
		}
	}
	const affected = new Set(changed);
	for (const root of changed) {
		walk([root], (b) => {
			for (const c of d.connectors) {
				const other = c.source === b.id ? c.target : c.target === b.id ? c.source : null;
				const neighbour = other && rootOf(d, other);
				if (neighbour) affected.add(neighbour);
			}
		});
	}
	return sortedRoots([...affected]);
}

function summarizeBlock(c: BlockChange): string {
	const name = (c.after ?? c.before)?.name ?? c.id;
	if (c.status === "added") return `- Added \`${name}\``;
	if (c.status === "removed") return `- Removed \`${name}\``;
	return `- Modified \`${name}\`: ${c.details.join(", ")}`;
}

function summarizeConnector(c: ConnectorChange, names: Map<string, string>): string {
	const e = c.after ?? c.before;
	if (!e) return `- ${c.status} relation`;
	const desc = `\`${names.get(e.source) ?? e.source}\` → \`${names.get(e.target) ?? e.target}\``;
	const verb = c.status === "added" ? "Added" : c.status === "removed" ? "Removed" : "Modified";
	return `- ${verb} relation ${desc}`;
}

export function patch(oldD: Diagram, newD: Diagram): PatchResult {
	const fromScratch = oldD.blocks.length === 0 && oldD.connectors.length === 0;
	const names = nameMap(oldD, newD);

	if (fromScratch) {
		const specs = sortedRoots(newD.blocks).map((r) => emitRoot(newD, r, names));
		if (!specs.length) return { prompt: NO_CHANGE_PROMPT, fromScratch, noChange: true };
		return {
			prompt: ["# Build specification", "", BUILD_PREAMBLE, "", "## Specification", "", specs.join("\n\n")].join("\n"),
			fromScratch,
			noChange: false,
		};
	}

	const d = diff(oldD, newD);
	if (d.empty) return { prompt: NO_CHANGE_PROMPT, fromScratch, noChange: true };

	const removed = d.blocks.filter((c) => c.status === "removed");
	const specs = affectedRoots(newD, d).map((r) => emitRoot(newD, r, names));

	const parts = [
		"# Patch specification",
		"",
		PATCH_PREAMBLE,
		"",
		"## Change summary",
		"",
		...d.blocks.map(summarizeBlock),
		...d.connectors.map((c) => summarizeConnector(c, names)),
	];
	if (removed.length) {
		parts.push("", "## Removals", ...removed.map((c) => `- Delete \`${c.before?.name ?? c.id}\` and remove all references to it.`));
	}
	if (specs.length) {
		parts.push(
			"",
			"## Affected specification",
			"These units (the changed ones and their direct neighbours) must match the following after the patch:",
			"",
			specs.join("\n\n"),
		);
	}
	parts.push("", "---", PATCH_REMINDER);
	return { prompt: parts.join("\n"), fromScratch, noChange: false };
}
