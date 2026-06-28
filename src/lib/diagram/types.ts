/**
 * Limn diagram model.
 *
 * A diagram is a typed graph and the single source of truth for an app's
 * structure. Deliberately loose: everything is a *box* with a name, a free-text
 * description, typed fields, and comments — plus *connectors* between boxes.
 * What a box "is" (a component, a screen, a model, anything) is expressed in its
 * description and connectors, not a rigid kind.
 *
 * It is plain JSON: `JSON.parse(JSON.stringify(diagram))` returns an identical
 * diagram (zero-loss round-trip).
 */

export const DIAGRAM_VERSION = 2 as const;

/** A typed field on a box (a prop, a model field, a piece of state, whatever). */
export interface Field {
	/** Stable id, so a field can be selected/edited/diffed across versions. */
	id: string;
	name: string;
	/** Free-form type expression, e.g. "string", "User", "Todo[]", "() => void". */
	type: string;
	/** Per-field note / intent. */
	note?: string;
}

/** A node in the diagram. */
export interface Box {
	/** Stable unique id. Renames keep the id; only `name` changes. */
	id: string;
	name: string;
	/** Free-text description of what this box is and does. */
	description?: string;
	fields: Field[];
	/** Free-text comments — intent the structure can't capture. Parsed into the prompt. */
	comments: string[];
	/** Canvas position. */
	x: number;
	y: number;
}

/** A directed relationship between two boxes. */
export interface Connector {
	id: string;
	/** Source box id. */
	source: string;
	/** Target box id. */
	target: string;
	/** Free-text label describing the relationship, e.g. "renders", "onSubmit → addTodo". */
	label?: string;
	/** Free-text comments on the relationship, parsed into the prompt. */
	comments: string[];
}

export interface Diagram {
	version: typeof DIAGRAM_VERSION;
	boxes: Box[];
	connectors: Connector[];
}
