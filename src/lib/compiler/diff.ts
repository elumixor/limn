import {
	boxMap,
	connectorMap,
	type Box,
	type Connector,
	type Diagram,
} from "../diagram";

export type ChangeStatus = "added" | "removed" | "renamed" | "modified";

export interface BoxChange {
	id: string;
	status: ChangeStatus;
	before?: Box;
	after?: Box;
	renamed?: { from: string; to: string };
	details: string[];
}

export interface ConnectorChange {
	id: string;
	status: ChangeStatus;
	before?: Connector;
	after?: Connector;
	details: string[];
}

export interface DiffResult {
	boxes: BoxChange[];
	connectors: ConnectorChange[];
	empty: boolean;
}

/** Stable JSON for deep equality, with editor-only layout keys stripped. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (key, v) => {
		if (key === "x" || key === "y") return undefined;
		return v;
	});
}

function describeBoxChanges(a: Box, b: Box): string[] {
	const out: string[] = [];
	if (a.name !== b.name) out.push(`renamed from "${a.name}" to "${b.name}"`);
	if ((a.description ?? "") !== (b.description ?? "")) out.push("description changed");

	const am = new Map(a.fields.map((f) => [f.id, f]));
	const bm = new Map(b.fields.map((f) => [f.id, f]));
	for (const f of b.fields) if (!am.has(f.id)) out.push(`added field "${f.name}"`);
	for (const f of a.fields) if (!bm.has(f.id)) out.push(`removed field "${f.name}"`);
	for (const f of b.fields) {
		const prev = am.get(f.id);
		if (prev && canonical(prev) !== canonical(f)) out.push(`changed field "${f.name}"`);
	}

	if (canonical(a.comments) !== canonical(b.comments)) out.push("comments changed");
	return out;
}

function diffBoxes(oldD: Diagram, newD: Diagram): BoxChange[] {
	const oldM = boxMap(oldD);
	const newM = boxMap(newD);
	const changes: BoxChange[] = [];

	for (const [id, after] of newM) {
		const before = oldM.get(id);
		if (!before) {
			changes.push({ id, status: "added", after, details: [] });
			continue;
		}
		if (canonical(before) === canonical(after)) continue;
		const details = describeBoxChanges(before, after);
		const renamed =
			before.name !== after.name ? { from: before.name, to: after.name } : undefined;
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

function diffConnectors(oldD: Diagram, newD: Diagram): ConnectorChange[] {
	const oldM = connectorMap(oldD);
	const newM = connectorMap(newD);
	const changes: ConnectorChange[] = [];

	for (const [id, after] of newM) {
		const before = oldM.get(id);
		if (!before) {
			changes.push({ id, status: "added", after, details: [] });
			continue;
		}
		if (canonical(before) === canonical(after)) continue;
		changes.push({ id, status: "modified", before, after, details: ["connector changed"] });
	}

	for (const [id, before] of oldM)
		if (!newM.has(id)) changes.push({ id, status: "removed", before, details: [] });

	return changes;
}

/** Compute the structural diff between two diagram versions. */
export function diff(oldD: Diagram, newD: Diagram): DiffResult {
	const boxes = diffBoxes(oldD, newD);
	const connectors = diffConnectors(oldD, newD);
	return { boxes, connectors, empty: boxes.length === 0 && connectors.length === 0 };
}
