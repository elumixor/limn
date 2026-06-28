import type { Diagram, DiagramNode } from "../diagram";
import type { DiffResult } from "./diff";

/**
 * The set of nodes that must appear in the emitted spec: every directly
 * changed node, plus its direct (1-hop) dependents/neighbors in the *new*
 * graph — because a change to a node alters how its renderers, event targets
 * and data consumers must be (re)generated.
 */
export function affectedNodes(newD: Diagram, d: DiffResult): DiagramNode[] {
	const byId = new Map(newD.nodes.map((n) => [n.id, n]));
	const seed = new Set<string>();

	for (const c of d.nodes) if (c.status !== "removed") seed.add(c.id);
	// A changed edge affects both endpoints.
	for (const e of d.edges) {
		const edge = e.after ?? e.before;
		if (!edge) continue;
		if (byId.has(edge.source)) seed.add(edge.source);
		if (byId.has(edge.target)) seed.add(edge.target);
	}

	// Expand by one hop along edges in the new graph.
	const result = new Set(seed);
	for (const edge of newD.edges) {
		if (seed.has(edge.source) && byId.has(edge.target)) result.add(edge.target);
		if (seed.has(edge.target) && byId.has(edge.source)) result.add(edge.source);
	}

	return [...result].map((id) => byId.get(id)).filter((n): n is DiagramNode => !!n);
}
