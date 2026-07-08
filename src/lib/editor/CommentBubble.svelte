<script lang="ts">
	import type { Block } from "../diagram";
	import { editor } from "./store.svelte";

	// A block's comments live in this floating bubble (rendered on the canvas, not
	// inside the block) so blocks stay compact. Positioned by the parent from the
	// block's rect + its stored `commentPos` offset, so it follows the block.
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

	function autofocus(node: HTMLTextAreaElement) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
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
	function isEditing(i: number) {
		return editor.editing?.id === block.id && editor.editing.part === "comment" && editor.editing.index === i;
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
	<div class="bar">
		<button class="grip" title="Move comments" aria-label="Move comments" onpointerdown={onGrab}>⠿</button>
		<button class="add" onclick={() => editor.addComment(block.id)}>+ comment</button>
	</div>
	<div class="lines">
		{#each block.comments as c, i (i)}
			<div class="comment">
				{#if isEditing(i)}
					<textarea
						rows="1"
						value={c}
						use:autofocus
						use:autosize
						oninput={(e) => editor.updateComment(block.id, i, e.currentTarget.value)}
						onfocus={() => editor.beginTextEdit(`c:${block.id}:${i}`)}
						onblur={() => {
							if (editor.editing?.id === block.id && editor.editing.part === "comment" && editor.editing.index === i)
								editor.editing = null;
						}}
						onkeydown={(e) => {
							if (e.key === "Escape") editor.editing = null;
						}}
					></textarea>
				{:else}
					<span
						class="comment-text"
						role="textbox"
						tabindex="-1"
						ondblclick={() => {
							editor.selectBlock(block.id);
							editor.editing = { id: block.id, part: "comment", index: i };
						}}>{c || "comment…"}</span
					>
				{/if}
				<button class="del" aria-label="Delete comment" onclick={() => editor.deleteComment(block.id, i)}>×</button>
			</div>
		{/each}
	</div>
</div>

<style>
	.bubble {
		position: absolute;
		z-index: 3;
		display: flex;
		flex-direction: column;
		gap: 2px;
		/* Hug the comment text (up to a cap) instead of stretching, so lines don't
		   collapse to one character per row. */
		width: max-content;
		min-width: 96px;
		max-width: 240px;
		padding: 4px 6px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 8px;
		background: #fffbeb;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.grip {
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
	.lines {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.comment {
		display: flex;
		align-items: flex-start;
		gap: 4px;
	}
	.comment-text {
		flex: 1;
		font-size: 12px;
		color: #92400e;
		white-space: pre-wrap;
		word-break: break-word;
		cursor: text;
		min-height: 16px;
		border-radius: 4px;
		padding: 1px 4px;
		margin: -1px 0;
	}
	.comment textarea {
		flex: 1;
		width: 190px;
		max-width: 100%;
		border: none;
		background: #fff7d6;
		resize: none;
		font: inherit;
		font-size: 12px;
		color: #92400e;
		padding: 2px 4px;
		border-radius: 4px;
		outline: none;
		overflow: hidden;
	}
	.del {
		border: none;
		background: none;
		color: transparent;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		padding: 0 2px;
	}
	.comment:hover .del {
		color: var(--muted-fg, #c4c4cc);
	}
	.del:hover {
		color: #dc2626 !important;
	}
	.add {
		border: none;
		background: none;
		color: var(--muted-fg, #a1a1aa);
		font-size: 10px;
		white-space: nowrap;
		cursor: pointer;
		padding: 1px 3px;
		border-radius: 4px;
	}
	.add:hover {
		color: #92400e;
		background: #fff7d6;
	}
</style>
