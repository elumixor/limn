<script lang="ts">
	import type { Connector } from "../diagram";
	import { editor } from "./store.svelte";
	import BoxCard from "./BoxCard.svelte";
	import ContextMenu, { type MenuItem } from "./ContextMenu.svelte";

	let container: HTMLDivElement | undefined = $state();
	let linking = $state<{ x: number; y: number } | null>(null);
	let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

	const CARD_W = 230;
	const HEADER_Y = 28;

	function toCanvas(clientX: number, clientY: number) {
		const r = container?.getBoundingClientRect();
		return {
			x: clientX - (r?.left ?? 0) + (container?.scrollLeft ?? 0),
			y: clientY - (r?.top ?? 0) + (container?.scrollTop ?? 0),
		};
	}

	function center(id: string) {
		const b = editor.box(id);
		return b ? { x: b.x + CARD_W / 2, y: b.y + HEADER_Y } : { x: 0, y: 0 };
	}

	function path(c: Connector): string {
		const a = center(c.source);
		const b = center(c.target);
		return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
	}
	function mid(c: Connector) {
		const a = center(c.source);
		const b = center(c.target);
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	}

	function onConnectorStart(boxId: string, e: PointerEvent) {
		editor.startConnector(boxId);
		linking = toCanvas(e.clientX, e.clientY);
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (editor.pendingConnector) linking = toCanvas(e.clientX, e.clientY);
	}
	function onWindowPointerUp(e: PointerEvent) {
		if (!editor.pendingConnector) return;
		const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-box-id]");
		const targetId = el?.getAttribute("data-box-id");
		if (targetId) editor.completeConnector(targetId);
		else editor.pendingConnector = null;
		linking = null;
	}

	function openCanvasMenu(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		e.preventDefault();
		const p = toCanvas(e.clientX, e.clientY);
		menu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: "New box", hint: "N", action: () => editor.addBox(p.x - CARD_W / 2, p.y - HEADER_Y) },
				{ label: "Clear all", danger: true, action: () => editor.clear() },
			],
		};
	}

	function openBoxMenu(boxId: string, e: MouseEvent) {
		menu = {
			x: e.clientX,
			y: e.clientY,
			items: [
				{ label: "Add field", hint: "F", action: () => editor.addField(boxId) },
				{ label: "Add comment", hint: "A", action: () => editor.addComment(boxId) },
				{ label: "Connect from here", hint: "C", action: () => editor.startConnector(boxId) },
				{ label: "Delete box", hint: "⌫", danger: true, action: () => editor.deleteBox(boxId) },
			],
		};
	}

	function openConnectorMenu(id: string, e: MouseEvent) {
		e.preventDefault();
		editor.selected = { type: "connector", id };
		menu = {
			x: e.clientX,
			y: e.clientY,
			items: [{ label: "Delete connector", hint: "⌫", danger: true, action: () => editor.deleteConnector(id) }],
		};
	}
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div
	bind:this={container}
	class="canvas"
	role="application"
	tabindex="-1"
	oncontextmenu={openCanvasMenu}
	onpointerdown={(e) => {
		if (e.target === e.currentTarget) {
			editor.selected = null;
			editor.pendingConnector = null;
		}
	}}
>
	<svg class="edges">
		<defs>
			<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#a1a1aa" />
			</marker>
			<marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
			</marker>
		</defs>
		{#each editor.diagram.connectors as c (c.id)}
			{@const sel = editor.selected?.type === "connector" && editor.selected.id === c.id}
			<path
				d={path(c)}
				stroke={sel ? "#6366f1" : "#a1a1aa"}
				stroke-width={sel ? 2.5 : 1.5}
				fill="none"
				marker-end="url(#{sel ? 'arrow-sel' : 'arrow'})"
			/>
		{/each}
		{#if linking && editor.pendingConnector}
			{@const a = center(editor.pendingConnector)}
			<path d="M {a.x} {a.y} L {linking.x} {linking.y}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 4" fill="none" />
		{/if}
	</svg>

	<!-- connector labels (editable, HTML layer over SVG) -->
	{#each editor.diagram.connectors as c (c.id)}
		{@const m = mid(c)}
		<input
			class="conn-label"
			class:sel={editor.selected?.type === "connector" && editor.selected.id === c.id}
			style="left:{m.x}px; top:{m.y}px"
			value={c.label ?? ""}
			placeholder="label"
			oncontextmenu={(e) => openConnectorMenu(c.id, e)}
			onfocus={() => {
				editor.selected = { type: "connector", id: c.id };
				editor.beginTextEdit(`cl:${c.id}`);
			}}
			oninput={(e) => editor.updateConnector(c.id, { label: e.currentTarget.value })}
		/>
	{/each}

	{#each editor.diagram.boxes as box (box.id)}
		<BoxCard {box} onconnectorstart={onConnectorStart} onboxcontextmenu={openBoxMenu} />
	{/each}

	{#if !editor.diagram.boxes.length}
		<div class="empty">
			<p>Right-click or press <kbd>N</kbd> to add a box.</p>
			<p class="dim">Drag the ↘ handle between boxes to connect them.</p>
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
		background-image: radial-gradient(circle, var(--grid, #e4e4e7) 1px, transparent 1px);
		background-size: 22px 22px;
		outline: none;
	}
	.edges {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		min-width: 3000px;
		min-height: 2000px;
		pointer-events: none;
	}
	.conn-label {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 96px;
		text-align: center;
		font-size: 11px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 5px;
		background: var(--card, #fff);
		color: var(--fg, #3f3f46);
		padding: 2px 4px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}
	.conn-label:focus {
		outline: none;
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgb(99 102 241 / 0.25);
	}
	.conn-label.sel {
		border-color: #6366f1;
	}
	.empty {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: var(--muted-fg, #71717a);
		font-size: 14px;
		pointer-events: none;
	}
	.empty .dim {
		font-size: 12px;
		color: var(--muted-fg, #a1a1aa);
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
