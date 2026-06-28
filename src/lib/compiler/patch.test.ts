import { describe, it, expect } from "vitest";
import {
	emptyDiagram,
	parse,
	serialize,
	type ComponentNode,
	type Diagram,
	type ModelNode,
	type RenderEdge,
} from "../diagram";
import { patch } from "./patch";
import { diff } from "./diff";

const comp = (id: string, name: string, over: Partial<ComponentNode> = {}): ComponentNode => ({
	id,
	kind: "component",
	name,
	props: [],
	state: [],
	...over,
});

const model = (id: string, name: string, over: Partial<ModelNode> = {}): ModelNode => ({
	id,
	kind: "model",
	name,
	fields: [],
	...over,
});

const render = (id: string, source: string, target: string): RenderEdge => ({
	id,
	kind: "render",
	source,
	target,
});

const diagram = (d: Partial<Diagram>): Diagram => ({
	version: 1,
	nodes: [],
	edges: [],
	...d,
});

describe("round-trip", () => {
	it("serializes and parses with zero loss", () => {
		const d = diagram({
			nodes: [
				model("m1", "Todo", { fields: [{ name: "title", type: "string" }, { name: "done", type: "boolean" }] }),
				comp("c1", "TodoList", { props: [{ name: "items", type: "Todo[]" }], state: [{ name: "filter", type: "string", initial: "'all'" }] }),
			],
			edges: [render("e1", "c1", "m1")],
		});
		expect(parse(serialize(d))).toEqual(d);
	});
});

describe("patch — from scratch", () => {
	it("treats empty old as a full build spec", () => {
		const next = diagram({ nodes: [comp("c1", "Counter", { state: [{ name: "count", type: "number", initial: "0" }] })] });
		const r = patch(emptyDiagram(), next);
		expect(r.fromScratch).toBe(true);
		expect(r.prompt).toContain("# Build specification");
		expect(r.prompt).toContain("Component `Counter`");
		expect(r.prompt).toContain("`count: number`");
		expect(r.prompt).toContain("initial `0`");
		// from-scratch has no change summary or patch instruction
		expect(r.prompt).not.toContain("byte-identical");
	});
});

describe("patch — edits", () => {
	const base = diagram({
		nodes: [
			comp("c1", "TodoList", { props: [{ name: "items", type: "Todo[]" }] }),
			comp("c2", "TodoItem", { props: [{ name: "todo", type: "Todo" }] }),
		],
		edges: [render("e1", "c1", "c2")],
	});

	it("detects a rename and emits a patch (not rebuild) prompt", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.nodes[1].name = "TodoRow";
		const r = patch(base, next);
		expect(r.fromScratch).toBe(false);
		expect(r.prompt).toContain("# Patch specification");
		expect(r.prompt).toContain("Renamed `TodoItem` → `TodoRow`");
		expect(r.prompt).toContain("byte-identical");
		// parent that renders the renamed node is pulled in as a dependent
		expect(r.prompt).toContain("Component `TodoList`");
	});

	it("detects an added prop as a modification", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		(next.nodes[1] as ComponentNode).props.push({ name: "onToggle", type: "() => void" });
		const r = patch(base, next);
		const d = diff(base, next);
		expect(d.nodes.find((c) => c.id === "c2")?.status).toBe("modified");
		expect(r.prompt).toContain('added prop "onToggle"');
		expect(r.prompt).toContain("`onToggle: () => void`");
	});

	it("detects a removed node and instructs deletion", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.nodes = next.nodes.filter((n) => n.id !== "c2");
		next.edges = [];
		const r = patch(base, next);
		expect(r.prompt).toContain("## Removals");
		expect(r.prompt).toContain("Delete component `TodoItem`");
	});

	it("reports no-change when diagrams are identical", () => {
		const r = patch(base, JSON.parse(JSON.stringify(base)));
		expect(r.noChange).toBe(true);
		expect(r.prompt).toContain("do not modify anything");
	});

	it("ignores layout-only (x/y) changes", () => {
		const next: Diagram = JSON.parse(JSON.stringify(base));
		next.nodes[0].x = 999;
		next.nodes[0].y = 123;
		const r = patch(base, next);
		expect(r.noChange).toBe(true);
	});
});

describe("event wiring emission", () => {
	it("describes event edges declaratively", () => {
		const d = diagram({
			nodes: [comp("c1", "AddButton"), comp("c2", "TodoApp")],
			edges: [{ id: "e1", kind: "event", source: "c1", target: "c2", event: "click", handler: "addTodo" }],
		});
		const r = patch(emptyDiagram(), d);
		expect(r.prompt).toContain("`click` event invokes `addTodo` on `TodoApp`");
		expect(r.prompt).toContain("exposes handler `addTodo`");
	});
});
