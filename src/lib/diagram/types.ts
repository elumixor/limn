/**
 * Limn diagram model.
 *
 * Everything is a recursive **Block**: a name, free-text comments, and child
 * blocks. A "property" is just a child block; a sub-component is just a child
 * block. There is no separate field/property/component distinction — depth and
 * comments carry the meaning, and it all concatenates to text later.
 *
 * Root blocks live on the canvas (they have x/y); nested blocks flow inside
 * their parent. **Connectors** relate two root blocks.
 *
 * Plain JSON: `JSON.parse(JSON.stringify(diagram))` round-trips losslessly.
 */

export const DIAGRAM_VERSION = 3 as const;

export interface Block {
	/** Stable unique id (unique across the whole diagram, at any depth). */
	id: string;
	name: string;
	/** Free-text comments — description, type, intent. Toggled inline per block. */
	comments: string[];
	/** Nested blocks (properties, sub-components — all the same thing). */
	children: Block[];
	/** Show comments inline in the block view (default true once a comment exists). */
	showComments?: boolean;
	/** Hide children in the block view. */
	collapsed?: boolean;
	/** Canvas position — only meaningful for root blocks. */
	x?: number;
	y?: number;
}

/** Arrowhead style of a connector. */
export type ConnectorKind = "line" | "arrow" | "double";

/** A relationship between two root blocks. */
export interface Connector {
	id: string;
	source: string;
	target: string;
	kind: ConnectorKind;
	/** Optional free-text description. When absent the relation reads as "source → target". */
	description?: string;
}

export interface Diagram {
	version: typeof DIAGRAM_VERSION;
	/** Root blocks (on the canvas). */
	blocks: Block[];
	connectors: Connector[];
}
