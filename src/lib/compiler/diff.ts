import {
	nodeMap,
	edgeMap,
	type Diagram,
	type DiagramEdge,
	type DiagramNode,
} from "../diagram";

/** Status of a single node across two diagram versions. */
export type ChangeStatus = "added" | "removed" | "renamed" | "modified";

export interface NodeChange {
	id: string;
	status: ChangeStatus;
	/** Old version (absent for "added"). */
	before?: DiagramNode;
	/** New version (absent for "removed"). */
	after?: DiagramNode;
	/** Present when the name changed. */
	renamed?: { from: string; to: string };
	/** Human-readable descriptions of every field-level change. */
	details: string[];
}

export interface EdgeChange {
	id: string;
	status: ChangeStatus;
	before?: DiagramEdge;
	after?: DiagramEdge;
	details: string[];
}

export interface DiffResult {
	nodes: NodeChange[];
	edges: EdgeChange[];
	/** True when nothing changed between old and new. */
	empty: boolean;
}

/** Stable JSON for deep equality, with editor-only layout keys stripped. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (key, v) => {
		if (key === "x" || key === "y") return undefined; // layout is not semantic
		return v;
	});
}

/** Describe how two node versions differ, field by field. */
function describeNodeChanges(a: DiagramNode, b: DiagramNode): string[] {
	const out: string[] = [];
	if (a.name !== b.name) out.push(`renamed from "${a.name}" to "${b.name}"`);
	if ((a.annotation ?? "") !== (b.annotation ?? "")) out.push("annotation changed");

	if (a.kind === "component" && b.kind === "component") {
		out.push(...diffFields("prop", a.props, b.props));
		out.push(...diffFields("state", a.state, b.state));
	} else if (a.kind === "model" && b.kind === "model") {
		out.push(...diffFields("field", a.fields, b.fields));
	} else if (a.kind === "screen" && b.kind === "screen") {
		if ((a.route ?? "") !== (b.route ?? ""))
			out.push(`route changed from "${a.route ?? ""}" to "${b.route ?? ""}"`);
	}
	return out;
}

/** Diff two lists of named fields (props/state/model fields). */
function diffFields(
	label: string,
	a: ReadonlyArray<{ name: string; type?: string }>,
	b: ReadonlyArray<{ name: string; type?: string }>,
): string[] {
	const out: string[] = [];
	const am = new Map(a.map((f) => [f.name, f]));
	const bm = new Map(b.map((f) => [f.name, f]));
	for (const f of b) if (!am.has(f.name)) out.push(`added ${label} "${f.name}"`);
	for (const f of a) if (!bm.has(f.name)) out.push(`removed ${label} "${f.name}"`);
	for (const f of b) {
		const prev = am.get(f.name);
		if (prev && canonical(prev) !== canonical(f))
			out.push(`changed ${label} "${f.name}"`);
	}
	return out;
}

/** Diff node sets between two diagrams. */
function diffNodes(oldD: Diagram, newD: Diagram): NodeChange[] {
	const oldM = nodeMap(oldD);
	const newM = nodeMap(newD);
	const changes: NodeChange[] = [];

	for (const [id, after] of newM) {
		const before = oldM.get(id);
		if (!before) {
			changes.push({ id, status: "added", after, details: [] });
			continue;
		}
		if (canonical(before) === canonical(after)) continue;
		const details = describeNodeChanges(before, after);
		const renamed =
			before.name !== after.name
				? { from: before.name, to: after.name }
				: undefined;
		// A node that only changed its name is "renamed"; anything else is "modified".
		const onlyName = renamed && details.length === 1;
		changes.push({
			id,
			status: onlyName ? "renamed" : "modified",
			before,
			after,
			renamed,
			details,
		});
	}

	for (const [id, before] of oldM)
		if (!newM.has(id)) changes.push({ id, status: "removed", before, details: [] });

	return changes;
}

/** Diff edge sets between two diagrams. */
function diffEdges(oldD: Diagram, newD: Diagram): EdgeChange[] {
	const oldM = edgeMap(oldD);
	const newM = edgeMap(newD);
	const changes: EdgeChange[] = [];

	for (const [id, after] of newM) {
		const before = oldM.get(id);
		if (!before) {
			changes.push({ id, status: "added", after, details: [] });
			continue;
		}
		if (canonical(before) === canonical(after)) continue;
		changes.push({ id, status: "modified", before, after, details: ["edge wiring changed"] });
	}

	for (const [id, before] of oldM)
		if (!newM.has(id)) changes.push({ id, status: "removed", before, details: [] });

	return changes;
}

/** Compute the structural diff between two diagram versions. */
export function diff(oldD: Diagram, newD: Diagram): DiffResult {
	const nodes = diffNodes(oldD, newD);
	const edges = diffEdges(oldD, newD);
	return { nodes, edges, empty: nodes.length === 0 && edges.length === 0 };
}
