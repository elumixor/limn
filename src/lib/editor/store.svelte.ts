import {
	emptyDiagram,
	serialize,
	validate,
	type Box,
	type Connector,
	type Diagram,
	type Field,
} from "../diagram";

const STORAGE_KEY = "limn.diagram.v2";

function uid(prefix: string): string {
	const rand =
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${prefix}_${rand}`;
}

/** What is currently selected (drives keyboard ops and highlight). */
export type Selection =
	| { type: "box"; id: string }
	| { type: "field"; boxId: string; fieldId: string }
	| { type: "comment"; boxId: string; index: number }
	| { type: "connector"; id: string }
	| null;

function loadInitial(): Diagram {
	if (typeof localStorage === "undefined") return emptyDiagram();
	const saved = localStorage.getItem(STORAGE_KEY);
	if (!saved) return emptyDiagram();
	try {
		return validate(JSON.parse(saved));
	} catch {
		return emptyDiagram();
	}
}

class EditorStore {
	diagram = $state<Diagram>(loadInitial());
	selected = $state<Selection>(null);
	/** While drawing a connector, the source box id (else null). */
	pendingConnector = $state<string | null>(null);

	// ---- history ------------------------------------------------------------
	#undo: string[] = [];
	#redo: string[] = [];
	#coalesceKey = "";
	#coalesceAt = 0;
	// Reactive mirrors of stack depth so toolbar buttons update (plain arrays aren't tracked).
	undoDepth = $state(0);
	redoDepth = $state(0);

	get canUndo() {
		return this.undoDepth > 0;
	}
	get canRedo() {
		return this.redoDepth > 0;
	}

	#syncDepth() {
		this.undoDepth = this.#undo.length;
		this.redoDepth = this.#redo.length;
	}

	/**
	 * Capture the current state as an undo point. Call BEFORE mutating.
	 * `coalesceKey` groups rapid edits (e.g. typing in one field) into one step.
	 */
	#record(coalesceKey = "") {
		const now = Date.now();
		if (coalesceKey && coalesceKey === this.#coalesceKey && now - this.#coalesceAt < 700) {
			this.#coalesceAt = now;
			return;
		}
		const snap = serialize(this.diagram);
		if (this.#undo[this.#undo.length - 1] !== snap) {
			this.#undo.push(snap);
			if (this.#undo.length > 200) this.#undo.shift();
		}
		this.#redo = [];
		this.#coalesceKey = coalesceKey;
		this.#coalesceAt = now;
		this.#syncDepth();
	}

	/** Record before a text edit; coalesces consecutive keystrokes in one target. */
	beginTextEdit(key: string) {
		this.#record(key);
	}

	undo() {
		if (!this.#undo.length) return;
		this.#redo.push(serialize(this.diagram));
		this.diagram = validate(JSON.parse(this.#undo.pop() as string));
		this.#coalesceKey = "";
		this.#syncDepth();
		this.#pruneSelection();
	}

	redo() {
		if (!this.#redo.length) return;
		this.#undo.push(serialize(this.diagram));
		this.diagram = validate(JSON.parse(this.#redo.pop() as string));
		this.#coalesceKey = "";
		this.#syncDepth();
		this.#pruneSelection();
	}

	// ---- lookups ------------------------------------------------------------
	get selectedBox(): Box | undefined {
		const s = this.selected;
		const id = s?.type === "box" ? s.id : s?.type === "field" || s?.type === "comment" ? s.boxId : undefined;
		return id ? this.diagram.boxes.find((b) => b.id === id) : undefined;
	}

	box(id: string): Box | undefined {
		return this.diagram.boxes.find((b) => b.id === id);
	}

	#pruneSelection() {
		const s = this.selected;
		if (!s) return;
		if (s.type === "connector" && !this.diagram.connectors.some((c) => c.id === s.id)) this.selected = null;
		if ((s.type === "box" || s.type === "field" || s.type === "comment")) {
			const bid = s.type === "box" ? s.id : s.boxId;
			if (!this.box(bid)) this.selected = null;
		}
	}

	// ---- box mutations ------------------------------------------------------
	addBox(x = 80, y = 80): Box {
		this.#record();
		const b: Box = { id: uid("b"), name: "Untitled", description: "", fields: [], comments: [], x, y };
		this.diagram.boxes.push(b);
		this.selected = { type: "box", id: b.id };
		return b;
	}

	deleteBox(id: string) {
		this.#record();
		this.diagram.boxes = this.diagram.boxes.filter((b) => b.id !== id);
		this.diagram.connectors = this.diagram.connectors.filter((c) => c.source !== id && c.target !== id);
		if (this.selected && "id" in this.selected && this.selected.id === id) this.selected = null;
	}

	moveBox(id: string, x: number, y: number) {
		const b = this.box(id);
		if (b) {
			b.x = x;
			b.y = y;
		}
	}

	/** Snapshot before a drag begins so undo restores the original position. */
	beginMove() {
		this.#record();
	}

	renameBox(id: string, name: string) {
		const b = this.box(id);
		if (b) b.name = name;
	}

	setDescription(id: string, description: string) {
		const b = this.box(id);
		if (b) b.description = description;
	}

	// ---- fields -------------------------------------------------------------
	addField(boxId: string): Field | undefined {
		const b = this.box(boxId);
		if (!b) return;
		this.#record();
		const f: Field = { id: uid("f"), name: "field", type: "string" };
		b.fields.push(f);
		this.selected = { type: "field", boxId, fieldId: f.id };
		return f;
	}

	updateField(boxId: string, fieldId: string, patch: Partial<Field>) {
		const f = this.box(boxId)?.fields.find((f) => f.id === fieldId);
		if (f) Object.assign(f, patch);
	}

	deleteField(boxId: string, fieldId: string) {
		const b = this.box(boxId);
		if (!b) return;
		this.#record();
		b.fields = b.fields.filter((f) => f.id !== fieldId);
		this.selected = { type: "box", id: boxId };
	}

	// ---- comments -----------------------------------------------------------
	addComment(boxId: string) {
		const b = this.box(boxId);
		if (!b) return;
		this.#record();
		b.comments.push("");
		this.selected = { type: "comment", boxId, index: b.comments.length - 1 };
	}

	updateComment(boxId: string, index: number, text: string) {
		const b = this.box(boxId);
		if (b && b.comments[index] !== undefined) b.comments[index] = text;
	}

	deleteComment(boxId: string, index: number) {
		const b = this.box(boxId);
		if (!b) return;
		this.#record();
		b.comments.splice(index, 1);
		this.selected = { type: "box", id: boxId };
	}

	// ---- connectors ---------------------------------------------------------
	startConnector(sourceId: string) {
		this.pendingConnector = sourceId;
	}

	completeConnector(targetId: string): Connector | undefined {
		const src = this.pendingConnector;
		this.pendingConnector = null;
		if (!src || src === targetId) return;
		this.#record();
		const c: Connector = { id: uid("c"), source: src, target: targetId, label: "", comments: [] };
		this.diagram.connectors.push(c);
		this.selected = { type: "connector", id: c.id };
		return c;
	}

	updateConnector(id: string, patch: Partial<Connector>) {
		const c = this.diagram.connectors.find((c) => c.id === id);
		if (c) Object.assign(c, patch);
	}

	deleteConnector(id: string) {
		this.#record();
		this.diagram.connectors = this.diagram.connectors.filter((c) => c.id !== id);
		if (this.selected?.type === "connector" && this.selected.id === id) this.selected = null;
	}

	// ---- selection-driven keyboard ops -------------------------------------
	deleteSelected() {
		const s = this.selected;
		if (!s) return;
		if (s.type === "box") this.deleteBox(s.id);
		else if (s.type === "field") this.deleteField(s.boxId, s.fieldId);
		else if (s.type === "comment") this.deleteComment(s.boxId, s.index);
		else if (s.type === "connector") this.deleteConnector(s.id);
	}

	/** "F": add a field to whatever box is in context. */
	addFieldToSelected() {
		const b = this.selectedBox;
		if (b) this.addField(b.id);
	}

	/** "A": add a comment to whatever box is in context. */
	addCommentToSelected() {
		const b = this.selectedBox;
		if (b) this.addComment(b.id);
	}

	/** "C": begin a connector from the selected box. */
	startConnectorFromSelected() {
		const b = this.selectedBox;
		if (b) this.startConnector(b.id);
	}

	clear() {
		this.#record();
		this.diagram = emptyDiagram();
		this.selected = null;
		this.pendingConnector = null;
	}

	// ---- import / export ----------------------------------------------------
	exportJSON(): string {
		return serialize(this.diagram);
	}

	loadJSON(json: string) {
		this.#record();
		this.diagram = validate(JSON.parse(json));
		this.selected = null;
		this.pendingConnector = null;
	}
}

export const editor = new EditorStore();

// Autosave to localStorage on every change.
if (typeof window !== "undefined") {
	$effect.root(() => {
		$effect(() => {
			localStorage.setItem(STORAGE_KEY, serialize(editor.diagram));
		});
	});
}
