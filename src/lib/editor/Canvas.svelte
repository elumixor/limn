<script lang="ts">
	import type { Connector } from "../diagram";
	import { editor } from "./store.svelte";
	import BlockView from "./BlockView.svelte";
	import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";

	let viewport: HTMLDivElement | undefined = $state();
	let linking = $state<{ x: number; y: number } | null>(null);
	let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

	const THRESHOLD = 4;
	type Drag = {
		id: string;
		targetEl: Element | null;
		sx: number;
		sy: number;
		moving: boolean;
		group: string[];
		start: Map<string, { x: number; y: number }>;
		px: number;
		py: number;
	};
	let drag: Drag | null = null;
	let panning = $state<{ sx: number; sy: number; px: number; py: number } | null>(null);

	function vrect() {
		return viewport?.getBoundingClientRect();
	}
	function toCanvas(clientX: number, clientY: number) {
		const r = vrect();
		return { x: clientX - (r?.left ?? 0) - editor.pan.x, y: clientY - (r?.top ?? 0) - editor.pan.y };
	}

	function rect(id: string) {
		const b = editor.block(id);
		const s = editor.sizes.get(id) ?? { w: 180, h: 56 };
		return { x: b?.x ?? 0, y: b?.y ?? 0, w: s.w, h: s.h };
	}
	function border(r: { x: number; y: number; w: number; h: number }, t: { x: number; y: number }) {
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		const dx = t.x - cx;
		const dy = t.y - cy;
		if (!dx && !dy) return { x: cx, y: cy };
		const sx = dx ? r.w / 2 / Math.abs(dx) : Infinity;
		const sy = dy ? r.h / 2 / Math.abs(dy) : Infinity;
		const s = Math.min(sx, sy);
		return { x: cx + dx * s, y: cy + dy * s };
	}
	function geometry(c: Connector) {
		const a = rect(c.source);
		const b = rect(c.target);
		const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
		const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
		return { p1: border(a, cb), p2: border(b, ca) };
	}

	function isEditingField(t: EventTarget | null) {
		return !!(t as HTMLElement)?.closest("input, textarea");
	}
	function blockIdAt(node: EventTarget | null): string | null {
		return ((node as HTMLElement)?.closest("[data-block-id]") as HTMLElement)?.dataset.blockId ?? null;
	}

	// ---- pan ----------------------------------------------------------------
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		editor.pan = { x: editor.pan.x - e.deltaX, y: editor.pan.y - e.deltaY };
	}

	// ---- pointer ------------------------------------------------------------
	function onPointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			e.preventDefault();
			panning = { sx: e.clientX, sy: e.clientY, px: editor.pan.x, py: editor.pan.y };
			return;
		}
		if (e.button !== 0) return;
		if (editor.pendingConnector) return;
		if (isEditingField(e.target)) return;

		const id = blockIdAt(e.target);
		if (!id) {
			// start marquee selection on empty canvas
			if (!e.shiftKey) editor.clearSelection();
			editor.editing = null;
			const r = vrect();
			const x = e.clientX - (r?.left ?? 0);
			const y = e.clientY - (r?.top ?? 0);
			marquee = { x0: x, y0: y, x1: x, y1: y };
			return;
		}
		drag = {
			id,
			targetEl: e.target as Element,
			sx: e.clientX,
			sy: e.clientY,
			moving: false,
			group: [],
			start: new Map(),
			px: 0,
			py: 0,
		};
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (panning) {
			editor.pan = { x: panning.px + (e.clientX - panning.sx), y: panning.py + (e.clientY - panning.sy) };
			return;
		}
		if (editor.pendingConnector) {
			linking = toCanvas(e.clientX, e.clientY);
			return;
		}
		if (marquee) {
			const r = vrect();
			marquee = { ...marquee, x1: e.clientX - (r?.left ?? 0), y1: e.clientY - (r?.top ?? 0) };
			return;
		}
		if (!drag) return;
		if (!drag.moving) {
			if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < THRESHOLD) return;
			drag.moving = true;
			editor.snapshot();
			if (!editor.isRoot(drag.id)) {
				const el = viewport?.querySelector(`[data-block-id="${drag.id}"]`) as HTMLElement | null;
				const r = el?.getBoundingClientRect();
				const p = toCanvas(r?.left ?? e.clientX, r?.top ?? e.clientY);
				editor.reparent(drag.id, null, p.x, p.y, { record: false });
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
			const ps = toCanvas(e.clientX, e.clientY);
			drag.px = ps.x;
			drag.py = ps.y;
		}
		const p = toCanvas(e.clientX, e.clientY);
		for (const id of drag.group) {
			const s = drag.start.get(id);
			if (s) editor.move(id, s.x + (p.x - drag.px), s.y + (p.y - drag.py));
		}
		// live drop-target feedback (only single-block drags can nest)
		editor.dropTarget = drag.group.length === 1 ? dropTargetAt(e.clientX, e.clientY) : null;
	}

	/** The block under the cursor that the dragged block could nest into. */
	function dropTargetAt(clientX: number, clientY: number): string | null {
		if (!drag) return null;
		const el = document
			.elementsFromPoint(clientX, clientY)
			.map((n) => (n as HTMLElement).closest?.("[data-block-id]") as HTMLElement | null)
			.find((n) => n && n.dataset.blockId && !n.closest(`[data-block-id="${drag!.id}"]`));
		return (el as HTMLElement | undefined)?.dataset.blockId ?? null;
	}

	function onWindowPointerUp(e: PointerEvent) {
		if (panning) {
			panning = null;
			return;
		}
		if (editor.pendingConnector) {
			const target = blockIdAt(document.elementFromPoint(e.clientX, e.clientY));
			if (target) editor.completeConnector(target);
			else editor.pendingConnector = null;
			linking = null;
			return;
		}
		if (marquee) {
			finishMarquee(e.shiftKey);
			marquee = null;
			return;
		}
		if (!drag) return;
		editor.draggingId = null;
		editor.dropTarget = null;
		if (drag.moving) {
			if (drag.group.length === 1) {
				const targetId = dropTargetAt(e.clientX, e.clientY);
				if (targetId && targetId !== drag.id) editor.reparent(drag.id, targetId, 0, 0, { record: false });
			}
		} else {
			editor.selectBlock(drag.id);
			const editEl = (drag.targetEl as HTMLElement | null)?.closest("[data-edit]");
			if (editEl) {
				const part = editEl.getAttribute("data-edit");
				if (part === "name") editor.editing = { id: drag.id, part: "name" };
				else editor.editing = { id: drag.id, part: "comment", index: Number(editEl.getAttribute("data-ci")) };
			} else {
				editor.editing = null;
			}
		}
		drag = null;
	}

	function finishMarquee(additive: boolean) {
		if (!marquee) return;
		const r = vrect();
		// marquee rect in canvas (content) coords
		const x0 = Math.min(marquee.x0, marquee.x1) - editor.pan.x;
		const y0 = Math.min(marquee.y0, marquee.y1) - editor.pan.y;
		const x1 = Math.max(marquee.x0, marquee.x1) - editor.pan.x;
		const y1 = Math.max(marquee.y0, marquee.y1) - editor.pan.y;
		if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) return; // a click, not a marquee
		void r;
		const hits = editor.diagram.blocks
			.filter((b) => {
				const s = editor.sizes.get(b.id) ?? { w: 180, h: 56 };
				const bx = b.x ?? 0;
				const by = b.y ?? 0;
				return bx < x1 && bx + s.w > x0 && by < y1 && by + s.h > y0;
			})
			.map((b) => b.id);
		const next = additive ? [...new Set([...editor.selectedBlocks, ...hits])] : hits;
		editor.selectBlocks(next);
	}

	function onConnectorStart(id: string, e: PointerEvent) {
		editor.startConnector(id);
		linking = toCanvas(e.clientX, e.clientY);
	}

	// ---- context menus ------------------------------------------------------
	function onContextMenu(e: MouseEvent) {
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
				const p = toCanvas(r?.left ?? e.clientX, r?.top ?? e.clientY);
				items.push({ label: "Move to canvas", action: () => editor.reparent(id, null, p.x, p.y) });
			}
			items.push({ label: "Delete", hint: "⌫", danger: true, action: () => editor.deleteSelected() });
			menu = { x: e.clientX, y: e.clientY, items };
		} else {
			const p = toCanvas(e.clientX, e.clientY);
			menu = {
				x: e.clientX,
				y: e.clientY,
				items: [
					{ label: "New box", hint: "N", action: () => editor.addRootBlock(p.x - 85, p.y - 20) },
					{ label: "Reset view", action: () => (editor.pan = { x: 0, y: 0 }) },
					{ label: "Clear all", danger: true, action: () => editor.clear() },
				],
			};
		}
	}

	function onConnectorContextMenu(id: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		editor.selectConnector(id);
		menu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: "Cycle arrow style", action: () => editor.cycleConnectorKind(id) },
				{ label: "Edit description", action: () => (editor.editing = { id, part: "connector" }) },
				{ label: "Delete connector", hint: "⌫", danger: true, action: () => editor.deleteConnector(id) },
			],
		};
	}
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div
	bind:this={viewport}
	class="viewport"
	class:panning={!!panning}
	role="application"
	tabindex="-1"
	onpointerdown={onPointerDown}
	oncontextmenu={onContextMenu}
	onwheel={onWheel}
>
	<div class="content" style="transform: translate({editor.pan.x}px, {editor.pan.y}px)">
		<svg class="edges">
			<defs>
				<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill="#a1a1aa" />
				</marker>
				<marker id="ah-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
				</marker>
			</defs>
			{#each editor.diagram.connectors as c (c.id)}
				{@const g = geometry(c)}
				{@const sel = editor.selectedConnector === c.id}
				{@const col = sel ? "#6366f1" : "#a1a1aa"}
				<path
					class="edge-hit"
					d="M {g.p1.x} {g.p1.y} L {g.p2.x} {g.p2.y}"
					onpointerdown={() => editor.selectConnector(c.id)}
					oncontextmenu={(e) => onConnectorContextMenu(c.id, e)}
					role="button"
					tabindex="-1"
				/>
				<path
					d="M {g.p1.x} {g.p1.y} L {g.p2.x} {g.p2.y}"
					stroke={col}
					stroke-width={sel ? 2.5 : 1.5}
					fill="none"
					marker-end={c.kind !== "line" ? `url(#${sel ? "ah-sel" : "ah"})` : undefined}
					marker-start={c.kind === "double" ? `url(#${sel ? "ah-sel" : "ah"})` : undefined}
				/>
			{/each}
			{#if linking && editor.pendingConnector}
				{@const a = rect(editor.pendingConnector)}
				{@const p1 = border(a, linking)}
				<path d="M {p1.x} {p1.y} L {linking.x} {linking.y}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 4" fill="none" />
			{/if}
		</svg>

		{#each editor.diagram.connectors as c (c.id)}
			{@const g = geometry(c)}
			{@const mx = (g.p1.x + g.p2.x) / 2}
			{@const my = (g.p1.y + g.p2.y) / 2}
			{@const sel = editor.selectedConnector === c.id}
			{#if c.description || (editor.editing?.id === c.id && editor.editing.part === "connector") || sel}
				<input
					class="conn-desc"
					class:sel
					style="left:{mx}px; top:{my}px"
					value={c.description ?? ""}
					placeholder="describe…"
					oncontextmenu={(e) => onConnectorContextMenu(c.id, e)}
					onfocus={() => {
						editor.selectConnector(c.id);
						editor.beginTextEdit(`cd:${c.id}`);
					}}
					oninput={(e) => editor.setConnectorDescription(c.id, e.currentTarget.value)}
				/>
			{/if}
		{/each}

		{#each editor.diagram.blocks as block (block.id)}
			<BlockView {block} root onconnectorstart={onConnectorStart} />
		{/each}
	</div>

	{#if marquee}
		<div
			class="marquee"
			style="left:{Math.min(marquee.x0, marquee.x1)}px; top:{Math.min(marquee.y0, marquee.y1)}px; width:{Math.abs(
				marquee.x1 - marquee.x0,
			)}px; height:{Math.abs(marquee.y1 - marquee.y0)}px"
		></div>
	{/if}

	{#if !editor.diagram.blocks.length}
		<div class="empty"><p>Press <kbd>N</kbd> or right-click to add a box.</p></div>
	{/if}
</div>

{#if menu}
	<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: var(--bg, #fafafa);
		background-image: radial-gradient(circle, var(--grid, #e7e7ea) 1px, transparent 1px);
		background-size: 22px 22px;
		outline: none;
		touch-action: none;
	}
	.viewport.panning {
		cursor: grabbing;
	}
	.content {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
	}
	.edges {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		width: 1px;
		height: 1px;
		pointer-events: none;
	}
	.edge-hit {
		stroke: transparent;
		stroke-width: 12;
		fill: none;
		pointer-events: stroke;
		cursor: pointer;
	}
	.conn-desc {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 110px;
		text-align: center;
		font-size: 11px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 6px;
		background: var(--card, #fff);
		color: var(--fg, #3f3f46);
		padding: 3px 5px;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
		outline: none;
	}
	.conn-desc:focus,
	.conn-desc.sel {
		border-color: #6366f1;
	}
	.marquee {
		position: absolute;
		background: rgb(99 102 241 / 0.1);
		border: 1px solid #6366f1;
		border-radius: 2px;
		pointer-events: none;
	}
	.empty {
		position: absolute;
		top: 38%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: var(--muted-fg, #a1a1aa);
		font-size: 14px;
		pointer-events: none;
	}
	.empty kbd {
		font-family: ui-monospace, monospace;
		background: var(--muted, #f4f4f5);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 12px;
	}
</style>
