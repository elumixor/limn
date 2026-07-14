<script lang="ts">
	import type { Block } from "../diagram";
	import { editor } from "./store.svelte";

	// A block's comment lives in this single-line floating bubble (rendered on the
	// canvas, not inside the block) so blocks stay compact. Positioned by the parent
	// from the block's rect + its stored `commentPos` offset, so it follows the block.
	let {
		block,
		left,
		top,
		offset,
	}: {
		block: Block;
		left: number;
		top: number;
		/** Current offset (px) from the block's top-left — the drag baseline. */
		offset: { x: number; y: number };
	} = $props();

	const editing = $derived(editor.editing?.id === block.id && editor.editing.part === "comment");
	const text = $derived(block.comments[0] ?? "");

	function autofocus(node: HTMLInputElement) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}
	function commit(node: HTMLInputElement) {
		// Blur ends editing; an empty comment removes itself (and the bubble).
		if (!node.value.trim()) editor.deleteComment(block.id, 0);
		if (editor.editing?.id === block.id && editor.editing.part === "comment") editor.editing = null;
	}

	// Drag the bubble to reposition it. Offsets are block-relative and the canvas
	// isn't scaled, so a client-pixel delta maps 1:1 to the stored offset.
	let dragging = false;
	let sx = 0;
	let sy = 0;
	let ox = 0;
	let oy = 0;
	function onGrab(e: PointerEvent) {
		if (e.button !== 0) return;
		e.stopPropagation();
		dragging = true;
		sx = e.clientX;
		sy = e.clientY;
		ox = offset.x;
		oy = offset.y;
		editor.snapshot();
	}
	function onMove(e: PointerEvent) {
		if (!dragging) return;
		editor.moveCommentBubble(block.id, ox + (e.clientX - sx), oy + (e.clientY - sy));
	}
	function onUp() {
		dragging = false;
	}
</script>

<svelte:window onpointermove={onMove} onpointerup={onUp} />

<div class="bubble" style="left:{left}px; top:{top}px" role="group" onpointerdown={(e) => e.stopPropagation()}>
	<button class="grip" title="Move comment" aria-label="Move comment" onpointerdown={onGrab}>⠿</button>
	{#if editing}
		<input
			class="comment-input"
			value={text}
			use:autofocus
			oninput={(e) => editor.updateComment(block.id, 0, e.currentTarget.value)}
			onfocus={() => editor.beginTextEdit(`c:${block.id}`)}
			onblur={(e) => commit(e.currentTarget)}
			onkeydown={(e) => {
				if (e.key === "Enter" || e.key === "Escape") {
					e.preventDefault();
					e.currentTarget.blur();
				}
			}}
		/>
	{:else}
		<span
			class="comment-text"
			role="textbox"
			tabindex="-1"
			ondblclick={() => {
				editor.selectBlock(block.id);
				editor.editing = { id: block.id, part: "comment", index: 0 };
			}}>{text || "comment…"}</span
		>
	{/if}
</div>

<style>
	.bubble {
		position: absolute;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: 320px;
		padding: 3px 6px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 8px;
		background: #fffbeb;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
	}
	.grip {
		flex: none;
		border: none;
		background: none;
		color: var(--muted-fg, #c4c4cc);
		cursor: grab;
		font-size: 12px;
		line-height: 1;
		padding: 0 1px;
		user-select: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.comment-text {
		font-size: 12px;
		color: #92400e;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: text;
		border-radius: 4px;
		padding: 1px 3px;
	}
	.comment-input {
		width: 200px;
		max-width: 100%;
		border: none;
		background: #fff7d6;
		font: inherit;
		font-size: 12px;
		color: #92400e;
		padding: 2px 4px;
		border-radius: 4px;
		outline: none;
	}
</style>
