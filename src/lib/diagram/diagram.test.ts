import { describe, expect, it } from "vitest";
import {
	type Block,
	DIAGRAM_VERSION,
	type Diagram,
	emptyDiagram,
	findBlock,
	isAncestor,
	isRoot,
	ownerList,
	parse,
	serialize,
	validate,
	walk,
} from "./index";

function block(id: string, children: Block[] = []): Block {
	return { id, name: id, comments: [], children };
}

/** a → (b → c), d  plus one connector a→d and a UI frame mapped to a. */
function sample(): Diagram {
	return {
		version: DIAGRAM_VERSION,
		blocks: [block("a", [block("b", [block("c")])]), block("d")],
		connectors: [{ id: "x", source: "a", target: "d", kind: "arrow" }],
		ui: [{ id: "u1", label: "Frame", x: 0, y: 0, w: 180, h: 120 }],
		mappings: [{ id: "m1", blockId: "a", elementId: "u1" }],
	};
}

describe("emptyDiagram", () => {
	it("is a valid, versioned, empty diagram", () => {
		const d = emptyDiagram();
		expect(d).toEqual({ version: DIAGRAM_VERSION, blocks: [], connectors: [], ui: [], mappings: [] });
		expect(() => validate(d)).not.toThrow();
	});
});

describe("walk", () => {
	it("visits every block depth-first with its parent", () => {
		const seen: Array<[string, string | null]> = [];
		walk(sample().blocks, (b, parent) => seen.push([b.id, parent?.id ?? null]));
		expect(seen).toEqual([
			["a", null],
			["b", "a"],
			["c", "b"],
			["d", null],
		]);
	});
});

describe("findBlock", () => {
	it("finds blocks at any depth and returns undefined for misses", () => {
		const d = sample();
		expect(findBlock(d, "c")?.id).toBe("c");
		expect(findBlock(d, "nope")).toBeUndefined();
	});
});

describe("ownerList", () => {
	it("returns the root list with a null parent for roots", () => {
		const d = sample();
		const owner = ownerList(d, "a");
		expect(owner?.parent).toBeNull();
		expect(owner?.list).toBe(d.blocks);
	});
	it("returns the parent's children list for nested blocks", () => {
		const d = sample();
		const owner = ownerList(d, "c");
		expect(owner?.parent?.id).toBe("b");
		expect(owner?.list.map((b) => b.id)).toEqual(["c"]);
	});
	it("returns undefined for unknown ids", () => {
		expect(ownerList(sample(), "nope")).toBeUndefined();
	});
});

describe("isAncestor / isRoot", () => {
	it("treats a block as its own ancestor and detects real ancestry", () => {
		const d = sample();
		expect(isAncestor(d, "a", "a")).toBe(true);
		expect(isAncestor(d, "a", "c")).toBe(true);
		expect(isAncestor(d, "c", "a")).toBe(false);
		expect(isAncestor(d, "d", "c")).toBe(false);
	});
	it("identifies root blocks", () => {
		const d = sample();
		expect(isRoot(d, "a")).toBe(true);
		expect(isRoot(d, "b")).toBe(false);
	});
});

describe("serialize / parse round-trip", () => {
	it("round-trips losslessly", () => {
		const d = sample();
		expect(parse(serialize(d))).toEqual(d);
	});
});

describe("validate", () => {
	it("accepts a well-formed diagram", () => {
		expect(() => validate(sample())).not.toThrow();
	});
	it("rejects non-objects and wrong versions", () => {
		expect(() => validate(null)).toThrow();
		expect(() => validate({ version: 1, blocks: [], connectors: [] })).toThrow(/version/);
	});
	it("rejects malformed block/connector shapes", () => {
		expect(() => validate({ version: DIAGRAM_VERSION, blocks: {}, connectors: [] })).toThrow(/blocks/);
		expect(() => validate({ version: DIAGRAM_VERSION, blocks: [], connectors: {} })).toThrow(/connectors/);
	});
	it("rejects duplicate block ids, even when nested", () => {
		const dupe: Diagram = {
			version: DIAGRAM_VERSION,
			blocks: [block("a", [block("a")])],
			connectors: [],
			ui: [],
			mappings: [],
		};
		expect(() => validate(dupe)).toThrow(/Duplicate block id/);
	});
	it("rejects connectors that reference missing endpoints", () => {
		const bad: Diagram = {
			version: DIAGRAM_VERSION,
			blocks: [block("a")],
			connectors: [{ id: "x", source: "a", target: "ghost", kind: "arrow" }],
			ui: [],
			mappings: [],
		};
		expect(() => validate(bad)).toThrow(/missing target/);
	});
	it("rejects duplicate connector ids", () => {
		const bad: Diagram = {
			version: DIAGRAM_VERSION,
			blocks: [block("a"), block("b")],
			connectors: [
				{ id: "x", source: "a", target: "b", kind: "arrow" },
				{ id: "x", source: "b", target: "a", kind: "arrow" },
			],
			ui: [],
			mappings: [],
		};
		expect(() => validate(bad)).toThrow(/Duplicate connector id/);
	});
	it("rejects mappings that reference a missing block or element", () => {
		expect(() =>
			validate({
				version: DIAGRAM_VERSION,
				blocks: [block("a")],
				connectors: [],
				ui: [{ id: "u1", label: "F", x: 0, y: 0, w: 1, h: 1 }],
				mappings: [{ id: "m1", blockId: "ghost", elementId: "u1" }],
			}),
		).toThrow(/references missing block/);
		expect(() =>
			validate({
				version: DIAGRAM_VERSION,
				blocks: [block("a")],
				connectors: [],
				ui: [],
				mappings: [{ id: "m1", blockId: "a", elementId: "ghost" }],
			}),
		).toThrow(/references missing UI element/);
	});
	it("migrates a v3 diagram forward when parsing", () => {
		const legacy = JSON.stringify({ version: 3, blocks: [block("a")], connectors: [] });
		const d = parse(legacy);
		expect(d.version).toBe(DIAGRAM_VERSION);
		expect(d.ui).toEqual([]);
		expect(d.mappings).toEqual([]);
	});
});
