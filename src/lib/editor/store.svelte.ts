import { SvelteMap } from "svelte/reactivity";
import {
	type Anchor,
	type Block,
	type Connector,
	type ConnectorKind,
	type Diagram,
	emptyDiagram,
	findBlock,
	isAncestor,
	isRoot,
	ownerList,
	serialize,
	validate,
} from "../diagram";
import { History } from "./history";
import {
	DEFAULT_CHILD_H,
	DEFAULT_CHILD_W,
	descendantIds,
	fitToChildren,
	NEST_GAP,
	NEST_INSET,
	nextChildY,
} from "./layout";

const STORAGE_KEY = "limn.diagram.v3";

/** Offset from a click point to a new block's top-left, so the box lands centred under the cursor. */
const NEW_BLOCK_OFFSET = { x: 85, y: 20 } as const;

function uid(prefix: string): string {
	const rand = crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
	return `${prefix}_${rand}`;
}

function newBlock(name = "Untitled"): Block {
	return { id: uid("b"), name, comments: [], children: [] };
}

/** Ensure every nested block has explicit geometry and every parent is big
 *  enough to contain its children. Runs once on load so legacy diagrams (whose
 *  children used to flow) render sensibly in the freeform model. */
function normalizeLayout(d: Diagram) {
	const visit = (b: Block) => {
		if (!b.children.length) return;
		let stackY = NEST_INSET;
		for (const c of b.children) {
			c.w ??= DEFAULT_CHILD_W;
			c.h ??= DEFAULT_CHILD_H;
			c.x ??= NEST_INSET;
			c.y ??= stackY;
			stackY = Math.max(stackY, c.y + c.h + NEST_GAP);
			visit(c);
		}
		fitToChildren(b);
	};
	d.blocks.forEach(visit);
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
		const d = validate(JSON.parse(saved));
		normalizeLayout(d);
		return d;
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
	/** Border anchor the pending connector is being drawn from. */
	pendingAnchor = $state<Anchor | null>(null);

	/** Measured sizes of rendered ROOT blocks (not persisted) — for connector geometry. */
	sizes = new SvelteMap<string, { w: number; h: number }>();
	/** Canvas pan offset (infinite scrolling). */
	pan = $state({ x: 0, y: 0 });
	/** Transient drag feedback (not persisted). */
	draggingId = $state<string | null>(null);
	dropTarget = $state<string | null>(null);

	// ---- history ------------------------------------------------------------
	#history = new History();

	#record(coalesceKey = "") {
		this.#history.record(serialize(this.diagram), coalesceKey);
	}

	snapshot() {
		this.#record();
	}
	beginTextEdit(key: string) {
		this.#record(key);
	}

	undo() {
		const prev = this.#history.undo(serialize(this.diagram));
		if (prev === null) return;
		this.diagram = validate(JSON.parse(prev));
		this.editing = null;
		this.#prune();
	}
	redo() {
		const next = this.#history.redo(serialize(this.diagram));
		if (next === null) return;
		this.diagram = validate(JSON.parse(next));
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

	/** Add a root block centred (roughly) on a canvas point — used by the "new box" affordances. */
	addRootBlockCentered(cx: number, cy: number): Block {
		return this.addRootBlock(cx - NEW_BLOCK_OFFSET.x, cy - NEW_BLOCK_OFFSET.y);
	}

	addChild(parentId: string): Block | undefined {
		const parent = this.block(parentId);
		if (!parent) return;
		this.#record();
		const b = newBlock("property");
		b.w = DEFAULT_CHILD_W;
		b.h = DEFAULT_CHILD_H;
		b.x = NEST_INSET;
		b.y = nextChildY(parent);
		parent.children.push(b);
		this.#fit(parent);
		this.selectBlock(b.id);
		this.editing = { id: b.id, part: "name" };
		return b;
	}

	/** Parent block of `id` (null for roots). */
	parentOf(id: string): Block | null {
		return ownerList(this.diagram, id)?.parent ?? null;
	}

	/** Grow a block so it contains all its children, then cascade up its ancestry. */
	#fit(b: Block) {
		fitToChildren(b);
		const parent = this.parentOf(b.id);
		if (parent) this.#fit(parent);
	}

	rename(id: string, name: string) {
		const b = this.block(id);
		if (b) b.name = name;
	}

	#removeBlock(id: string) {
		const owner = ownerList(this.diagram, id);
		const block = this.block(id);
		if (!owner || !block) return;
		const removed = descendantIds(block);
		owner.list.splice(
			owner.list.findIndex((x) => x.id === id),
			1,
		);
		this.diagram.connectors = this.diagram.connectors.filter((c) => !removed.has(c.source) && !removed.has(c.target));
		this.selectedBlocks = this.selectedBlocks.filter((s) => !removed.has(s));
	}

	deleteBlock(id: string) {
		this.#record();
		this.#removeBlock(id);
	}

	move(id: string, x: number, y: number) {
		const b = this.block(id);
		// Coordinates are canvas-space for roots, parent-local for nested blocks.
		if (b) {
			b.x = x;
			b.y = y;
		}
	}

	resize(id: string, w: number, h: number) {
		const b = this.block(id);
		if (b) {
			b.w = Math.round(w);
			b.h = Math.round(h);
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
			const parent = this.block(newParentId);
			if (parent) {
				// Place inside the new parent (freeform) and size everything to fit.
				block.w ??= DEFAULT_CHILD_W;
				block.h ??= DEFAULT_CHILD_H;
				block.x = NEST_INSET;
				block.y = nextChildY(parent);
				parent.children.push(block);
				this.#fit(parent);
			}
			const nested = descendantIds(block);
			this.diagram.connectors = this.diagram.connectors.filter((c) => !nested.has(c.source) && !nested.has(c.target));
		}
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
	connector(id: string): Connector | undefined {
		return this.diagram.connectors.find((c) => c.id === id);
	}
	startConnector(sourceId: string, anchor: Anchor | null = null) {
		if (this.isRoot(sourceId)) {
			this.pendingConnector = sourceId;
			this.pendingAnchor = anchor;
		}
	}
	completeConnector(targetId: string, targetAnchor: Anchor | null = null): Connector | undefined {
		const src = this.pendingConnector;
		const srcAnchor = this.pendingAnchor;
		this.pendingConnector = null;
		this.pendingAnchor = null;
		if (!src || src === targetId || !this.isRoot(targetId)) return;
		if (this.diagram.connectors.some((c) => c.source === src && c.target === targetId)) return;
		this.#record();
		const c: Connector = { id: uid("c"), source: src, target: targetId, kind: "arrow" };
		if (srcAnchor) c.sourceAnchor = srcAnchor;
		if (targetAnchor) c.targetAnchor = targetAnchor;
		this.diagram.connectors.push(c);
		this.selectConnector(c.id);
		return c;
	}
	/** Move one end of a connector to a (possibly new) block and pin its border anchor. */
	setConnectorEnd(id: string, end: "source" | "target", blockId: string, anchor: Anchor) {
		const c = this.connector(id);
		if (!c || !this.isRoot(blockId)) return;
		const other = end === "source" ? c.target : c.source;
		if (blockId === other) return; // can't point a connector at the same block on both ends
		if (end === "source") {
			c.source = blockId;
			c.sourceAnchor = anchor;
		} else {
			c.target = blockId;
			c.targetAnchor = anchor;
		}
	}
	cycleConnectorKind(id: string) {
		const c = this.connector(id);
		if (!c) return;
		this.#record();
		const order: ConnectorKind[] = ["arrow", "double", "line"];
		c.kind = order[(order.indexOf(c.kind) + 1) % order.length];
	}
	setConnectorDescription(id: string, description: string) {
		const c = this.connector(id);
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
		this.pendingAnchor = null;
	}

	// ---- import / export ----------------------------------------------------
	exportJSON(): string {
		return serialize(this.diagram);
	}
	loadJSON(json: string) {
		this.#record();
		const d = validate(JSON.parse(json));
		normalizeLayout(d);
		this.diagram = d;
		this.clearSelection();
		this.editing = null;
		this.pendingConnector = null;
		this.pendingAnchor = null;
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
