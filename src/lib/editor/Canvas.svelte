<script lang="ts">
	import type { Connector } from "../diagram";
	import { editor } from "./store.svelte";
	import BlockView from "./BlockView.svelte";
	import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";

	let container: HTMLDivElement | undefined = $state();
	let linking = $state<{ x: number; y: number } | null>(null);
	let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

	const THRESHOLD = 4;
	type Drag = { id: string; ox: number; oy: number; sx: number; sy: number; moving: boolean };
	let drag: Drag | null = null;

	function toCanvas(clientX: number, clientY: number) {
		const r = container?.getBoundingClientRect();
		return {
			x: clientX - (r?.left ?? 0) + (container?.scrollLeft ?? 0),
			y: clientY - (r?.top ?? 0) + (container?.scrollTop ?? 0),
		};
	}

	function rect(id: string) {
		const b = editor.block(id);
		const s = editor.sizes.get(id) ?? { w: 180, h: 56 };
		return { x: b?.x ?? 0, y: b?.y ?? 0, w: s.w, h: s.h };
	}

	/** Point on a rect's border along the line toward `t`. */
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

	// ---- block drag / click -------------------------------------------------
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		if (editor.pendingConnector) return;
		if (isEditingField(e.target)) return; // let text editing happen
		const id = blockIdAt(e.target);
		if (!id) {
			editor.selected = null;
			editor.editing = null;
			return;
		}
		drag = { id, ox: 0, oy: 0, sx: e.clientX, sy: e.clientY, moving: false };
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (editor.pendingConnector) {
			linking = toCanvas(e.clientX, e.clientY);
			return;
		}
		if (!drag) return;
		if (!drag.moving) {
			if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < THRESHOLD) return;
			drag.moving = true;
			editor.snapshot();
			// promote nested block to root at its current screen position
			if (!editor.isRoot(drag.id)) {
				const el = container?.querySelector(`[data-block-id="${drag.id}"]`) as HTMLElement | null;
				const r = el?.getBoundingClientRect();
				const p = toCanvas(r?.left ?? e.clientX, r?.top ?? e.clientY);
				editor.reparent(drag.id, null, p.x, p.y, { record: false });
			}
			const b = editor.block(drag.id);
			const p = toCanvas(e.clientX, e.clientY);
			drag.ox = p.x - (b?.x ?? 0);
			drag.oy = p.y - (b?.y ?? 0);
		}
		const p = toCanvas(e.clientX, e.clientY);
		editor.move(drag.id, p.x - drag.ox, p.y - drag.oy);
	}

	function onWindowPointerUp(e: PointerEvent) {
		if (editor.pendingConnector) {
			const target = blockIdAt(document.elementFromPoint(e.clientX, e.clientY));
			if (target) editor.completeConnector(target);
			else editor.pendingConnector = null;
			linking = null;
			return;
		}
		if (!drag) return;
		if (drag.moving) {
			// nest into the deepest block under the cursor that isn't the dragged subtree
			const dropTarget = document
				.elementsFromPoint(e.clientX, e.clientY)
				.map((el) => (el as HTMLElement).closest?.("[data-block-id]") as HTMLElement | null)
				.find((el) => el && el.dataset.blockId && !el.closest(`[data-block-id="${drag!.id}"]`));
			const targetId = (dropTarget as HTMLElement | undefined)?.dataset.blockId;
			if (targetId && targetId !== drag.id) editor.reparent(drag.id, targetId, 0, 0, { record: false });
		} else {
			editor.selected = { kind: "block", id: drag.id };
		}
		drag = null;
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
			editor.selected = { kind: "block", id };
			const b = editor.block(id);
			const nested = !editor.isRoot(id);
			const items: MenuItem[] = [
				{ label: "Add subblock", hint: "F", action: () => editor.addChild(id) },
				{ label: "Add comment", hint: "A", action: () => editor.addComment(id) },
			];
			if (b?.comments.length)
				items.push({ label: (b.showComments ?? true) ? "Hide comments" : "Show comments", action: () => editor.toggleComments(id) });
			if (b?.children.length)
				items.push({ label: b.collapsed ? "Expand" : "Collapse", action: () => editor.toggleCollapsed(id) });
			if (!nested) items.push({ label: "Connect from here", hint: "C", action: () => editor.startConnector(id) });
			if (nested) {
				const r = (e.target as HTMLElement).closest("[data-block-id]")?.getBoundingClientRect();
				const p = toCanvas(r?.left ?? e.clientX, r?.top ?? e.clientY);
				items.push({ label: "Move to canvas", action: () => editor.reparent(id, null, p.x, p.y) });
			}
			items.push({ label: "Delete", hint: "⌫", danger: true, action: () => editor.deleteBlock(id) });
			menu = { x: e.clientX, y: e.clientY, items };
		} else {
			const p = toCanvas(e.clientX, e.clientY);
			menu = {
				x: e.clientX,
				y: e.clientY,
				items: [
					{ label: "New box", hint: "N", action: () => editor.addRootBlock(p.x - 85, p.y - 20) },
					{ label: "Clear all", danger: true, action: () => editor.clear() },
				],
			};
		}
	}

	function onConnectorContextMenu(id: string, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		editor.selected = { kind: "connector", id };
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
	bind:this={container}
	class="canvas"
	role="application"
	tabindex="-1"
	onpointerdown={onPointerDown}
	oncontextmenu={onContextMenu}
>
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
			{@const sel = editor.selected?.kind === "connector" && editor.selected.id === c.id}
			{@const col = sel ? "#6366f1" : "#a1a1aa"}
			<path
				class="edge-hit"
				d="M {g.p1.x} {g.p1.y} L {g.p2.x} {g.p2.y}"
				onpointerdown={() => (editor.selected = { kind: "connector", id: c.id })}
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
		{@const sel = editor.selected?.kind === "connector" && editor.selected.id === c.id}
		{#if c.description || (editor.editing?.id === c.id && editor.editing.part === "connector") || sel}
			<input
				class="conn-desc"
				class:sel
				style="left:{mx}px; top:{my}px"
				value={c.description ?? ""}
				placeholder="describe…"
				oncontextmenu={(e) => onConnectorContextMenu(c.id, e)}
				onfocus={() => {
					editor.selected = { kind: "connector", id: c.id };
					editor.beginTextEdit(`cd:${c.id}`);
				}}
				oninput={(e) => editor.setConnectorDescription(c.id, e.currentTarget.value)}
			/>
		{/if}
	{/each}

	{#each editor.diagram.blocks as block (block.id)}
		<BlockView {block} root onconnectorstart={onConnectorStart} />
	{/each}

	{#if !editor.diagram.blocks.length}
		<div class="empty">
			<p>Press <kbd>N</kbd> or right-click to add a box.</p>
		</div>
	{/if}
</div>

{#if menu}
	<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: auto;
		background-color: var(--bg, #fafafa);
		background-image: radial-gradient(circle, var(--grid, #e7e7ea) 1px, transparent 1px);
		background-size: 22px 22px;
		outline: none;
	}
	.edges {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		min-width: 4000px;
		min-height: 3000px;
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
