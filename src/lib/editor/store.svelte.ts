import { SvelteMap } from "svelte/reactivity";
import {
	type Anchor,
	type Block,
	type BlockType,
	type Connector,
	type ConnectorKind,
	type Diagram,
	emptyDiagram,
	type Expose,
	findBlock,
	isAncestor,
	isRoot,
	type Mapping,
	migrate,
	ownerList,
	serialize,
	type Side,
	type UIElement,
	validate,
} from "../diagram";
import { exposeRect, type Rect } from "./geometry";
import { History } from "./history";
import {
	childrenExtent,
	DEFAULT_CHILD_H,
	DEFAULT_CHILD_W,
	DEFAULT_ROOT_SIZE,
	descendantIds,
	EXPOSE_MIN_EXTENT,
	FIT_SLACK,
	fitToChildren,
	HEADER_ALLOW,
	NEST_GAP,
	NEST_INSET,
	nextChildY,
} from "./layout";

const STORAGE_KEY = "limn.diagram.v6";
/** Previous keys — read once and migrated forward so existing local diagrams survive version bumps. */
const LEGACY_KEYS = ["limn.diagram.v5", "limn.diagram.v4", "limn.diagram.v3"] as const;

/** Default size of a freshly drawn UI element. */
const DEFAULT_UI_SIZE = { w: 180, h: 120 } as const;

/** Offset from a click point to a new block's top-left, so the box lands centred under the cursor. */
const NEW_BLOCK_OFFSET = { x: 85, y: 20 } as const;

function uid(prefix: string): string {
	const rand = crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
	return `${prefix}_${rand}`;
}

function newBlock(name = "Untitled"): Block {
	return { id: uid("b"), name, comments: [], children: [] };
}

function newElement(x: number, y: number): UIElement {
	return { id: uid("u"), label: "Frame", x, y, w: DEFAULT_UI_SIZE.w, h: DEFAULT_UI_SIZE.h };
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
	| { id: string; part: "ui" }
	| null;

/** Which of the two screens are visible. Components is the primary; at least one
 *  pane is always shown, and both on means the split view. */
export type Panes = { components: boolean; ui: boolean };

function loadInitial(): Diagram {
	if (typeof localStorage === "undefined") return emptyDiagram();
	const saved = localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
	if (!saved) return emptyDiagram();
	try {
		const d = validate(migrate(JSON.parse(saved)));
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
	/** Measured offset of each parent's `.children` box within its block box (not
	 *  persisted). Lets connector geometry place nested blocks in canvas space
	 *  reactively, without reading the DOM on the render hot path. */
	childOffsets = new SvelteMap<string, { left: number; top: number }>();
	/** Canvas pan offset (infinite scrolling). */
	pan = $state({ x: 0, y: 0 });
	/** Transient drag feedback (not persisted). */
	draggingId = $state<string | null>(null);
	dropTarget = $state<string | null>(null);

	// ---- view + UI screen ---------------------------------------------------
	/** Which screens are visible. Components-only by default; both = split view. */
	panes = $state<Panes>({ components: true, ui: false });
	/** Pan offset of the UI canvas (independent of the Components canvas). */
	uiPan = $state({ x: 0, y: 0 });
	/** Selected UI element id (mutually exclusive with block/connector selection). */
	selectedElement = $state<string | null>(null);
	/** Selected mapping link id. */
	selectedMapping = $state<string | null>(null);
	/** Root block a mapping link is currently being drawn from (drag in progress). */
	pendingMap = $state<string | null>(null);

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

	// ---- view ---------------------------------------------------------------
	/** Toggle a pane on/off, keeping at least one visible (Components is the fallback). */
	togglePane(pane: keyof Panes) {
		const next = { ...this.panes, [pane]: !this.panes[pane] };
		if (!next.components && !next.ui) next.components = true; // never hide everything
		this.panes = next;
	}
	get isSplit(): boolean {
		return this.panes.components && this.panes.ui;
	}

	// ---- selection ----------------------------------------------------------
	selectBlock(id: string) {
		this.selectedBlocks = [id];
		this.selectedConnector = null;
		this.#clearUISelection();
	}
	selectBlocks(ids: string[]) {
		this.selectedBlocks = ids;
		this.selectedConnector = null;
		this.#clearUISelection();
	}
	selectConnector(id: string) {
		this.selectedConnector = id;
		this.selectedBlocks = [];
		this.#clearUISelection();
	}
	clearSelection() {
		this.selectedBlocks = [];
		this.selectedConnector = null;
		this.#clearUISelection();
	}
	#clearUISelection() {
		this.selectedElement = null;
		this.selectedMapping = null;
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
		if (this.selectedElement && !this.element(this.selectedElement)) this.selectedElement = null;
		if (this.selectedMapping && !this.diagram.mappings.some((m) => m.id === this.selectedMapping))
			this.selectedMapping = null;
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
		// An exposes panel is sized by its owner (see `syncExposes`), not its children.
		if (this.isExposeBox(b.id)) return;
		fitToChildren(b);
		const parent = this.parentOf(b.id);
		if (parent) this.#fit(parent);
	}

	rename(id: string, name: string) {
		const b = this.block(id);
		if (b) b.name = name;
	}

	setBlockType(id: string, type: BlockType) {
		const b = this.block(id);
		if (!b || b.type === type) return;
		this.#record();
		b.type = type;
	}

	/** Every block id that removing `id` takes with it: its subtree, plus — since an
	 *  exposes box belongs to its owner — the subtree of any expose box owned by a
	 *  block already in the set (transitively). */
	#removalSet(id: string): Set<string> {
		const removed = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop();
			if (!cur || removed.has(cur)) continue;
			const b = this.block(cur);
			if (!b) continue;
			for (const d of descendantIds(b)) removed.add(d);
			// An owner takes its exposes box down with it.
			for (const e of this.diagram.exposes) if (removed.has(e.ownerId) && !removed.has(e.exposeId)) stack.push(e.exposeId);
		}
		return removed;
	}

	#removeBlock(id: string) {
		const removed = this.#removalSet(id);
		if (!removed.size) return;
		// Prune the whole forest in one pass so nested blocks and cascaded expose
		// boxes (which are roots) all drop together.
		const prune = (list: Block[]): Block[] =>
			list.filter((b) => !removed.has(b.id)).map((b) => ((b.children = prune(b.children)), b));
		this.diagram.blocks = prune(this.diagram.blocks);
		this.diagram.connectors = this.diagram.connectors.filter((c) => !removed.has(c.source) && !removed.has(c.target));
		this.diagram.mappings = this.diagram.mappings.filter((m) => !removed.has(m.blockId));
		this.diagram.exposes = this.diagram.exposes.filter((e) => !removed.has(e.ownerId) && !removed.has(e.exposeId));
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

	/** Reposition a block's comment bubble (offset from the block's top-left). */
	moveCommentBubble(id: string, x: number, y: number) {
		const b = this.block(id);
		if (b) b.commentPos = { x: Math.round(x), y: Math.round(y) };
	}

	reparent(id: string, newParentId: string | null, x = 80, y = 80, opts: { record?: boolean } = {}) {
		// An exposes box stays a root attached to its owner — never nest it away.
		if (newParentId && this.isExposeBox(id)) return;
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
			// Connectors survive nesting: nested blocks connect just like roots.
		}
	}

	// ---- comments -----------------------------------------------------------
	addComment(id: string) {
		const b = this.block(id);
		if (!b) return;
		// One comment per block: reuse the existing one, else create a single empty line.
		if (!b.comments.length) {
			this.#record();
			b.comments.push("");
		}
		this.selectBlock(id);
		this.editing = { id, part: "comment", index: 0 };
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
		if (!this.block(sourceId)) return;
		this.pendingConnector = sourceId;
		this.pendingAnchor = anchor;
	}
	completeConnector(targetId: string, targetAnchor: Anchor | null = null): Connector | undefined {
		const src = this.pendingConnector;
		const srcAnchor = this.pendingAnchor;
		this.pendingConnector = null;
		this.pendingAnchor = null;
		if (!src || src === targetId || !this.block(targetId)) return;
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
		if (!c || !this.block(blockId)) return;
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

	// ---- UI elements --------------------------------------------------------
	element(id: string): UIElement | undefined {
		return this.diagram.ui.find((e) => e.id === id);
	}
	selectElement(id: string) {
		this.selectedElement = id;
		this.selectedBlocks = [];
		this.selectedConnector = null;
		this.selectedMapping = null;
	}
	isElementSelected(id: string) {
		return this.selectedElement === id;
	}
	addElement(x: number, y: number): UIElement {
		this.#record();
		const e = newElement(x, y);
		this.diagram.ui.push(e);
		this.selectElement(e.id);
		this.editing = { id: e.id, part: "ui" };
		return e;
	}
	renameElement(id: string, label: string) {
		const e = this.element(id);
		if (e) e.label = label;
	}
	moveElement(id: string, x: number, y: number) {
		const e = this.element(id);
		if (e) {
			e.x = x;
			e.y = y;
		}
	}
	resizeElement(id: string, w: number, h: number) {
		const e = this.element(id);
		if (e) {
			e.w = Math.round(w);
			e.h = Math.round(h);
		}
	}
	#removeElement(id: string) {
		this.diagram.ui = this.diagram.ui.filter((e) => e.id !== id);
		this.diagram.mappings = this.diagram.mappings.filter((m) => m.elementId !== id);
		if (this.selectedElement === id) this.selectedElement = null;
	}
	deleteElement(id: string) {
		this.#record();
		this.#removeElement(id);
	}

	// ---- mappings (component ↔ UI element) ----------------------------------
	/** Begin drawing a mapping link from a root block (the component). */
	startMapping(blockId: string) {
		if (this.isRoot(blockId)) this.pendingMap = blockId;
	}
	/** Finish a mapping onto a UI element. No-op on self-duplicate or bad ids. */
	completeMapping(elementId: string): Mapping | undefined {
		const blockId = this.pendingMap;
		this.pendingMap = null;
		if (!blockId || !this.isRoot(blockId) || !this.element(elementId)) return;
		if (this.diagram.mappings.some((m) => m.blockId === blockId && m.elementId === elementId)) return;
		this.#record();
		const m: Mapping = { id: uid("m"), blockId, elementId };
		this.diagram.mappings.push(m);
		this.selectedMapping = m.id;
		return m;
	}
	cancelMapping() {
		this.pendingMap = null;
	}
	selectMapping(id: string) {
		this.selectedMapping = id;
		this.selectedElement = null;
	}
	deleteMapping(id: string) {
		this.#record();
		this.diagram.mappings = this.diagram.mappings.filter((m) => m.id !== id);
		if (this.selectedMapping === id) this.selectedMapping = null;
	}
	/** Mappings touching a block or element — used to highlight the counterpart. */
	mappingsForBlock(blockId: string): Mapping[] {
		return this.diagram.mappings.filter((m) => m.blockId === blockId);
	}
	mappingsForElement(elementId: string): Mapping[] {
		return this.diagram.mappings.filter((m) => m.elementId === elementId);
	}

	// ---- exposes (public-API sections) --------------------------------------
	/** The expose relation owned by a block, if any (at most one). */
	exposeOf(ownerId: string): Expose | undefined {
		return this.diagram.exposes.find((e) => e.ownerId === ownerId);
	}
	/** The expose relation whose content box is `id`, if any. */
	exposeByBox(id: string): Expose | undefined {
		return this.diagram.exposes.find((e) => e.exposeId === id);
	}
	/** True when `id` is the content box of some expose (glued to its owner). */
	isExposeBox(id: string): boolean {
		return this.diagram.exposes.some((e) => e.exposeId === id);
	}
	/** Display rect of a root block (stored geometry, measured-size fallback). */
	rootRect(id: string): Rect | undefined {
		const b = this.block(id);
		if (!b) return;
		const s = this.sizes.get(id) ?? DEFAULT_ROOT_SIZE;
		return { x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? s.w, h: b.h ?? s.h };
	}
	/** The canvas rect an exposes box must occupy: glued to its owner's side,
	 *  sharing that dimension, extending by the free extent (grown to fit children). */
	exposeGeometry(e: Expose): Rect | undefined {
		const box = this.block(e.exposeId);
		const o = this.rootRect(e.ownerId);
		if (!box || !o) return;
		return exposeRect(o, e.side, this.#effectiveExtent(box, e.side, e.extent));
	}
	/** The free dimension actually used: the larger of the user's extent and what
	 *  the panel's children need along that axis, so adding content grows it out. */
	#effectiveExtent(box: Block, side: Side, extent: number): number {
		if (!box.children.length) return Math.max(EXPOSE_MIN_EXTENT, extent);
		const { right, bottom } = childrenExtent(box.children);
		const need = side === "left" || side === "right" ? right + NEST_INSET + FIT_SLACK : bottom + HEADER_ALLOW;
		return Math.max(EXPOSE_MIN_EXTENT, extent, need);
	}
	/** Attach a public-API panel growing from `side` of a root block. No-op if it
	 *  already has one. The panel is a root block named "exposes" whose geometry is
	 *  derived from its owner (kept glued by `syncExposes`). */
	createExpose(ownerId: string, side: Side, extent: number): Block | undefined {
		if (!this.isRoot(ownerId) || this.exposeOf(ownerId)) return;
		this.#record();
		const b = newBlock("exposes");
		this.diagram.blocks.push(b);
		const e: Expose = { id: uid("x"), ownerId, exposeId: b.id, side, extent: Math.max(EXPOSE_MIN_EXTENT, extent) };
		this.diagram.exposes.push(e);
		const geo = this.exposeGeometry(e); // seed geometry so it renders before the effect runs
		if (geo) Object.assign(b, geo);
		this.selectBlock(b.id);
		return b;
	}
	/** Resize an exposes panel's free dimension (its width or height). */
	setExposeExtent(exposeId: string, extent: number) {
		const e = this.exposeByBox(exposeId);
		if (e) e.extent = Math.max(EXPOSE_MIN_EXTENT, Math.round(extent));
	}
	/** Re-glue every exposes box to its owner. Driven by a reactive effect so a
	 *  panel tracks its owner's moves/resizes and its own children's growth. */
	syncExposes() {
		for (const e of this.diagram.exposes) {
			const box = this.block(e.exposeId);
			const geo = this.exposeGeometry(e);
			if (!box || !geo) continue;
			if (box.x !== geo.x || box.y !== geo.y || box.w !== geo.w || box.h !== geo.h) Object.assign(box, geo);
		}
	}

	// ---- keyboard-driven ops ------------------------------------------------
	deleteSelected() {
		if (this.selectedMapping) {
			this.deleteMapping(this.selectedMapping);
			return;
		}
		if (this.selectedElement) {
			this.deleteElement(this.selectedElement);
			return;
		}
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
		this.pendingMap = null;
	}

	// ---- import / export ----------------------------------------------------
	exportJSON(): string {
		return serialize(this.diagram);
	}
	loadJSON(json: string) {
		this.#record();
		const d = validate(migrate(JSON.parse(json)));
		normalizeLayout(d);
		this.diagram = d;
		this.clearSelection();
		this.editing = null;
		this.pendingConnector = null;
		this.pendingAnchor = null;
		this.pendingMap = null;
	}

	measure(id: string, w: number, h: number) {
		const prev = this.sizes.get(id);
		if (!prev || prev.w !== w || prev.h !== h) this.sizes.set(id, { w, h });
	}
	/** Record where a parent's `.children` box sits inside its block box (see `childOffsets`). */
	measureChildOffset(id: string, left: number, top: number) {
		const prev = this.childOffsets.get(id);
		if (!prev || prev.left !== left || prev.top !== top) this.childOffsets.set(id, { left, top });
	}
}

export const editor = new EditorStore();

if (typeof window !== "undefined") {
	$effect.root(() => {
		// Keep every exposes panel glued to its owner as the owner moves/resizes or
		// the panel's children grow. Runs before the autosave effect sees the change.
		$effect(() => {
			editor.syncExposes();
		});
		$effect(() => {
			localStorage.setItem(STORAGE_KEY, serialize(editor.diagram));
		});
	});
}
