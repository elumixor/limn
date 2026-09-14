import { describe, expect, it } from "vitest";
import { PAI_EXAMPLE } from "../examples/pai";
import { type Block, DIAGRAM_VERSION, type Diagram, emptyDiagram, validate } from "../diagram";
import { diff, patch } from "./index";

function block(id: string, name = id, extra: Partial<Block> = {}): Block {
	return { id, name, comments: [], children: [], ...extra };
}

function sample(): Diagram {
	return {
		version: DIAGRAM_VERSION,
		blocks: [
			block("api", "API", { type: "module", comments: ["HTTP surface"], children: [block("routes", "routes")] }),
			block("db", "DB", { type: "database" }),
			block("ui", "UI", { type: "component" }),
		],
		connectors: [{ id: "c1", source: "api", target: "db", kind: "arrow", description: "persists in" }],
	};
}

describe("patch from scratch", () => {
	it("emits a build spec with every root in stable order", () => {
		const r = patch(emptyDiagram(), sample());
		expect(r.fromScratch).toBe(true);
		expect(r.noChange).toBe(false);
		expect(r.prompt).toMatch(/^# Build specification/);
		const order = ["### Database `DB`", "### Module `API`", "### Component `UI`"].map((h) => r.prompt.indexOf(h));
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(r.prompt).toContain("Intent: HTTP surface");
		expect(r.prompt).toContain("- `routes`");
		expect(r.prompt).toContain("- → `DB`: persists in");
		expect(r.prompt).toContain("- ← `API`: persists in");
	});

	it("reports nothing to do for two empty diagrams", () => {
		expect(patch(emptyDiagram(), emptyDiagram()).noChange).toBe(true);
	});

	it("is deterministic", () => {
		expect(patch(emptyDiagram(), sample()).prompt).toBe(patch(emptyDiagram(), sample()).prompt);
	});
});

describe("diff", () => {
	it("ignores layout", () => {
		const moved = sample();
		moved.blocks[0].x = 500;
		moved.blocks[0].children[0].w = 300;
		expect(diff(sample(), moved).empty).toBe(true);
		expect(patch(sample(), moved).noChange).toBe(true);
	});

	it("detects rename, comments, type and children", () => {
		const next = sample();
		next.blocks[0].name = "Gateway";
		next.blocks[0].comments.push("now with auth");
		next.blocks[2].type = "module";
		next.blocks[0].children.push(block("auth"));
		const d = diff(sample(), next);
		const api = d.blocks.find((c) => c.id === "api");
		expect(api?.details).toEqual(['renamed from "API" to "Gateway"', "comments changed", "children changed"]);
		expect(d.blocks.find((c) => c.id === "auth")?.status).toBe("added");
		expect(d.blocks.find((c) => c.id === "ui")?.details).toEqual(["type changed to module"]);
	});
});

describe("patch", () => {
	it("re-specifies changed roots and their neighbours only", () => {
		const next = sample();
		next.blocks[1].comments.push("Postgres");
		const r = patch(sample(), next);
		expect(r.fromScratch).toBe(false);
		expect(r.prompt).toContain("- Modified `DB`: comments changed");
		expect(r.prompt).toContain("### Database `DB`");
		expect(r.prompt).toContain("### Module `API`"); // neighbour via c1
		expect(r.prompt).not.toContain("### Component `UI`");
	});

	it("lists removals", () => {
		const next = sample();
		next.blocks.splice(2, 1);
		const r = patch(sample(), next);
		expect(r.prompt).toContain("- Delete `UI` and remove all references to it.");
	});

	it("attributes a nested change to its root", () => {
		const next = sample();
		next.blocks[0].children[0].name = "handlers";
		const r = patch(sample(), next);
		expect(r.prompt).toContain('- Modified `handlers`: renamed from "routes" to "handlers"');
		expect(r.prompt).toContain("### Module `API`");
	});
});

describe("pai example", () => {
	it("validates and compiles", () => {
		expect(() => validate(PAI_EXAMPLE)).not.toThrow();
		const r = patch(emptyDiagram(), PAI_EXAMPLE);
		expect(r.prompt).toContain("### Module `pai API`");
		expect(r.prompt).toContain("(via `event bus`)");
	});
});
