/**
 * Limn diagram model.
 *
 * A diagram is a typed graph and the single source of truth for an app's
 * structure. It is plain JSON: `JSON.parse(JSON.stringify(diagram))` returns an
 * identical diagram (zero-loss round-trip), because every field below is a
 * JSON-native value.
 */

export const DIAGRAM_VERSION = 1 as const;

/** What a node represents. */
export type NodeKind = "component" | "screen" | "model";

/** A typed field on a component's props or a data model. */
export interface TypedField {
	name: string;
	/** Free-form type expression, e.g. "string", "number", "User", "Todo[]". */
	type: string;
	/** When true the field may be absent / undefined. */
	optional?: boolean;
	/** Per-field intent the structure alone can't capture. */
	note?: string;
}

/** A piece of local (component-owned) reactive state. */
export interface StateField {
	name: string;
	type: string;
	/** Initial value expression, e.g. "0", "''", "[]", "false". */
	initial?: string;
	note?: string;
}

interface NodeBase {
	/** Stable unique id. Renames keep the id; only `name` changes. */
	id: string;
	kind: NodeKind;
	name: string;
	/** Free-text note describing intent the graph can't encode. */
	annotation?: string;
	/** Editor canvas position (ignored by the compiler). */
	x?: number;
	y?: number;
}

/** A UI component: typed props, local state, and (via render edges) children. */
export interface ComponentNode extends NodeBase {
	kind: "component";
	props: TypedField[];
	state: StateField[];
}

/** A routable screen / page that composes components. */
export interface ScreenNode extends NodeBase {
	kind: "screen";
	/** Route path, e.g. "/", "/todos", "/user/[id]". */
	route?: string;
}

/** A data model / entity shape. */
export interface ModelNode extends NodeBase {
	kind: "model";
	fields: TypedField[];
}

export type DiagramNode = ComponentNode | ScreenNode | ModelNode;

/** How two nodes relate. */
export type EdgeKind = "render" | "event" | "data";

interface EdgeBase {
	id: string;
	kind: EdgeKind;
	/** Source node id. */
	source: string;
	/** Target node id. */
	target: string;
	annotation?: string;
}

/** `source` renders `target` as a child in its output. */
export interface RenderEdge extends EdgeBase {
	kind: "render";
}

/** An event on `source` is wired to a handler on `target`. */
export interface EventEdge extends EdgeBase {
	kind: "event";
	/** Event name on the source, e.g. "click", "submit", "select". */
	event: string;
	/** Handler invoked on the target, e.g. "addTodo", "onSelect". */
	handler: string;
}

/** Data flows from `source` to `target`. */
export interface DataEdge extends EdgeBase {
	kind: "data";
	/** What flows, e.g. "todos", "currentUser". Optional. */
	field?: string;
}

export type DiagramEdge = RenderEdge | EventEdge | DataEdge;

export interface Diagram {
	version: typeof DIAGRAM_VERSION;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
}
