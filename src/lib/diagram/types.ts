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

export const DIAGRAM_VERSION = 5 as const;

/**
 * What a block represents. Purely semantic — it changes the icon/label shown in
 * the block header and (later) how the block compiles to prompt text. Absent
 * `type` reads as `DEFAULT_BLOCK_TYPE`, so old saves keep working unchanged.
 */
export const BLOCK_TYPES = ["component", "module", "data", "database", "external"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const DEFAULT_BLOCK_TYPE: BlockType = "component";

export interface Block {
	/** Stable unique id (unique across the whole diagram, at any depth). */
	id: string;
	name: string;
	/** Semantic kind (see `BlockType`). Absent means `DEFAULT_BLOCK_TYPE`. */
	type?: BlockType;
	/** Free-text comments — description, type, intent. Toggled inline per block. */
	comments: string[];
	/** Nested blocks (properties, sub-components — all the same thing). */
	children: Block[];
	/** Show comments inline in the block view (default true once a comment exists). */
	showComments?: boolean;
	/** Position of this block's comment bubble, as an offset (canvas px) from the
	 *  block's own top-left. Absent means the default placement (just below it). */
	commentPos?: { x: number; y: number };
	/** Canvas position — only meaningful for root blocks. */
	x?: number;
	y?: number;
	/** Explicit size set by resizing — applies to root and nested blocks alike. */
	w?: number;
	h?: number;
}

/** Arrowhead style of a connector. */
export type ConnectorKind = "line" | "arrow" | "double";

/**
 * A point fixed to a block's border, stored as a fraction of the block rect
 * (0..1 on each axis). It always lies on the border, so at least one of x/y is
 * 0 or 1. Following the block as it moves/resizes is automatic.
 */
export interface Anchor {
	x: number;
	y: number;
}

/** A relationship between two root blocks. */
export interface Connector {
	id: string;
	source: string;
	target: string;
	kind: ConnectorKind;
	/** Optional free-text description. When absent the relation reads as "source → target". */
	description?: string;
	/** Pinned border point on the source block. When absent it auto-tracks the target. */
	sourceAnchor?: Anchor;
	/** Pinned border point on the target block. When absent it auto-tracks the source. */
	targetAnchor?: Anchor;
}

/**
 * A rectangle on the **UI** canvas — a rough mockup frame the user draws freely.
 * Unlike blocks it has no tree, no comments, no semantics: it's a visual box that
 * a component (root block) can be *mapped* to. Coordinates are UI-canvas space.
 */
export interface UIElement {
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Links a component (root block) to the UI element that visually represents it. */
export interface Mapping {
	id: string;
	/** Root block id (the component). */
	blockId: string;
	/** UI element id (its visual representation). */
	elementId: string;
}

/**
 * A "public API" section attached to a block. The exposed content is itself a
 * full root block (`exposeId`) — free to hold a name, comments, and children —
 * tied to its owner (`ownerId`) by this relation, which draws the attachment
 * line and keeps the box moving with its owner. At most one per owner.
 */
export interface Expose {
	id: string;
	/** The block whose public API this is. */
	ownerId: string;
	/** Root block holding the exposed content (defaults to a box named "exposes"). */
	exposeId: string;
}

export interface Diagram {
	version: typeof DIAGRAM_VERSION;
	/** Root blocks (on the Components canvas). */
	blocks: Block[];
	connectors: Connector[];
	/** Free-drawn boxes on the UI canvas. */
	ui: UIElement[];
	/** Component → UI-element links. */
	mappings: Mapping[];
	/** Public-API sections attached to blocks. */
	exposes: Expose[];
}
