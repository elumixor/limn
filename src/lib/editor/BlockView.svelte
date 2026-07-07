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
	const showComments = $derived((block.showComments ?? true) && block.comments.length > 0);

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
	function measure(node: HTMLElement) {
		if (!root) return;
		const ro = new ResizeObserver(() => editor.measure(block.id, node.offsetWidth, node.offsetHeight));
		ro.observe(node);
		editor.measure(block.id, node.offsetWidth, node.offsetHeight);
		return {
			destroy: () => {
				ro.disconnect();
				// Drop the measured size when this root unmounts (deleted, or nested so
				// it's no longer a root) — otherwise `editor.sizes` grows unbounded.
				editor.sizes.delete(block.id);
			},
		};
	}

	function isEditingComment(i: number) {
		return editor.editing?.id === block.id && editor.editing.part === "comment" && editor.editing.index === i;
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
	data-block-id={block.id}
	style={boxStyle(block)}
	use:measure
>
	<div class="head">
		<BlockTypeSelect {block} />

		<div class="title-row">
			{#if editingName}
				<input
					class="name-input"
					value={block.name}
					use:autofocus
					onpointerdown={(e) => e.stopPropagation()}
					oninput={(e) => editor.rename(block.id, e.currentTarget.value)}
					onfocus={() => editor.beginTextEdit(`name:${block.id}`)}
					onblur={() => {
						if (editor.editing?.id === block.id && editor.editing.part === "name") editor.editing = null;
					}}
					onkeydown={(e) => {
						if (e.key === "Enter" || e.key === "Escape") {
							e.preventDefault();
							editor.editing = null;
						}
					}}
				/>
			{:else}
				<span class="name" data-edit="name" role="textbox" tabindex="-1">{block.name || "Untitled"}</span>
			{/if}

			{#if !showComments && block.comments.length}
				<span class="badge" title="{block.comments.length} comment(s)">💬{block.comments.length}</span>
			{/if}
		</div>
	</div>

	{#if showComments}
		<div class="comments">
			{#each block.comments as c, i (i)}
				<div class="comment">
					{#if isEditingComment(i)}
						<textarea
							rows="1"
							value={c}
							use:autofocus
							use:autosize
							onpointerdown={(e) => e.stopPropagation()}
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
						<span class="comment-text" data-edit="comment" data-ci={i} role="textbox" tabindex="-1">{c || "comment…"}</span>
					{/if}
					<button
						class="del"
						aria-label="Delete comment"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={() => editor.deleteComment(block.id, i)}>×</button
					>
				</div>
			{/each}
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}
	.block:not(.root) .name,
	.block:not(.root) .name-input {
		font-weight: 500;
		font-size: 12.5px;
	}
	.name {
		user-select: none;
		cursor: text;
		border-radius: 4px;
		padding: 1px 5px;
		margin: -1px 0;
	}
	.name:hover {
		background: var(--accent, #f4f4f5);
		box-shadow: inset 0 0 0 1px var(--border, #e4e4e7);
	}
	.name-input {
		border: none;
		background: transparent;
		border-radius: 4px;
		padding: 1px 5px;
		font-family: inherit;
		outline: none;
	}
	.badge {
		font-size: 10px;
		color: var(--muted-fg, #a1a1aa);
		background: var(--muted, #f4f4f5);
		border-radius: 4px;
		padding: 1px 5px;
		user-select: none;
	}
	.comments {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 9px 6px 9px;
	}
	.comment {
		display: flex;
		align-items: flex-start;
		gap: 4px;
	}
	.comment-text {
		flex: 1;
		font-size: 12px;
		color: var(--muted-fg, #71717a);
		white-space: pre-wrap;
		word-break: break-word;
		cursor: text;
		min-height: 16px;
		border-radius: 4px;
		padding: 1px 4px;
		margin: -1px 0;
	}
	.comment-text:hover {
		background: var(--accent, #f4f4f5);
		box-shadow: inset 0 0 0 1px var(--border, #e4e4e7);
	}
	.comment textarea {
		flex: 1;
		border: none;
		background: #fffbeb;
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
	/* Freeform container: children are absolutely positioned inside it and the box
	   fills the remaining height of the (sized) parent block. */
	.children {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		margin: 0 6px 6px;
	}
</style>
