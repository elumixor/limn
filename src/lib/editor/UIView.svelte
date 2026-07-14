<script lang="ts">
	import type { UIElement } from "../diagram";
	import { isTextInput } from "./dom";
	import { editor } from "./store.svelte";

	let viewport: HTMLDivElement | undefined = $state();

	const MIN_W = 60;
	const MIN_H = 40;
	const DRAG_THRESHOLD = 3;

	// One transient gesture at a time: panning, moving an element, or resizing it.
	type Gesture =
		| { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
		| { kind: "move"; id: string; startX: number; startY: number; ox: number; oy: number; recorded: boolean }
		| { kind: "resize"; id: string; startX: number; startY: number; ow: number; oh: number; recorded: boolean };
	let gesture = $state<Gesture | null>(null);

	/** Screen point → UI-canvas coordinates (undo the pan). */
	function toCanvas(clientX: number, clientY: number) {
		const r = viewport?.getBoundingClientRect();
		return { x: clientX - (r?.left ?? 0) - editor.uiPan.x, y: clientY - (r?.top ?? 0) - editor.uiPan.y };
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const el = (e.target as HTMLElement).closest("[data-ui-id]") as HTMLElement | null;
		if (el) return; // element handlers deal with their own drags
		editor.clearSelection();
		gesture = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: editor.uiPan.x, panY: editor.uiPan.y };
	}

	function onElementDown(e: PointerEvent, el: UIElement) {
		if (e.button !== 0) return;
		e.stopPropagation();
		editor.selectElement(el.id);
		gesture = { kind: "move", id: el.id, startX: e.clientX, startY: e.clientY, ox: el.x, oy: el.y, recorded: false };
	}

	function onResizeDown(e: PointerEvent, el: UIElement) {
		if (e.button !== 0) return;
		e.stopPropagation();
		editor.selectElement(el.id);
		gesture = { kind: "resize", id: el.id, startX: e.clientX, startY: e.clientY, ow: el.w, oh: el.h, recorded: false };
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (!gesture) return;
		const dx = e.clientX - gesture.startX;
		const dy = e.clientY - gesture.startY;
		if (gesture.kind === "pan") {
			editor.uiPan = { x: gesture.panX + dx, y: gesture.panY + dy };
		} else if (gesture.kind === "move") {
			if (!gesture.recorded && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
				editor.snapshot();
				gesture.recorded = true;
			}
			editor.moveElement(gesture.id, gesture.ox + dx, gesture.oy + dy);
		} else {
			if (!gesture.recorded && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
				editor.snapshot();
				gesture.recorded = true;
			}
			editor.resizeElement(gesture.id, Math.max(MIN_W, gesture.ow + dx), Math.max(MIN_H, gesture.oh + dy));
		}
	}

	function onWindowPointerUp() {
		gesture = null;
	}

	function onDoubleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest("[data-ui-id]")) return;
		const p = toCanvas(e.clientX, e.clientY);
		editor.addElement(p.x - 90, p.y - 60);
	}

	function autofocus(node: HTMLInputElement) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div
	bind:this={viewport}
	class="viewport"
	class:panning={gesture?.kind === "pan"}
	role="application"
	tabindex="-1"
	onpointerdown={onPointerDown}
	ondblclick={onDoubleClick}
>
	<div class="content" style="transform: translate({editor.uiPan.x}px, {editor.uiPan.y}px)">
		{#each editor.diagram.ui as el (el.id)}
			{@const selected = editor.isElementSelected(el.id)}
			{@const mapped = editor.mappingsForElement(el.id).length > 0}
			<div
				class="ui-el"
				class:selected
				class:mapped
				data-ui-id={el.id}
				style="left:{el.x}px; top:{el.y}px; width:{el.w}px; height:{el.h}px"
				role="button"
				tabindex="-1"
				onpointerdown={(e) => onElementDown(e, el)}
			>
				{#if editor.editing?.id === el.id && editor.editing.part === "ui"}
					<input
						class="label-input"
						value={el.label}
						use:autofocus
						onpointerdown={(e) => e.stopPropagation()}
						oninput={(e) => editor.renameElement(el.id, e.currentTarget.value)}
						onfocus={() => editor.beginTextEdit(`ui:${el.id}`)}
						onblur={() => {
							if (editor.editing?.id === el.id && editor.editing.part === "ui") editor.editing = null;
						}}
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === "Escape") {
								e.preventDefault();
								editor.editing = null;
							}
						}}
					/>
				{:else}
					<span
						class="label"
						role="textbox"
						tabindex="-1"
						ondblclick={(e) => {
							e.stopPropagation();
							editor.selectElement(el.id);
							editor.editing = { id: el.id, part: "ui" };
						}}>{el.label || "Frame"}</span
					>
				{/if}

				{#if selected}
					<div
						class="resize"
						role="button"
						tabindex="-1"
						aria-label="Resize frame"
						onpointerdown={(e) => onResizeDown(e, el)}
					></div>
				{/if}
			</div>
		{/each}
	</div>

	{#if !editor.diagram.ui.length}
		<div class="empty"><p>Double-click to add a UI frame.</p></div>
	{/if}
</div>

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
	.ui-el {
		position: absolute;
		box-sizing: border-box;
		background: var(--card, #fff);
		border: 1.5px solid var(--border, #e4e4e7);
		border-radius: 8px;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		padding: 8px 10px;
		cursor: grab;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
		user-select: none;
	}
	.ui-el.mapped {
		border-style: solid;
		border-color: #a5b4fc;
	}
	.ui-el.selected {
		border-color: var(--ring, #18181b);
		box-shadow: 0 0 0 2px var(--ring, #18181b);
	}
	.label {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--fg, #18181b);
		cursor: text;
		border-radius: 4px;
		padding: 1px 4px;
		margin: -1px 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.label-input {
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		border: none;
		background: transparent;
		outline: none;
		padding: 1px 4px;
		width: 100%;
		color: var(--fg, #18181b);
	}
	.resize {
		position: absolute;
		right: -5px;
		bottom: -5px;
		width: 12px;
		height: 12px;
		border-radius: 3px;
		background: var(--card, #fff);
		border: 2px solid var(--ring, #18181b);
		cursor: nwse-resize;
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
</style>
