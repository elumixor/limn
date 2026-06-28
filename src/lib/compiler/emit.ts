import type { Box, Diagram } from "../diagram";
import type { BoxChange, ConnectorChange, DiffResult } from "./diff";

function fieldLine(f: { name: string; type: string; note?: string }): string {
	const note = f.note ? ` — ${f.note}` : "";
	return `\`${f.name}: ${f.type}\`${note}`;
}

/** Connectors touching this box, described declaratively. */
function connectionsOf(d: Diagram, id: string, names: Map<string, string>): string[] {
	const out: string[] = [];
	for (const c of d.connectors) {
		const label = c.label ? `: ${c.label}` : "";
		const note = c.comments.length ? ` (${c.comments.join("; ")})` : "";
		if (c.source === id)
			out.push(`→ \`${names.get(c.target) ?? c.target}\`${label}${note}`);
		else if (c.target === id)
			out.push(`← \`${names.get(c.source) ?? c.source}\`${label}${note}`);
	}
	return out;
}

/** Emit the declarative spec for a single box. */
export function emitBox(d: Diagram, b: Box, names: Map<string, string>): string {
	const lines: string[] = [`### \`${b.name}\``];
	if (b.description) lines.push(b.description);
	if (b.fields.length) lines.push(`Fields: ${b.fields.map(fieldLine).join("; ")}.`);
	if (b.comments.length) lines.push(`Notes: ${b.comments.join("; ")}.`);
	const conns = connectionsOf(d, b.id, names);
	if (conns.length) lines.push(`Connections: ${conns.join("; ")}.`);
	return lines.join("\n");
}

function summarizeBox(c: BoxChange): string {
	const name = (c.after ?? c.before)?.name ?? c.id;
	switch (c.status) {
		case "added":
			return `- Added \`${name}\``;
		case "removed":
			return `- Removed \`${name}\``;
		case "renamed":
			return `- Renamed \`${c.renamed?.from}\` → \`${c.renamed?.to}\``;
		case "modified":
			return `- Modified \`${name}\`: ${c.details.join(", ")}`;
	}
}

function summarizeConnector(c: ConnectorChange, names: Map<string, string>): string {
	const e = c.after ?? c.before;
	if (!e) return `- ${c.status} connector`;
	const src = names.get(e.source) ?? e.source;
	const tgt = names.get(e.target) ?? e.target;
	const desc = `\`${src}\` → \`${tgt}\`${e.label ? ` (${e.label})` : ""}`;
	if (c.status === "added") return `- Added connector ${desc}`;
	if (c.status === "removed") return `- Removed connector ${desc}`;
	return `- Modified connector ${desc}`;
}

export function emitDiffSummary(d: DiffResult, names: Map<string, string>): string {
	const lines: string[] = ["## Change summary", ""];
	for (const c of d.boxes) lines.push(summarizeBox(c));
	for (const c of d.connectors) lines.push(summarizeConnector(c, names));
	return lines.join("\n");
}

export function combinedNames(oldD: Diagram, newD: Diagram): Map<string, string> {
	const names = new Map<string, string>();
	for (const b of oldD.boxes) names.set(b.id, b.name);
	for (const b of newD.boxes) names.set(b.id, b.name);
	return names;
}
