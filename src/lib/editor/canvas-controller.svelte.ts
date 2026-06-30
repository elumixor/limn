/**
 * Interaction state machine for the canvas. Owns all transient pointer state
 * (pan / drag / resize / marquee / connector-link / endpoint-drag / hover) and
 * the handlers that drive it, plus the DOM measurement needed for freeform
 * nested blocks. The component (`Canvas.svelte`) is left as markup that reads
 * this state and forwards events here.
 */
import type { Anchor, Connector } from "../diagram";
import type { MenuItem } from "./ContextMenu.svelte";
import { blockIdAt, isTextInput } from "./dom";
import { connectorGeo, type Geo, nearestCardinal, type Rect } from "./geometry";
import { childrenExtent, DEFAULT_ROOT_SIZE, NEST_INSET } from "./layout";
import { editor } from "./store.svelte";

const THRESHOLD = 4;
const BORDER_HOVER = 22;
const MIN_W = 120;
// Kept below a single-line block's natural height so the floor never forces a
// freshly created block to grow the instant you grab a resize handle.
const MIN_H = 24;
/** Design cap on auto width (mirrors `.block.root { max-width }`). */
const MAX_W = 320;
/** How far past the parent's border the cursor must go to detach a child. */
const DETACH_MARGIN = 6;
/** Where, vertically, the detached block sits under the cursor. */
const DETACH_GRAB = 14;

type Drag = {
	id: string;
	fromRoot: boolean;
	targetEl: Element | null;
	sx: number;
	sy: number;
	moving: boolean;
	group: string[];
	start: Map<string, { x: number; y: number }>;
	px: number;
	py: number;
};

export class CanvasController {
	linking = $state<{ x: number; y: number } | null>(null);
	menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
	marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
	panning = $state<{ sx: number; sy: number; px: number; py: number } | null>(null);
	/** Root block whose connection/resize handles are currently shown (cursor near it). */
	hover = $state<{ id: string } | null>(null);
	/** Endpoint of an existing connector currently being dragged. */
	endDrag = $state<{ id: string; end: "source" | "target" } | null>(null);
	/** Root block being resized by a corner handle. */
	resizing = $state<{
		id: string;
		dir: string;
		sx: number;
		sy: number;
		x0: number;
		y0: number;
		w0: number;
		h0: number;
		minW: number;
		minH: number;
	} | null>(null);
	/** In-place "create a block here" prompt, shown when a connector is dropped on empty space. */
	addPrompt = $state<{ x: number; y: number } | null>(null);
	// Transient, handler-only drag state: never read in markup, so it's declared
	// raw to avoid both the spurious "not reactive" warning and proxy overhead on
	// the pointermove hot path.
	drag = $state.raw<Drag | null>(null);

	#view: () => HTMLElement | undefined;

	constructor(view: () => HTMLElement | undefined) {
		this.#view = view;
	}

	closeMenu = () => {
		this.menu = null;
	};

	// ---- coordinate / DOM helpers -------------------------------------------
	#vrect() {
		return this.#view()?.getBoundingClientRect();
	}
	/** The rendered DOM element for a block, at any nesting depth. */
	#blockEl(id: string): HTMLElement | null {
		return (this.#view()?.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null) ?? null;
	}
	#toCanvas(clientX: number, clientY: number) {
		const r = this.#vrect();
		return { x: clientX - (r?.left ?? 0) - editor.pan.x, y: clientY - (r?.top ?? 0) - editor.pan.y };
	}

	/** Canvas-space rect of a root block (stored geometry, with measured fallback). */
	rect(id: string): Rect {
		const b = editor.block(id);
		const s = editor.sizes.get(id) ?? DEFAULT_ROOT_SIZE;
		return { x: b?.x ?? 0, y: b?.y ?? 0, w: b?.w ?? s.w, h: b?.h ?? s.h };
	}
	/** Canvas-space rect for any block. Roots use their stored geometry; nested
	 *  blocks (which flow inside a parent) are read from their DOM box. */
	canvasRect(id: string): Rect {
		if (editor.isRoot(id)) return this.rect(id);
		const el = this.#blockEl(id);
		if (!el) return this.rect(id);
		const br = el.getBoundingClientRect();
		const p = this.#toCanvas(br.left, br.top);
		return { x: p.x, y: p.y, w: br.width, h: br.height };
	}
	/** Geometry of a connector, from its two root blocks' rects. */
	geo(c: Connector): Geo {
		return connectorGeo(this.rect(c.source), this.rect(c.target), c.sourceAnchor, c.targetAnchor);
	}

	/** Inner content box of a nested block's parent, in which the block must stay. Null for roots. */
	#parentInner(id: string): { w: number; h: number } | null {
		const parent = editor.parentOf(id);
		if (!parent) return null;
		const pel = this.#blockEl(parent.id);
		const inner = pel?.querySelector(":scope > .children") as HTMLElement | null;
		if (!inner) return null;
		return { w: inner.clientWidth, h: inner.clientHeight };
	}
	/** Clamp a nested block's position so it stays fully inside its parent. */
	#clampNested(id: string) {
		const b = editor.block(id);
		const inner = this.#parentInner(id);
		if (!b || !inner) return;
		const w = b.w ?? 0;
		const h = b.h ?? 0;
		const x = Math.min(Math.max(0, b.x ?? 0), Math.max(0, inner.w - w));
		const y = Math.min(Math.max(0, b.y ?? 0), Math.max(0, inner.h - h));
		if (x !== b.x || y !== b.y) editor.move(id, x, y);
	}

	// ---- pan ----------------------------------------------------------------
	onWheel = (e: WheelEvent) => {
		e.preventDefault();
		editor.pan = { x: editor.pan.x - e.deltaX, y: editor.pan.y - e.deltaY };
	};

	// ---- pointer ------------------------------------------------------------
	onPointerDown = (e: PointerEvent) => {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			e.preventDefault();
			this.panning = { sx: e.clientX, sy: e.clientY, px: editor.pan.x, py: editor.pan.y };
			return;
		}
		if (e.button !== 0) return;
		if (editor.pendingConnector) return;
		if (isTextInput(e.target)) return;

		const id = blockIdAt(e.target);
		if (!id) {
			// start marquee selection on empty canvas
			if (!e.shiftKey) editor.clearSelection();
			editor.editing = null;
			const r = this.#vrect();
			const x = e.clientX - (r?.left ?? 0);
			const y = e.clientY - (r?.top ?? 0);
			this.marquee = { x0: x, y0: y, x1: x, y1: y };
			return;
		}
		this.drag = {
			id,
			fromRoot: editor.isRoot(id),
			targetEl: e.target as Element,
			sx: e.clientX,
			sy: e.clientY,
			moving: false,
			group: [],
			start: new Map(),
			px: 0,
			py: 0,
		};
	};

	/** Reveal resize/connection handles for the block under (or just outside) the cursor. */
	#updateHover(clientX: number, clientY: number) {
		const top = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
		// Cursor is over one of our overlay handles — keep the current hover so the
		// handles don't flicker out from under the pointer.
		if (top?.closest(".resize-zone, .spawn, .endpoint")) return;
		// Deepest block actually under the cursor (any nesting depth) wins.
		const overId = top?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
		if (overId) {
			this.hover = { id: overId };
			return;
		}
		// Not directly over a block: still reveal a nearby root's handles so its
		// edges can be grabbed from just outside.
		const p = this.#toCanvas(clientX, clientY);
		let found: string | null = null;
		for (const b of editor.diagram.blocks) {
			const r = this.rect(b.id);
			if (
				p.x >= r.x - BORDER_HOVER &&
				p.x <= r.x + r.w + BORDER_HOVER &&
				p.y >= r.y - BORDER_HOVER &&
				p.y <= r.y + r.h + BORDER_HOVER
			) {
				found = b.id; // later blocks paint on top — last match wins
			}
		}
		this.hover = found ? { id: found } : null;
	}

	onWindowPointerMove = (e: PointerEvent) => {
		if (this.addPrompt) return; // popup open — leave the dangling line frozen at the drop point
		if (this.panning) {
			editor.pan = {
				x: this.panning.px + (e.clientX - this.panning.sx),
				y: this.panning.py + (e.clientY - this.panning.sy),
			};
			return;
		}
		if (this.resizing) {
			const dx = e.clientX - this.resizing.sx;
			const dy = e.clientY - this.resizing.sy;
			let { x0: x, y0: y, w0: w, h0: h } = this.resizing;
			const dir = this.resizing.dir;
			if (dir.includes("e")) w = Math.max(this.resizing.minW, this.resizing.w0 + dx);
			if (dir.includes("s")) h = Math.max(this.resizing.minH, this.resizing.h0 + dy);
			if (dir.includes("w")) {
				w = Math.max(this.resizing.minW, this.resizing.w0 - dx);
				x = this.resizing.x0 + (this.resizing.w0 - w);
			}
			if (dir.includes("n")) {
				h = Math.max(this.resizing.minH, this.resizing.h0 - dy);
				y = this.resizing.y0 + (this.resizing.h0 - h);
			}
			// Nested blocks may not spill outside their parent's content box.
			const inner = this.#parentInner(this.resizing.id);
			if (inner) {
				x = Math.max(0, Math.min(x, inner.w - this.resizing.minW));
				y = Math.max(0, Math.min(y, inner.h - this.resizing.minH));
				w = Math.max(this.resizing.minW, Math.min(w, inner.w - x));
				h = Math.max(this.resizing.minH, Math.min(h, inner.h - y));
			}
			editor.resize(this.resizing.id, w, h);
			editor.move(this.resizing.id, x, y);
			return;
		}
		if (this.endDrag) {
			const c = editor.connector(this.endDrag.id);
			if (!c) return;
			const p = this.#toCanvas(e.clientX, e.clientY);
			const otherId = this.endDrag.end === "source" ? c.target : c.source;
			const overId = blockIdAt(document.elementFromPoint(e.clientX, e.clientY));
			// Re-target to the hovered root block (if any, and not the other end), else keep our block.
			const blockId =
				overId && editor.isRoot(overId) && overId !== otherId
					? overId
					: this.endDrag.end === "source"
						? c.source
						: c.target;
			// Snap to the nearest of the block's 4 cardinal connection points.
			const anchor = nearestCardinal(this.rect(blockId), p);
			editor.setConnectorEnd(this.endDrag.id, this.endDrag.end, blockId, anchor);
			return;
		}
		if (editor.pendingConnector) {
			this.linking = this.#toCanvas(e.clientX, e.clientY);
			return;
		}
		if (this.marquee) {
			const r = this.#vrect();
			this.marquee = { ...this.marquee, x1: e.clientX - (r?.left ?? 0), y1: e.clientY - (r?.top ?? 0) };
			return;
		}
		if (!this.drag) {
			this.#updateHover(e.clientX, e.clientY);
			return;
		}
		this.hover = null;
		const drag = this.drag;
		if (!drag.moving) {
			if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < THRESHOLD) return;
			drag.moving = true;
			editor.snapshot();
			if (!drag.fromRoot) {
				// Nested block: move it within its parent (clamped), don't pop it out.
				editor.selectBlock(drag.id);
				drag.group = [drag.id];
			} else if (editor.isBlockSelected(drag.id) && editor.selectedBlocks.length > 1) {
				drag.group = editor.selectedBlocks.filter((id) => editor.isRoot(id));
			} else {
				editor.selectBlock(drag.id);
				drag.group = [drag.id];
			}
			for (const id of drag.group) {
				const b = editor.block(id);
				drag.start.set(id, { x: b?.x ?? 0, y: b?.y ?? 0 });
			}
			editor.draggingId = drag.id;
			const ps = this.#toCanvas(e.clientX, e.clientY);
			drag.px = ps.x;
			drag.py = ps.y;
		}
		const p = this.#toCanvas(e.clientX, e.clientY);
		for (const id of drag.group) {
			const s = drag.start.get(id);
			if (s) editor.move(id, s.x + (p.x - drag.px), s.y + (p.y - drag.py));
		}
		// A single nested block stays clamped inside its parent — until the cursor
		// leaves the parent, at which point it detaches onto the canvas and the
		// drag continues as a free (re-nestable) root drag.
		if (drag.group.length === 1 && !editor.isRoot(drag.id)) {
			if (this.#draggedOutOfParent(drag.id, e.clientX, e.clientY)) {
				const b = editor.block(drag.id);
				const cx = p.x - (b?.w ?? 0) / 2;
				const cy = p.y - DETACH_GRAB;
				editor.reparent(drag.id, null, cx, cy, { record: false });
				drag.start.set(drag.id, { x: cx, y: cy });
				drag.px = p.x;
				drag.py = p.y;
			} else {
				this.#clampNested(drag.id);
			}
		}
		// Highlight a block the dragged one can nest into — another root, or a
		// sibling/other block (but not the block's current parent, which is just a move).
		editor.dropTarget = drag.group.length === 1 ? this.#reparentTargetAt(e.clientX, e.clientY) : null;
	};

	/** The block the dragged block would nest into on drop, or null when the drop
	 *  is just a move (over empty canvas or over its own current parent). */
	#reparentTargetAt(clientX: number, clientY: number): string | null {
		if (!this.drag) return null;
		const target = this.#dropTargetAt(clientX, clientY); // excludes the dragged block + its descendants
		if (!target) return null;
		const currentParent = editor.parentOf(this.drag.id)?.id ?? null;
		return target === currentParent ? null : target;
	}

	/** True when the cursor has moved clear of the dragged nested block's parent. */
	#draggedOutOfParent(id: string, clientX: number, clientY: number): boolean {
		const parent = editor.parentOf(id);
		if (!parent) return false;
		const r = this.#blockEl(parent.id)?.getBoundingClientRect();
		if (!r) return false;
		return (
			clientX < r.left - DETACH_MARGIN ||
			clientX > r.right + DETACH_MARGIN ||
			clientY < r.top - DETACH_MARGIN ||
			clientY > r.bottom + DETACH_MARGIN
		);
	}

	/** The block under the cursor that the dragged block could nest into. */
	#dropTargetAt(clientX: number, clientY: number): string | null {
		const drag = this.drag;
		if (!drag) return null;
		const el = document
			.elementsFromPoint(clientX, clientY)
			.map((n) => (n as HTMLElement).closest?.("[data-block-id]") as HTMLElement | null)
			.find((n) => n?.dataset.blockId && !n.closest(`[data-block-id="${drag.id}"]`));
		return (el as HTMLElement | undefined)?.dataset.blockId ?? null;
	}

	onWindowPointerUp = (e: PointerEvent) => {
		if (this.addPrompt) return; // let the popup's own handlers decide
		if (this.panning) {
			this.panning = null;
			return;
		}
		if (this.resizing) {
			this.resizing = null;
			return;
		}
		if (this.endDrag) {
			this.endDrag = null;
			return;
		}
		if (editor.pendingConnector) {
			const target = blockIdAt(document.elementFromPoint(e.clientX, e.clientY));
			if (target) {
				const anchor = nearestCardinal(this.rect(target), this.#toCanvas(e.clientX, e.clientY));
				editor.completeConnector(target, anchor);
				this.linking = null;
			} else {
				// Dropped on empty space — offer to create a block right here.
				const p = this.#toCanvas(e.clientX, e.clientY);
				this.linking = p;
				this.addPrompt = p;
			}
			return;
		}
		if (this.marquee) {
			this.#finishMarquee(e.shiftKey);
			this.marquee = null;
			return;
		}
		const drag = this.drag;
		if (!drag) return;
		editor.draggingId = null;
		editor.dropTarget = null;
		if (drag.moving) {
			// Drop onto another block to nest into it — a root onto a block, or a
			// child onto a sibling. Dropping over the current parent / empty canvas
			// is just a move, so reparentTargetAt returns null.
			if (drag.group.length === 1) {
				const targetId = this.#reparentTargetAt(e.clientX, e.clientY);
				if (targetId) editor.reparent(drag.id, targetId, 0, 0, { record: false });
			}
		} else {
			editor.selectBlock(drag.id);
			// A single click only selects — editing starts on double-click (see onDoubleClick).
			if (!(drag.targetEl as HTMLElement | null)?.closest("[data-edit]")) editor.editing = null;
		}
		this.drag = null;
	};

	#finishMarquee(additive: boolean) {
		if (!this.marquee) return;
		// marquee rect in canvas (content) coords
		const x0 = Math.min(this.marquee.x0, this.marquee.x1) - editor.pan.x;
		const y0 = Math.min(this.marquee.y0, this.marquee.y1) - editor.pan.y;
		const x1 = Math.max(this.marquee.x0, this.marquee.x1) - editor.pan.x;
		const y1 = Math.max(this.marquee.y0, this.marquee.y1) - editor.pan.y;
		if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) return; // a click, not a marquee
		const hits = editor.diagram.blocks
			.filter((b) => {
				const s = editor.sizes.get(b.id) ?? DEFAULT_ROOT_SIZE;
				const bx = b.x ?? 0;
				const by = b.y ?? 0;
				return bx < x1 && bx + s.w > x0 && by < y1 && by + s.h > y0;
			})
			.map((b) => b.id);
		const next = additive ? [...new Set([...editor.selectedBlocks, ...hits])] : hits;
		editor.selectBlocks(next);
	}

	/** Double-click a block's name or comment to start editing it in place. */
	onDoubleClick = (e: MouseEvent) => {
		const editEl = (e.target as HTMLElement | null)?.closest("[data-edit]");
		if (!editEl) return;
		const id = blockIdAt(editEl);
		if (!id) return;
		const part = editEl.getAttribute("data-edit");
		editor.selectBlock(id);
		if (part === "name") editor.editing = { id, part: "name" };
		else editor.editing = { id, part: "comment", index: Number(editEl.getAttribute("data-ci")) };
	};

	/** Pointer-down on a cardinal connection handle: start a connector pinned to that point. */
	onHandleDown = (e: PointerEvent, id: string, anchor: Anchor) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		editor.startConnector(id, anchor);
		this.linking = this.#toCanvas(e.clientX, e.clientY);
		this.hover = null;
	};

	/** Pointer-down on a corner resize handle: start resizing that root block. */
	onResizeDown = (e: PointerEvent, id: string, dir: string) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		editor.snapshot();
		const r = this.rect(id);
		// Start from the block's real on-screen size (not a possibly-stale measured
		// value), and floor the resize at its natural content size so grabbing a
		// handle never makes the block jump.
		let w0 = r.w;
		let h0 = r.h;
		let minW = MIN_W;
		let minH = MIN_H;
		const el = this.#blockEl(id);
		if (el) {
			w0 = el.offsetWidth;
			h0 = el.offsetHeight;
			const pw = el.style.width;
			const ph = el.style.height;
			const pmw = el.style.maxWidth;
			el.style.width = "auto";
			el.style.height = "auto";
			el.style.maxWidth = `${MAX_W}px`; // honour the design cap while measuring
			minW = Math.max(MIN_W, el.offsetWidth);
			minH = Math.max(MIN_H, el.offsetHeight);
			el.style.width = pw;
			el.style.height = ph;
			el.style.maxWidth = pmw;
		}
		// A parent can't be shrunk so far it would clip its (absolute) children.
		const blk = editor.block(id);
		if (blk?.children.length && el) {
			const { right: maxR, bottom: maxB } = childrenExtent(blk.children);
			const inner = el.querySelector(":scope > .children") as HTMLElement | null;
			// Chrome = everything except the children area (header, comments, margins).
			const chromeW = w0 - (inner?.clientWidth ?? 0);
			const chromeH = h0 - (inner?.clientHeight ?? 0);
			minW = Math.max(minW, chromeW + maxR + NEST_INSET);
			minH = Math.max(minH, chromeH + maxB + NEST_INSET);
		}
		this.resizing = { id, dir, sx: e.clientX, sy: e.clientY, x0: r.x, y0: r.y, w0, h0, minW, minH };
	};

	/** Create a block at the drop point and connect the pending connector to it. */
	confirmAddPrompt = () => {
		if (!this.addPrompt) return;
		const p = this.addPrompt;
		this.addPrompt = null;
		this.linking = null;
		const b = editor.addRootBlockCentered(p.x, p.y);
		editor.completeConnector(b.id);
		editor.selectBlock(b.id);
		editor.editing = { id: b.id, part: "name" };
	};
	/** Dismiss the prompt and abandon the pending connector. */
	cancelAddPrompt = () => {
		if (!this.addPrompt) return;
		this.addPrompt = null;
		this.linking = null;
		editor.pendingConnector = null;
		editor.pendingAnchor = null;
	};

	/** Pointer-down on a selected connector's endpoint: start dragging that end. */
	onEndpointDown = (id: string, end: "source" | "target", e: PointerEvent) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		editor.selectConnector(id);
		editor.snapshot();
		this.endDrag = { id, end };
	};

	// ---- context menus ------------------------------------------------------
	onContextMenu = (e: MouseEvent) => {
		const id = blockIdAt(e.target);
		e.preventDefault();
		if (id) {
			if (!editor.isBlockSelected(id)) editor.selectBlock(id);
			const nested = !editor.isRoot(id);
			const items: MenuItem[] = [
				{ label: "Add subblock", hint: "F", action: () => editor.addChild(id) },
				{ label: "Add comment", hint: "A", action: () => editor.addComment(id) },
			];
			if (!nested) items.push({ label: "Connect from here", hint: "C", action: () => editor.startConnector(id) });
			if (nested) {
				const r = (e.target as HTMLElement).closest("[data-block-id]")?.getBoundingClientRect();
				const p = this.#toCanvas(r?.left ?? e.clientX, r?.top ?? e.clientY);
				items.push({ label: "Move to canvas", action: () => editor.reparent(id, null, p.x, p.y) });
			}
			items.push({ label: "Delete", hint: "⌫", danger: true, action: () => editor.deleteSelected() });
			this.menu = { x: e.clientX, y: e.clientY, items };
		} else {
			const p = this.#toCanvas(e.clientX, e.clientY);
			this.menu = {
				x: e.clientX,
				y: e.clientY,
				items: [
					{ label: "New box", hint: "N", action: () => editor.addRootBlockCentered(p.x, p.y) },
					{
						label: "Reset view",
						action: () => {
							editor.pan = { x: 0, y: 0 };
						},
					},
					{ label: "Clear all", danger: true, action: () => editor.clear() },
				],
			};
		}
	};

	onConnectorContextMenu = (id: string, e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		editor.selectConnector(id);
		this.menu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: "Cycle arrow style", action: () => editor.cycleConnectorKind(id) },
				{
					label: "Edit description",
					action: () => {
						editor.editing = { id, part: "connector" };
					},
				},
				{ label: "Delete connector", hint: "⌫", danger: true, action: () => editor.deleteConnector(id) },
			],
		};
	};
}
