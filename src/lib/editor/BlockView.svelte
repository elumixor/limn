<script lang="ts">
	import type { Block } from "../diagram";
	import BlockTypeSelect from "./BlockTypeSelect.svelte";
	import { editor } from "./store.svelte";
	import Self from "./BlockView.svelte";

	let {
		block,
		root = false,
	}: {
		block: Block;
		root?: boolean;
	} = $props();

	const selected = $derived(editor.isBlockSelected(block.id));
	const isDragging = $derived(editor.draggingId === block.id);
	const isDropTarget = $derived(editor.dropTarget === block.id);
	const editingName = $derived(editor.editing?.id === block.id && editor.editing.part === "name");
	// When set, this block is a public-API panel glued to `expose.side` of its owner:
	// it shows a fixed "exposes" header (no type/name) instead of the normal one.
	const expose = $derived(editor.exposeByBox(block.id));

	function autofocus(node: HTMLInputElement | HTMLTextAreaElement) {
		requestAnimationFrame(() => {
			node.focus();
			node.select?.();
		});
	}
	function autosize(node: HTMLTextAreaElement) {
		const fit = () => {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight}px`;
		};
		fit();
		node.addEventListener("input", fit);
		return { destroy: () => node.removeEventListener("input", fit) };
	}
	// Feed connector geometry: root blocks report their measured on-screen size,
	// and any block with children reports where its `.children` box sits inside
	// it (so nested blocks can be placed in canvas space — see `canvasRect`).
	function measure(node: HTMLElement) {
		const sync = () => {
			if (root) editor.measure(block.id, node.offsetWidth, node.offsetHeight);
			const kids = node.querySelector(":scope > .children") as HTMLElement | null;
			if (kids) editor.measureChildOffset(block.id, kids.offsetLeft, kids.offsetTop);
		};
		const ro = new ResizeObserver(sync);
		ro.observe(node);
		sync();
		return {
			destroy: () => {
				ro.disconnect();
				// Drop measured data when the block unmounts (deleted, or a root nested so
				// it's no longer measured here) — otherwise the maps grow unbounded.
				editor.sizes.delete(block.id);
				editor.childOffsets.delete(block.id);
			},
		};
	}

	// Every block is absolutely positioned within its container — a root inside the
	// canvas, a nested block inside its parent's `.children` box. Coordinates are
	// relative to that container, so the same geometry fields drive both.
	function boxStyle(b: Block) {
		let s = `left:${b.x ?? 0}px; top:${b.y ?? 0}px;`;
		if (b.w) s += `width:${b.w}px;${root ? "max-width:none;" : ""}`;
		if (b.h) s += `height:${b.h}px;`;
		return s;
	}
</script>

<div
	class="block"
	class:root
	class:selected
	class:dragging={isDragging}
	class:droptarget={isDropTarget}
	class:linking={editor.pendingConnector === block.id}
	class:expose={!!expose}
	class:expose-right={expose?.side === "right"}
	class:expose-left={expose?.side === "left"}
	class:expose-top={expose?.side === "top"}
	class:expose-bottom={expose?.side === "bottom"}
	data-block-id={block.id}
	style={boxStyle(block)}
	use:measure
>
	{#if expose}
		<!-- Public-API panel: fixed icon + "exposes" label, no type select or name. -->
		<div class="head expose-header">
			<svg
				class="expose-glyph"
				viewBox="0 0 24 24"
				width="13"
				height="13"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
				<path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
				<circle cx="12" cy="12" r="2" />
				<path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
				<path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
			</svg>
			<span class="expose-label">exposes</span>
		</div>
	{:else}
		<div class="head">
			<BlockTypeSelect {block} />

			<div class="title-row">
				{#if editingName}
					<textarea
						class="name-input"
						rows="1"
						value={block.name}
						use:autofocus
						use:autosize
						onpointerdown={(e) => e.stopPropagation()}
						oninput={(e) => editor.rename(block.id, e.currentTarget.value)}
						onfocus={() => editor.beginTextEdit(`name:${block.id}`)}
						onblur={() => {
							if (editor.editing?.id === block.id && editor.editing.part === "name") editor.editing = null;
						}}
						onkeydown={(e) => {
							// Shift+Enter inserts a newline; plain Enter commits, Escape cancels.
							if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
								e.preventDefault();
								editor.editing = null;
							}
						}}
					></textarea>
				{:else}
					<span class="name" data-edit="name" role="textbox" tabindex="-1">{block.name || "Untitled"}</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if block.children.length}
		<div class="children">
			{#each block.children as child (child.id)}
				<Self block={child} />
			{/each}
		</div>
	{/if}

	{#if isDropTarget}
		<div class="dropslot">drop to nest</div>
	{/if}
</div>

<style>
	.block {
		/* Every block is absolutely positioned within its container (canvas for
		   roots, the parent's `.children` box for nested blocks). */
		position: absolute;
		box-sizing: border-box;
		background: var(--card, #fff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 9px;
		font-size: 13px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		cursor: grab;
	}
	.block.root {
		min-width: 170px;
		max-width: 320px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04);
	}
	.block:not(.root) {
		margin: 0;
		font-size: 12px;
	}
	.block.selected {
		border-color: var(--ring, #18181b);
		box-shadow: 0 0 0 2px var(--ring, #18181b);
	}
	.block.root.selected {
		box-shadow: 0 0 0 2px var(--ring, #18181b), 0 6px 16px rgb(0 0 0 / 0.1);
	}
	.block.linking {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px #6366f1;
	}
	.block.dragging {
		opacity: 0.5;
	}
	.block.droptarget {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px #6366f1, 0 10px 24px rgb(99 102 241 / 0.22);
	}
	.dropslot {
		margin: 0 9px 9px;
		padding: 8px;
		border: 1.5px dashed #6366f1;
		border-radius: 7px;
		color: #6366f1;
		font-size: 11px;
		font-weight: 500;
		text-align: center;
		background: rgb(99 102 241 / 0.07);
	}
	.head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 7px 9px;
		position: relative;
	}
	/* Exposes panel: muted fill, flattened where it meets its owner, fixed header. */
	.block.expose {
		background: var(--muted, #f7f7f8);
		box-shadow: none;
	}
	.block.expose.selected {
		box-shadow: 0 0 0 2px var(--ring, #18181b);
	}
	.block.expose-right {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}
	.block.expose-left {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.block.expose-top {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	.block.expose-bottom {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.expose-header {
		flex-direction: row;
		align-items: center;
		gap: 5px;
		color: #db2777;
	}
	.expose-glyph {
		flex: none;
	}
	.expose-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.02em;
		user-select: none;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 5px;
		width: 100%;
		min-width: 0;
	}
	.name,
	.name-input {
		flex: 1;
		font-weight: 600;
		font-size: 13.5px;
		color: var(--fg, #18181b);
		min-width: 0;
		/* Preserve author-entered line breaks (Shift+Enter) and wrap long lines. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		text-align: left;
	}
	.name {
		user-select: none;
		cursor: text;
		border-radius: 4px;
		padding: 1px 5px;
		margin: -1px 0;
	}
	.name-input {
		border: none;
		background: transparent;
		border-radius: 4px;
		padding: 1px 5px;
		font-family: inherit;
		font-weight: inherit;
		line-height: inherit;
		outline: none;
		resize: none;
		overflow: hidden;
	}
	/* Freeform container: children are absolutely positioned inside it and the box
	   fills the remaining height of the (sized) parent block. */
	.children {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		margin: 0 6px 6px;
	}
</style>
