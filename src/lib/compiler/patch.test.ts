import { describe, it, expect } from "vitest";
import {
	emptyDiagram,
	parse,
	serialize,
	type Box,
	type Connector,
	type Diagram,
} from "../diagram";
import { patch } from "./patch";
import { diff } from "./diff";

let n = 0;
const fid = () => `f${++n}`;

const box = (id: string, name: string, over: Partial<Box> = {}): Box => ({
	id,
	name,
	fields: [],
	comments: [],
	x: 0,
	y: 0,
	...over,
});

const conn = (id: string, source: string, target: string, label?: string): Connector => ({
	id,
	source,
	target,
	label,
	comments: [],
});

const diagram = (d: Partial<Diagram>): Diagram => ({
	version: 2,
	boxes: [],
	connectors: [],
	...d,
});

describe("round-trip", () => {
	it("serializes and parses with zero loss", () => {
		const d = diagram({
			boxes: [
				box("b1", "Todo", {
					description: "A todo item",
					fields: [
						{ id: fid(), name: "title", type: "string" },
						{ id: fid(), name: "done", type: "boolean" },
					],
					comments: ["persisted to localStorage"],
				}),
				box("b2", "TodoList", { fields: [{ id: fid(), name: "items", type: "Todo[]" }] }),
			],
			connectors: [conn("c1", "b2", "b1", "renders each")],
		});
		expect(parse(serialize(d))).toEqual(d);
	});
});

describe("patch — from scratch", () => {
	it("treats empty old as a full build spec", () => {
		const next = diagram({
			boxes: [box("b1", "Counter", { description: "increments a count", comments: ["starts at 0"] })],
		});
		const r = patch(emptyDiagram(), next);
		expect(r.fromScratch).toBe(true);
		expect(r.prompt).toContain("# Build specification");
		expect(r.prompt).toContain("### `Counter`");
		expect(r.prompt).toContain("increments a count");
		expect(r.prompt).toContain("Notes: starts at 0.");
		expect(r.prompt).not.toContain("byte-identical");
	});
});

describe("patch — edits", () => {
	const base = diagram({
		boxes: [
			box("b1", "TodoList", { fields: [{ id: "x1", name: "items", type: "Todo[]" }] }),
			box("b2", "TodoItem", { fields: [{ id: "x2", name: "todo", type: "Todo" }] }),
		],
		connectors: [conn("c1", "b1", "b2", "renders")],
	});

	it("detects a rename and emits a patch prompt", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.boxes[1].name = "TodoRow";
		const r = patch(base, next);
		expect(r.fromScratch).toBe(false);
		expect(r.prompt).toContain("# Patch specification");
		expect(r.prompt).toContain("Renamed `TodoItem` → `TodoRow`");
		expect(r.prompt).toContain("byte-identical");
		// neighbour pulled in
		expect(r.prompt).toContain("### `TodoList`");
	});

	it("detects an added field as a modification", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.boxes[1].fields.push({ id: "x3", name: "onToggle", type: "() => void" });
		const r = patch(base, next);
		const d = diff(base, next);
		expect(d.boxes.find((c) => c.id === "b2")?.status).toBe("modified");
		expect(r.prompt).toContain('added field "onToggle"');
		expect(r.prompt).toContain("`onToggle: () => void`");
	});

	it("detects a removed box and instructs deletion", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.boxes = next.boxes.filter((b: Box) => b.id !== "b2");
		next.connectors = [];
		const r = patch(base, next);
		expect(r.prompt).toContain("## Removals");
		expect(r.prompt).toContain("Delete `TodoItem`");
	});

	it("reports no-change when diagrams are identical", () => {
		const r = patch(base, JSON.parse(JSON.stringify(base)));
		expect(r.noChange).toBe(true);
		expect(r.prompt).toContain("do not modify anything");
	});

	it("ignores layout-only (x/y) changes", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.boxes[0].x = 999;
		next.boxes[0].y = 123;
		expect(patch(base, next).noChange).toBe(true);
	});
});

describe("connector emission", () => {
	it("describes connectors with their labels", () => {
		const d = diagram({
			boxes: [box("b1", "AddButton"), box("b2", "TodoApp")],
			connectors: [conn("c1", "b1", "b2", "click → addTodo")],
		});
		const r = patch(emptyDiagram(), d);
		expect(r.prompt).toContain("→ `TodoApp`: click → addTodo");
		expect(r.prompt).toContain("← `AddButton`: click → addTodo");
	});
});
