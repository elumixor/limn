import { describe, expect, it } from "vitest";
import { connectorGeo, curve, curveMid, nearestCardinal, pickCardinal, type Rect, resizeZones } from "./geometry";

const R: Rect = { x: 100, y: 100, w: 200, h: 100 };

describe("nearestCardinal", () => {
	it("snaps a point to the closest border anchor", () => {
		expect(nearestCardinal(R, { x: 200, y: 0 })).toEqual({ x: 0.5, y: 0 }); // above → top
		expect(nearestCardinal(R, { x: 500, y: 150 })).toEqual({ x: 1, y: 0.5 }); // right → right
		expect(nearestCardinal(R, { x: 200, y: 500 })).toEqual({ x: 0.5, y: 1 }); // below → bottom
		expect(nearestCardinal(R, { x: -50, y: 150 })).toEqual({ x: 0, y: 0.5 }); // left → left
	});
});

describe("pickCardinal", () => {
	it("picks the anchor whose outward normal points toward the target", () => {
		expect(pickCardinal(R, { x: 200, y: -100 })).toEqual({ x: 0.5, y: 0 }); // toward top
		expect(pickCardinal(R, { x: 1000, y: 150 })).toEqual({ x: 1, y: 0.5 }); // toward right
	});
});

describe("connectorGeo", () => {
	const A: Rect = { x: 0, y: 0, w: 100, h: 100 };
	const B: Rect = { x: 300, y: 0, w: 100, h: 100 };
	it("auto-faces each block toward the other when anchors are unpinned", () => {
		const g = connectorGeo(A, B);
		expect(g.p1).toEqual({ x: 100, y: 50 }); // A's right edge
		expect(g.p2).toEqual({ x: 300, y: 50 }); // B's left edge
		expect(g.d1).toEqual({ x: 1, y: 0 });
		expect(g.d2).toEqual({ x: -1, y: 0 });
	});
	it("honours pinned anchors over auto-facing", () => {
		const g = connectorGeo(A, B, { x: 0.5, y: 0 }, { x: 0.5, y: 1 });
		expect(g.p1).toEqual({ x: 50, y: 0 }); // A's top
		expect(g.p2).toEqual({ x: 350, y: 100 }); // B's bottom
	});
});

describe("curve / curveMid", () => {
	const g = connectorGeo({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 });
	it("emits a cubic bezier that starts and ends at the endpoints", () => {
		expect(curve(g)).toMatch(/^M 100 50 C .* 300 50$/);
	});
	it("anchors the label on the curve's centre", () => {
		expect(curveMid(g).y).toBeCloseTo(50);
	});
});

describe("resizeZones", () => {
	it("lays out 8 hit-zones (4 corners then 4 edges) straddling the block border", () => {
		const zones = resizeZones(R);
		expect(zones.map((z) => z.dir)).toEqual(["nw", "ne", "se", "sw", "n", "s", "w", "e"]);
		// corner zones straddle the corner: a 12px box centred on it
		expect(zones[0]).toMatchObject({ dir: "nw", left: 94, top: 94, width: 12, height: 12 });
	});
});
