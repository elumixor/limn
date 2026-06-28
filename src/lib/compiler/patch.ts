import type { Diagram } from "../diagram";
import { diff } from "./diff";
import { affectedNodes } from "./affected";
import { combinedNames, emitDiffSummary, emitNode } from "./emit";

export interface PatchResult {
	/** The structured prompt to paste into an LLM. */
	prompt: string;
	/** True when `old` was empty — i.e. a from-scratch generation. */
	fromScratch: boolean;
	/** True when nothing changed (prompt explains there's nothing to do). */
	noChange: boolean;
}

/**
 * The one deterministic function Limn is built around.
 *
 * `patch(old, new)` diffs two diagram states and emits a structured prompt that
 * specifies exactly what to build (from scratch when `old` is empty) or what to
 * change (patching existing code when `old` is non-empty). Same inputs always
 * produce the same output — no randomness, no LLM call.
 */
export function patch(oldD: Diagram, newD: Diagram): PatchResult {
	const fromScratch = oldD.nodes.length === 0 && oldD.edges.length === 0;
	const d = diff(oldD, newD);
	const names = combinedNames(oldD, newD);

	if (d.empty)
		return {
			prompt:
				"No changes between the previous and current diagram. The existing code is already correct; do not modify anything.",
			fromScratch,
			noChange: true,
		};

	const affected = affectedNodes(newD, d);
	// Stable ordering: models first (dependencies), then screens, then components.
	const order = { model: 0, screen: 1, component: 2 } as const;
	affected.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));

	const specs = affected.map((n) => emitNode(newD, n, names));

	const removed = d.nodes.filter((c) => c.status === "removed");

	const parts: string[] = [];

	if (fromScratch) {
		parts.push(
			"# Build specification",
			"",
			"Generate a SvelteKit + TypeScript application matching the specification below exactly. Implement every component, screen, and data model as described, with the stated props (and their types), local state, rendering, event wiring, and data flow. Treat each `Intent` line as the authoritative purpose of that node.",
		);
	} else {
		parts.push(
			"# Patch specification",
			"",
			"Apply the changes below to the EXISTING codebase. This is a diff: only the listed nodes are affected. Leave every unaffected region of the code byte-identical — do not reformat, reorder, or rewrite code outside the scope described here. Use the existing code as the anchor and make the minimal edits that satisfy the new specification.",
			"",
			emitDiffSummary(d, names),
		);
		if (removed.length) {
			parts.push(
				"",
				"## Removals",
				...removed.map((c) => {
					const n = c.before;
					return `- Delete ${n?.kind} \`${n?.name ?? c.id}\` and remove all references to it.`;
				}),
			);
		}
	}

	parts.push(
		"",
		fromScratch ? "## Specification" : "## Affected specification",
		fromScratch
			? ""
			: "These nodes (the changed nodes and their direct dependents) must match the following after the patch:",
		"",
		specs.join("\n\n"),
	);

	if (!fromScratch)
		parts.push(
			"",
			"---",
			"Reminder: edit existing files in place. Any component, screen, or model not mentioned above must remain exactly as it is in the current codebase.",
		);

	return { prompt: parts.join("\n"), fromScratch, noChange: false };
}
