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
	/** Selected block ids (multi-select). The last entry is the "primary". */
	selectedBlocks = $state<string[]>([]);
	selectedConnector = $state<string | null>(null);
	editing = $state<Editing>(null);
	pendingConnector = $state<string | null>(null);

	/** Measured sizes of rendered ROOT blocks (not persisted) — for connector geometry. */
	sizes = $state(new Map<string, { w: number; h: number }>());
	/** Canvas pan offset (infinite scrolling). */
	pan = $state({ x: 0, y: 0 });

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

	snapshot() {
		this.#record();
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

	// ---- selection ----------------------------------------------------------
	selectBlock(id: string) {
		this.selectedBlocks = [id];
		this.selectedConnector = null;
	}
	selectBlocks(ids: string[]) {
		this.selectedBlocks = ids;
		this.selectedConnector = null;
	}
	addToSelection(id: string) {
		if (!this.selectedBlocks.includes(id)) this.selectedBlocks = [...this.selectedBlocks, id];
		this.selectedConnector = null;
	}
	selectConnector(id: string) {
		this.selectedConnector = id;
		this.selectedBlocks = [];
	}
	clearSelection() {
		this.selectedBlocks = [];
		this.selectedConnector = null;
	}
	isBlockSelected(id: string) {
		return this.selectedBlocks.includes(id);
	}
	get selectedBlock(): Block | undefined {
		const id = this.selectedBlocks.at(-1);
		return id ? this.block(id) : undefined;
	}

	// ---- lookups ------------------------------------------------------------
	block(id: string): Block | undefined {
		return findBlock(this.diagram, id);
	}
	isRoot(id: string): boolean {
		return isRoot(this.diagram, id);
	}

	#prune() {
		this.selectedBlocks = this.selectedBlocks.filter((id) => this.block(id));
		if (this.selectedConnector && !this.diagram.connectors.some((c) => c.id === this.selectedConnector))
			this.selectedConnector = null;
	}

	// ---- block mutations ----------------------------------------------------
	addRootBlock(x = 80, y = 80): Block {
		this.#record();
		const b = newBlock();
		b.x = x;
		b.y = y;
		this.diagram.blocks.push(b);
		this.selectBlock(b.id);
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
		this.selectBlock(b.id);
		this.editing = { id: b.id, part: "name" };
		return b;
	}

	rename(id: string, name: string) {
		const b = this.block(id);
		if (b) b.name = name;
	}

	#removeBlock(id: string) {
		const owner = ownerList(this.diagram, id);
		const block = this.block(id);
		if (!owner || !block) return;
		const removed = new Set<string>();
		const collect = (x: Block) => {
			removed.add(x.id);
			x.children.forEach(collect);
		};
		collect(block);
		owner.list.splice(
			owner.list.findIndex((x) => x.id === id),
			1,
		);
		this.diagram.connectors = this.diagram.connectors.filter(
			(c) => !removed.has(c.source) && !removed.has(c.target),
		);
		this.selectedBlocks = this.selectedBlocks.filter((s) => !removed.has(s));
	}

	deleteBlock(id: string) {
		this.#record();
		this.#removeBlock(id);
	}

	move(id: string, x: number, y: number) {
		const b = this.block(id);
		if (b && this.isRoot(id)) {
			b.x = x;
			b.y = y;
		}
	}

	reparent(id: string, newParentId: string | null, x = 80, y = 80, opts: { record?: boolean } = {}) {
		if (newParentId && (newParentId === id || isAncestor(this.diagram, id, newParentId))) return;
		const owner = ownerList(this.diagram, id);
		const block = this.block(id);
		if (!owner || !block) return;
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
		this.selectBlock(id);
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
		this.selectConnector(c.id);
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
		if (this.selectedConnector === id) this.selectedConnector = null;
	}

	// ---- keyboard-driven ops ------------------------------------------------
	deleteSelected() {
		if (this.selectedConnector) {
			this.deleteConnector(this.selectedConnector);
			return;
		}
		const ids = [...this.selectedBlocks];
		if (!ids.length) return;
		this.#record();
		for (const id of ids) this.#removeBlock(id);
	}
	addChildToSelected() {
		if (this.selectedBlock) this.addChild(this.selectedBlock.id);
	}
	addCommentToSelected() {
		if (this.selectedBlock) this.addComment(this.selectedBlock.id);
	}
	startConnectorFromSelected() {
		const id = this.selectedBlocks.at(-1);
		if (id) this.startConnector(id);
	}
	editSelectedName() {
		const id = this.selectedBlocks.at(-1);
		if (id) this.editing = { id, part: "name" };
	}

	clear() {
		this.#record();
		this.diagram = emptyDiagram();
		this.clearSelection();
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
		this.clearSelection();
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
