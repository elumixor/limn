import {
	nodeMap,
	type Diagram,
	type DiagramNode,
	type ComponentNode,
	type ModelNode,
	type ScreenNode,
} from "../diagram";
import type { DiffResult, NodeChange, EdgeChange } from "./diff";

/** Render a typed field as "name: type" (with "?" for optional) plus its note. */
function fieldLine(f: { name: string; type: string; optional?: boolean; note?: string }): string {
	const opt = f.optional ? "?" : "";
	const note = f.note ? ` — ${f.note}` : "";
	return `\`${f.name}${opt}: ${f.type}\`${note}`;
}

/** Names of nodes this node renders, via outgoing render edges. */
function childrenOf(d: Diagram, id: string, names: Map<string, string>): string[] {
	return d.edges
		.filter((e) => e.kind === "render" && e.source === id)
		.map((e) => names.get(e.target) ?? e.target);
}

/** Declarative description of event wiring touching this node. */
function eventsOf(d: Diagram, id: string, names: Map<string, string>): string[] {
	const out: string[] = [];
	for (const e of d.edges) {
		if (e.kind !== "event") continue;
		const src = names.get(e.source) ?? e.source;
		const tgt = names.get(e.target) ?? e.target;
		if (e.source === id)
			out.push(`its \`${e.event}\` event invokes \`${e.handler}\` on \`${tgt}\``);
		else if (e.target === id)
			out.push(`exposes handler \`${e.handler}\`, invoked by the \`${e.event}\` event of \`${src}\``);
	}
	return out;
}

/** Declarative description of data flow touching this node. */
function dataOf(d: Diagram, id: string, names: Map<string, string>): string[] {
	const out: string[] = [];
	for (const e of d.edges) {
		if (e.kind !== "data") continue;
		const what = e.field ? `\`${e.field}\`` : "data";
		const src = names.get(e.source) ?? e.source;
		const tgt = names.get(e.target) ?? e.target;
		if (e.source === id) out.push(`provides ${what} to \`${tgt}\``);
		else if (e.target === id) out.push(`receives ${what} from \`${src}\``);
	}
	return out;
}

function emitComponent(d: Diagram, n: ComponentNode, names: Map<string, string>): string {
	const lines: string[] = [`### Component \`${n.name}\``];
	if (n.annotation) lines.push(`Intent: ${n.annotation}`);

	if (n.props.length)
		lines.push(`Props: ${n.props.map(fieldLine).join("; ")}.`);
	else lines.push("Takes no props.");

	if (n.state.length)
		lines.push(
			`Local state: ${n.state
				.map((s) => `${fieldLine(s)}${s.initial ? ` (initial \`${s.initial}\`)` : ""}`)
				.join("; ")}.`,
		);

	const children = childrenOf(d, n.id, names);
	if (children.length)
		lines.push(`Renders: ${children.map((c) => `\`${c}\``).join(", ")}.`);

	const events = eventsOf(d, n.id, names);
	if (events.length) lines.push(`Events: ${events.join("; ")}.`);

	const data = dataOf(d, n.id, names);
	if (data.length) lines.push(`Data: ${data.join("; ")}.`);

	return lines.join("\n");
}

function emitScreen(d: Diagram, n: ScreenNode, names: Map<string, string>): string {
	const lines: string[] = [`### Screen \`${n.name}\``];
	if (n.route) lines.push(`Route: \`${n.route}\`.`);
	if (n.annotation) lines.push(`Intent: ${n.annotation}`);
	const children = childrenOf(d, n.id, names);
	if (children.length)
		lines.push(`Renders: ${children.map((c) => `\`${c}\``).join(", ")}.`);
	const data = dataOf(d, n.id, names);
	if (data.length) lines.push(`Data: ${data.join("; ")}.`);
	return lines.join("\n");
}

function emitModel(n: ModelNode): string {
	const lines: string[] = [`### Data model \`${n.name}\``];
	if (n.annotation) lines.push(`Intent: ${n.annotation}`);
	if (n.fields.length)
		lines.push(`Fields: ${n.fields.map(fieldLine).join("; ")}.`);
	else lines.push("Has no fields.");
	return lines.join("\n");
}

/** Emit the declarative spec for a single node. */
export function emitNode(d: Diagram, n: DiagramNode, names: Map<string, string>): string {
	switch (n.kind) {
		case "component":
			return emitComponent(d, n, names);
		case "screen":
			return emitScreen(d, n, names);
		case "model":
			return emitModel(n);
	}
}

/** One-line summary of a node change for the diff summary section. */
function summarizeNode(c: NodeChange): string {
	const name = (c.after ?? c.before)?.name ?? c.id;
	switch (c.status) {
		case "added":
			return `- Added ${(c.after as DiagramNode).kind} \`${name}\``;
		case "removed":
			return `- Removed ${(c.before as DiagramNode).kind} \`${name}\``;
		case "renamed":
			return `- Renamed \`${c.renamed?.from}\` → \`${c.renamed?.to}\``;
		case "modified":
			return `- Modified \`${name}\`: ${c.details.join(", ")}`;
	}
}

function summarizeEdge(c: EdgeChange, names: Map<string, string>): string {
	const e = c.after ?? c.before;
	if (!e) return `- ${c.status} edge`;
	const src = names.get(e.source) ?? e.source;
	const tgt = names.get(e.target) ?? e.target;
	const desc = `${e.kind} ${src} → ${tgt}`;
	if (c.status === "added") return `- Added ${desc}`;
	if (c.status === "removed") return `- Removed ${desc}`;
	return `- Modified ${desc}`;
}

/** Build the diff-summary section (only meaningful for non-empty old diagrams). */
export function emitDiffSummary(d: DiffResult, names: Map<string, string>): string {
	const lines: string[] = ["## Change summary", ""];
	for (const c of d.nodes) lines.push(summarizeNode(c));
	for (const c of d.edges) lines.push(summarizeEdge(c, names));
	return lines.join("\n");
}

/** Combine both diagrams' node names so edges to removed/old nodes still read well. */
export function combinedNames(oldD: Diagram, newD: Diagram): Map<string, string> {
	const names = new Map<string, string>();
	for (const n of oldD.nodes) names.set(n.id, n.name);
	for (const n of newD.nodes) names.set(n.id, n.name);
	return names;
}

export { nodeMap };
