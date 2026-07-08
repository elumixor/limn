/**
 * Pure canvas geometry: connection anchors, bezier connector paths, and resize
 * hit-zones. Everything here is a plain function of rectangles and points — no
 * DOM, no editor state — so it's cheap to reason about and unit-test.
 */
import type { Anchor, Side } from "../diagram";

export type Rect = { x: number; y: number; w: number; h: number };

/** Rect of an "exposes" panel glued to `side` of owner rect `o`, extending
 *  outward by `extent`. It shares the owner's height (left/right) or width
 *  (top/bottom) so it reads as growing straight out of that edge. */
export function exposeRect(o: Rect, side: Side, extent: number): Rect {
	switch (side) {
		case "right":
			return { x: o.x + o.w, y: o.y, w: extent, h: o.h };
		case "left":
			return { x: o.x - extent, y: o.y, w: extent, h: o.h };
		case "bottom":
			return { x: o.x, y: o.y + o.h, w: o.w, h: extent };
		case "top":
			return { x: o.x, y: o.y - extent, w: o.w, h: extent };
	}
}

/** How far past a block's border a connection handle is pushed. */
export const HANDLE_OFFSET = 13;
/** How far the resize-sensitive band reaches on either side of a block edge. */
export const EDGE = 6;

/** The 4 connection points: top / right / bottom / left, each with an outward normal. */
export const CARDINALS = [
	{ key: "t", anchor: { x: 0.5, y: 0 }, dx: 0, dy: -1 },
	{ key: "r", anchor: { x: 1, y: 0.5 }, dx: 1, dy: 0 },
	{ key: "b", anchor: { x: 0.5, y: 1 }, dx: 0, dy: 1 },
	{ key: "l", anchor: { x: 0, y: 0.5 }, dx: -1, dy: 0 },
] as const;
export type Cardinal = (typeof CARDINALS)[number];

export function center(r: Rect) {
	return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Absolute canvas point of a normalized border anchor. */
export function anchorPoint(r: Rect, a: Anchor) {
	return { x: r.x + a.x * r.w, y: r.y + a.y * r.h };
}

/** Nearest of the 4 cardinal connection anchors (top/right/bottom/left) to `p`. */
export function nearestCardinal(r: Rect, p: { x: number; y: number }): Anchor {
	let best: Cardinal = CARDINALS[0];
	let bestD = Infinity;
	for (const c of CARDINALS) {
		const ap = anchorPoint(r, c.anchor);
		const d = Math.hypot(ap.x - p.x, ap.y - p.y);
		if (d < bestD) {
			bestD = d;
			best = c;
		}
	}
	return best.anchor;
}

/** Absolute canvas position of a cardinal connection handle, offset outside the block. */
export function handlePoint(r: Rect, c: Cardinal) {
	const p = anchorPoint(r, c.anchor);
	return { x: p.x + c.dx * HANDLE_OFFSET, y: p.y + c.dy * HANDLE_OFFSET };
}

/** Invisible hit-zones straddling the block's 4 edges and 4 corners. */
export function resizeZones(r: Rect) {
	const c = EDGE * 2; // corner / band thickness
	const L = r.x;
	const T = r.y;
	const R = r.x + r.w;
	const B = r.y + r.h;
	return [
		{ dir: "nw", left: L - EDGE, top: T - EDGE, width: c, height: c },
		{ dir: "ne", left: R - EDGE, top: T - EDGE, width: c, height: c },
		{ dir: "se", left: R - EDGE, top: B - EDGE, width: c, height: c },
		{ dir: "sw", left: L - EDGE, top: B - EDGE, width: c, height: c },
		{ dir: "n", left: L + EDGE, top: T - EDGE, width: r.w - c, height: c },
		{ dir: "s", left: L + EDGE, top: B - EDGE, width: r.w - c, height: c },
		{ dir: "w", left: L - EDGE, top: T + EDGE, width: c, height: r.h - c },
		{ dir: "e", left: R - EDGE, top: T + EDGE, width: c, height: r.h - c },
	];
}

export function resizeCursor(dir: string) {
	if (dir === "nw" || dir === "se") return "nwse-resize";
	if (dir === "ne" || dir === "sw") return "nesw-resize";
	return dir === "n" || dir === "s" ? "ns-resize" : "ew-resize";
}

/** Outward unit normal of a cardinal anchor (top→up, right→right, …). */
export function anchorDir(a: Anchor): { x: number; y: number } {
	if (a.y === 0) return { x: 0, y: -1 };
	if (a.y === 1) return { x: 0, y: 1 };
	if (a.x === 0) return { x: -1, y: 0 };
	return { x: 1, y: 0 };
}

/** Pick the cardinal anchor whose outward normal best points toward `toward`. */
export function pickCardinal(r: Rect, toward: { x: number; y: number }): Anchor {
	const c = center(r);
	const vx = toward.x - c.x;
	const vy = toward.y - c.y;
	let best: Cardinal = CARDINALS[0];
	let bestDot = -Infinity;
	for (const cc of CARDINALS) {
		const dot = cc.dx * vx + cc.dy * vy;
		if (dot > bestDot) {
			bestDot = dot;
			best = cc;
		}
	}
	return best.anchor;
}

export type Geo = { p1: Anchor; p2: Anchor; d1: Anchor; d2: Anchor };

/** Connector endpoints and their outward normals. Each end snaps to a cardinal
 *  point: the pinned one if set, else the one facing the other block's centre. */
export function connectorGeo(a: Rect, b: Rect, sourceAnchor?: Anchor, targetAnchor?: Anchor): Geo {
	const sa = sourceAnchor ?? pickCardinal(a, center(b));
	const ta = targetAnchor ?? pickCardinal(b, center(a));
	return { p1: anchorPoint(a, sa), p2: anchorPoint(b, ta), d1: anchorDir(sa), d2: anchorDir(ta) };
}

/** Bezier control points, pushed out from each endpoint along its normal. */
export function controls(g: Geo) {
	const k = Math.max(40, Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y) * 0.4);
	return {
		c1: { x: g.p1.x + g.d1.x * k, y: g.p1.y + g.d1.y * k },
		c2: { x: g.p2.x + g.d2.x * k, y: g.p2.y + g.d2.y * k },
	};
}

/** Cubic-bezier path string, control points pushed out along each end's normal. */
export function curve(g: Geo) {
	const { c1, c2 } = controls(g);
	return `M ${g.p1.x} ${g.p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${g.p2.x} ${g.p2.y}`;
}

/** Point on the bezier at t=0.5 — used to anchor the connector's label. */
export function curveMid(g: Geo) {
	const { c1, c2 } = controls(g);
	return {
		x: 0.125 * g.p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * g.p2.x,
		y: 0.125 * g.p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * g.p2.y,
	};
}
