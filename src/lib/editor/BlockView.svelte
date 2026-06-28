<script lang="ts">
	import type { Block } from "../diagram";
	import { editor } from "./store.svelte";
	import Self from "./BlockView.svelte";

	let {
		block,
		root = false,
		onconnectorstart,
	}: {
		block: Block;
		root?: boolean;
		onconnectorstart: (id: string, e: PointerEvent) => void;
	} = $props();

	const selected = $derived(editor.isBlockSelected(block.id));
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
		return { destroy: () => ro.disconnect() };
	}

	function isEditingComment(i: number) {
		return editor.editing?.id === block.id && editor.editing.part === "comment" && editor.editing.index === i;
	}
</script>

<div
	class="block"
	class:root
	class:selected
	class:linking={editor.pendingConnector === block.id}
	data-block-id={block.id}
	style={root ? `left:${block.x ?? 0}px; top:${block.y ?? 0}px` : ""}
	use:measure
>
	<div class="head">

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

		{#if root}
			<button
				class="connect"
				title="Drag to connect"
				aria-label="Connect"
				onpointerdown={(e) => {
					e.stopPropagation();
					onconnectorstart(block.id, e);
				}}
			></button>
		{/if}
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
				<Self block={child} {onconnectorstart} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.block {
		background: var(--card, #fff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 9px;
		font-size: 13px;
		display: flex;
		flex-direction: column;
	}
	.block.root {
		position: absolute;
		min-width: 170px;
		max-width: 320px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04);
		cursor: grab;
	}
	.block:not(.root) {
		margin: 0;
		background: var(--muted, #fafafa);
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
	.head {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 7px 9px;
		position: relative;
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
		background: var(--accent, #f4f4f5);
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
	.connect {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 2px solid var(--card, #fff);
		background: var(--muted-fg, #a1a1aa);
		cursor: crosshair;
		padding: 0;
		opacity: 0;
		transition: opacity 0.1s, background 0.1s;
		flex-shrink: 0;
	}
	.block.root:hover .connect,
	.block.root.selected .connect {
		opacity: 1;
	}
	.connect:hover {
		background: #6366f1;
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
	.children {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 0 9px 9px 9px;
	}
</style>
