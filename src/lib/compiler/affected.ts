import type { Box, Diagram } from "../diagram";
import type { DiffResult } from "./diff";

/**
 * The set of boxes that must appear in the emitted spec: every directly changed
 * box, plus its direct (1-hop) neighbours via connectors in the *new* graph.
 */
export function affectedBoxes(newD: Diagram, d: DiffResult): Box[] {
	const byId = new Map(newD.boxes.map((b) => [b.id, b]));
	const seed = new Set<string>();

	for (const c of d.boxes) if (c.status !== "removed") seed.add(c.id);
	for (const c of d.connectors) {
		const conn = c.after ?? c.before;
		if (!conn) continue;
		if (byId.has(conn.source)) seed.add(conn.source);
		if (byId.has(conn.target)) seed.add(conn.target);
	}

	const result = new Set(seed);
	for (const conn of newD.connectors) {
		if (seed.has(conn.source) && byId.has(conn.target)) result.add(conn.target);
		if (seed.has(conn.target) && byId.has(conn.source)) result.add(conn.source);
	}

	return [...result].map((id) => byId.get(id)).filter((b): b is Box => !!b);
}
