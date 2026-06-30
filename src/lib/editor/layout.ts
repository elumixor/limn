/**
 * Shared freeform-nesting layout constants and helpers. Both the store (when
 * mutating the model) and the canvas controller (when resizing/measuring) size
 * parents to their children, so the rules live here in one place.
 */
import type { Block } from "../diagram";

/** Inset of a child from its parent's content-box edge. */
export const NEST_INSET = 8;
/** Vertical gap when auto-stacking freshly added children. */
export const NEST_GAP = 6;
export const DEFAULT_CHILD_W = 150;
export const DEFAULT_CHILD_H = 38;
/** Approx. height reserved above the children area (header + chrome). */
export const HEADER_ALLOW = 40;
export const MIN_PARENT_W = 180;
export const MIN_PARENT_H = 96;
/** Extra slack added to the right of children when fitting a parent's width. */
export const FIT_SLACK = 12;
/** Fallback size for a root block whose DOM size hasn't been measured yet. */
export const DEFAULT_ROOT_SIZE = { w: 180, h: 56 } as const;

/** Far right/bottom edge occupied by a block's direct children, in parent-local coords. */
export function childrenExtent(children: Block[]): { right: number; bottom: number } {
	let right = 0;
	let bottom = 0;
	for (const c of children) {
		right = Math.max(right, (c.x ?? 0) + (c.w ?? 0));
		bottom = Math.max(bottom, (c.y ?? 0) + (c.h ?? 0));
	}
	return { right, bottom };
}

/** The y a newly added child should stack at, below existing siblings. */
export function nextChildY(parent: Block): number {
	let y = NEST_INSET;
	for (const c of parent.children) y = Math.max(y, (c.y ?? 0) + (c.h ?? 0) + NEST_GAP);
	return y;
}

/** Ids of a block and all its descendants. */
export function descendantIds(block: Block): Set<string> {
	const ids = new Set<string>();
	const collect = (b: Block) => {
		ids.add(b.id);
		b.children.forEach(collect);
	};
	collect(block);
	return ids;
}
