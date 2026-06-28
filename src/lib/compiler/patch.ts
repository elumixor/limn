import type { Diagram } from "../diagram";
import { diff } from "./diff";
import { affectedBoxes } from "./affected";
import { combinedNames, emitBox, emitDiffSummary } from "./emit";

export interface PatchResult {
	prompt: string;
	fromScratch: boolean;
	noChange: boolean;
}

/**
 * The one deterministic function Limn is built around.
 *
 * `patch(old, new)` diffs two diagram states and emits a structured prompt that
 * specifies exactly what to build (from scratch when `old` is empty) or what to
 * change (patching existing code when `old` is non-empty). Same inputs always
 * produce the same output — no randomness, no LLM call.
 *
 * NOTE: not currently wired into the editor UI; kept here for the next phase.
 */
export function patch(oldD: Diagram, newD: Diagram): PatchResult {
	const fromScratch = oldD.boxes.length === 0 && oldD.connectors.length === 0;
	const d = diff(oldD, newD);
	const names = combinedNames(oldD, newD);

	if (d.empty)
		return {
			prompt:
				"No changes between the previous and current diagram. The existing code is already correct; do not modify anything.",
			fromScratch,
			noChange: true,
		};

	const affected = affectedBoxes(newD, d);
	affected.sort((a, b) => a.name.localeCompare(b.name));
	const specs = affected.map((b) => emitBox(newD, b, names));
	const removed = d.boxes.filter((c) => c.status === "removed");

	const parts: string[] = [];

	if (fromScratch) {
		parts.push(
			"# Build specification",
			"",
			"Generate a SvelteKit + TypeScript application matching the specification below exactly. Implement every box as described, with its fields (and their types), described behaviour, comments (as intent), and connections to other boxes.",
		);
	} else {
		parts.push(
			"# Patch specification",
			"",
			"Apply the changes below to the EXISTING codebase. This is a diff: only the listed boxes are affected. Leave every unaffected region of the code byte-identical — do not reformat, reorder, or rewrite code outside the scope described here. Use the existing code as the anchor and make the minimal edits that satisfy the new specification.",
			"",
			emitDiffSummary(d, names),
		);
		if (removed.length)
			parts.push(
				"",
				"## Removals",
				...removed.map((c) => `- Delete \`${c.before?.name ?? c.id}\` and remove all references to it.`),
			);
	}

	parts.push(
		"",
		fromScratch ? "## Specification" : "## Affected specification",
		fromScratch
			? ""
			: "These boxes (the changed boxes and their direct neighbours) must match the following after the patch:",
		"",
		specs.join("\n\n"),
	);

	if (!fromScratch)
		parts.push(
			"",
			"---",
			"Reminder: edit existing files in place. Any box not mentioned above must remain exactly as it is in the current codebase.",
		);

	return { prompt: parts.join("\n"), fromScratch, noChange: false };
}
