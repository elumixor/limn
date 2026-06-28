import {
	emptyDiagram,
	findBlock,
	isAncestor,
	isRoot,
	ownerList,
	serialize,
	validate,
	type Block,
	type Connector,
	type ConnectorKind,
	type Diagram,
} from "../diagram";

const STORAGE_KEY = "limn.diagram.v3";

function uid(prefix: string): string {
	const rand =
		typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${prefix}_${rand}`;
}

function newBlock(name = "Untitled"): Block {
	return { id: uid("b"), name, comments: [], children: [] };
}

export type Selection = { kind: "block"; id: string } | { kind: "connector"; id: string } | null;

export type Editing =
	| { id: string; part: "name" }
	| { id: string; part: "comment"; index: number }
	| { id: string; part: "connector" }
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
	editing = $state<Editing>(null);
	pendingConnector = $state<string | null>(null);

	/** Measured sizes of rendered ROOT blocks (not persisted) — for connector geometry. */
	sizes = $state(new Map<string, { w: number; h: number }>());

	// ---- history ------------------------------------------------------------
	#undo: string[] = [];
	#redo: string[] = [];
	#coalesceKey = "";
	#coalesceAt = 0;

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
	}

	beginTextEdit(key: string) {
		this.#record(key);
	}

	undo() {
		if (!this.#undo.length) return;
		this.#redo.push(serialize(this.diagram));
		this.diagram = validate(JSON.parse(this.#undo.pop() as string));
		this.#coalesceKey = "";
		this.editing = null;
		this.#prune();
	}

	redo() {
		if (!this.#redo.length) return;
		this.#undo.push(serialize(this.diagram));
		this.diagram = validate(JSON.parse(this.#redo.pop() as string));
		this.#coalesceKey = "";
		this.editing = null;
		this.#prune();
	}

	// ---- lookups ------------------------------------------------------------
	block(id: string): Block | undefined {
		return findBlock(this.diagram, id);
	}
	get selectedBlock(): Block | undefined {
		return this.selected?.kind === "block" ? this.block(this.selected.id) : undefined;
	}
	isRoot(id: string): boolean {
		return isRoot(this.diagram, id);
	}

	#prune() {
		const s = this.selected;
		if (s?.kind === "block" && !this.block(s.id)) this.selected = null;
		if (s?.kind === "connector" && !this.diagram.connectors.some((c) => c.id === s.id)) this.selected = null;
	}

	// ---- block mutations ----------------------------------------------------
	addRootBlock(x = 80, y = 80): Block {
		this.#record();
		const b = newBlock();
		b.x = x;
		b.y = y;
		this.diagram.blocks.push(b);
		this.selected = { kind: "block", id: b.id };
		this.editing = { id: b.id, part: "name" };
		return b;
	}

	addChild(parentId: string): Block | undefined {
		const parent = this.block(parentId);
		if (!parent) return;
		this.#record();
		const b = newBlock("property");
		parent.children.push(b);
		parent.collapsed = false;
		this.selected = { kind: "block", id: b.id };
		this.editing = { id: b.id, part: "name" };
		return b;
	}

	rename(id: string, name: string) {
		const b = this.block(id);
		if (b) b.name = name;
	}

	deleteBlock(id: string) {
		const owner = ownerList(this.diagram, id);
		if (!owner) return;
		this.#record();
		// Collect the subtree ids so we can drop their connectors too.
		const removed = new Set<string>();
		const b = this.block(id);
		if (b) {
			const collect = (x: Block) => {
				removed.add(x.id);
				x.children.forEach(collect);
			};
			collect(b);
		}
		owner.list.splice(
			owner.list.findIndex((x) => x.id === id),
			1,
		);
		this.diagram.connectors = this.diagram.connectors.filter(
			(c) => !removed.has(c.source) && !removed.has(c.target),
		);
		if (this.selected?.kind === "block" && removed.has(this.selected.id)) this.selected = null;
	}

	move(id: string, x: number, y: number) {
		const b = this.block(id);
		if (b && this.isRoot(id)) {
			b.x = x;
			b.y = y;
		}
	}
	/** Public history checkpoint (call once before a multi-step interaction like a drag). */
	snapshot() {
		this.#record();
	}

	/**
	 * Reparent a block. `newParentId` null → make it a root at (x,y); otherwise
	 * append it to that parent's children. No-op on cycles. Pass `record:false`
	 * when a surrounding interaction already took a history snapshot.
	 */
	reparent(id: string, newParentId: string | null, x = 80, y = 80, opts: { record?: boolean } = {}) {
		if (newParentId && (newParentId === id || isAncestor(this.diagram, id, newParentId))) return;
		const owner = ownerList(this.diagram, id);
		const block = this.block(id);
		if (!owner || !block) return;
		// already in place?
		if (newParentId === null && owner.parent === null) {
			this.move(id, x, y);
			return;
		}
		if (newParentId && owner.parent?.id === newParentId) return;

		if (opts.record !== false) this.#record();
		owner.list.splice(
			owner.list.findIndex((b) => b.id === id),
			1,
		);
		if (newParentId === null) {
			block.x = x;
			block.y = y;
			this.diagram.blocks.push(block);
		} else {
			delete block.x;
			delete block.y;
			const parent = this.block(newParentId);
			parent?.children.push(block);
			if (parent) parent.collapsed = false;
			// connectors only render between roots; drop any touching the now-nested subtree
			const nested = new Set<string>();
			const collect = (b: Block) => {
				nested.add(b.id);
				b.children.forEach(collect);
			};
			collect(block);
			this.diagram.connectors = this.diagram.connectors.filter(
				(c) => !nested.has(c.source) && !nested.has(c.target),
			);
		}
	}

	toggleComments(id: string) {
		const b = this.block(id);
		if (b) b.showComments = !(b.showComments ?? true);
	}
	toggleCollapsed(id: string) {
		const b = this.block(id);
		if (b) b.collapsed = !b.collapsed;
	}

	// ---- comments -----------------------------------------------------------
	addComment(id: string) {
		const b = this.block(id);
		if (!b) return;
		this.#record();
		b.comments.push("");
		b.showComments = true;
		this.selected = { kind: "block", id };
		this.editing = { id, part: "comment", index: b.comments.length - 1 };
	}
	updateComment(id: string, index: number, text: string) {
		const b = this.block(id);
		if (b && b.comments[index] !== undefined) b.comments[index] = text;
	}
	deleteComment(id: string, index: number) {
		const b = this.block(id);
		if (!b) return;
		this.#record();
		b.comments.splice(index, 1);
	}

	// ---- connectors ---------------------------------------------------------
	startConnector(sourceId: string) {
		if (this.isRoot(sourceId)) this.pendingConnector = sourceId;
	}
	completeConnector(targetId: string): Connector | undefined {
		const src = this.pendingConnector;
		this.pendingConnector = null;
		if (!src || src === targetId || !this.isRoot(targetId)) return;
		if (this.diagram.connectors.some((c) => c.source === src && c.target === targetId)) return;
		this.#record();
		const c: Connector = { id: uid("c"), source: src, target: targetId, kind: "arrow" };
		this.diagram.connectors.push(c);
		this.selected = { kind: "connector", id: c.id };
		return c;
	}
	cycleConnectorKind(id: string) {
		const c = this.diagram.connectors.find((c) => c.id === id);
		if (!c) return;
		this.#record();
		const order: ConnectorKind[] = ["arrow", "double", "line"];
		c.kind = order[(order.indexOf(c.kind) + 1) % order.length];
	}
	setConnectorDescription(id: string, description: string) {
		const c = this.diagram.connectors.find((c) => c.id === id);
		if (c) c.description = description;
	}
	deleteConnector(id: string) {
		this.#record();
		this.diagram.connectors = this.diagram.connectors.filter((c) => c.id !== id);
		if (this.selected?.kind === "connector" && this.selected.id === id) this.selected = null;
	}

	// ---- keyboard-driven ops ------------------------------------------------
	deleteSelected() {
		const s = this.selected;
		if (s?.kind === "block") this.deleteBlock(s.id);
		else if (s?.kind === "connector") this.deleteConnector(s.id);
	}
	addChildToSelected() {
		if (this.selectedBlock) this.addChild(this.selectedBlock.id);
	}
	addCommentToSelected() {
		if (this.selectedBlock) this.addComment(this.selectedBlock.id);
	}
	startConnectorFromSelected() {
		if (this.selected?.kind === "block") this.startConnector(this.selected.id);
	}
	editSelectedName() {
		if (this.selected?.kind === "block") this.editing = { id: this.selected.id, part: "name" };
	}

	clear() {
		this.#record();
		this.diagram = emptyDiagram();
		this.selected = null;
		this.editing = null;
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
		this.editing = null;
		this.pendingConnector = null;
	}

	measure(id: string, w: number, h: number) {
		const prev = this.sizes.get(id);
		if (!prev || prev.w !== w || prev.h !== h) this.sizes.set(id, { w, h });
	}
}

export const editor = new EditorStore();

if (typeof window !== "undefined") {
	$effect.root(() => {
		$effect(() => {
			localStorage.setItem(STORAGE_KEY, serialize(editor.diagram));
		});
	});
}
