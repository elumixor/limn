<script lang="ts">
	import type { Box } from "../diagram";
	import { editor } from "./store.svelte";

	let {
		box,
		onconnectorstart,
		onboxcontextmenu,
	}: {
		box: Box;
		onconnectorstart: (boxId: string, e: PointerEvent) => void;
		onboxcontextmenu: (boxId: string, e: MouseEvent) => void;
	} = $props();

	const selected = $derived.by(() => {
		const s = editor.selected;
		if (!s) return false;
		if (s.type === "box") return s.id === box.id;
		if (s.type === "field" || s.type === "comment") return s.boxId === box.id;
		return false;
	});
	const isConnectSource = $derived(editor.pendingConnector === box.id);

	let drag: { dx: number; dy: number } | null = null;

	function onHeaderPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest("input,textarea,button,.handle")) return;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		editor.selected = { type: "box", id: box.id };
		editor.beginMove();
		drag = { dx: e.clientX - box.x, dy: e.clientY - box.y };
	}
	function onHeaderPointerMove(e: PointerEvent) {
		if (drag) editor.moveBox(box.id, e.clientX - drag.dx, e.clientY - drag.dy);
	}
	function onHeaderPointerUp() {
		drag = null;
	}

	// autosize textareas
	function autosize(node: HTMLTextAreaElement) {
		const fit = () => {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight}px`;
		};
		fit();
		node.addEventListener("input", fit);
		return { destroy: () => node.removeEventListener("input", fit) };
	}
</script>

<div
	class="card"
	class:selected
	class:linking={isConnectSource}
	data-box-id={box.id}
	style="left:{box.x}px; top:{box.y}px"
	oncontextmenu={(e) => {
		e.preventDefault();
		editor.selected = { type: "box", id: box.id };
		onboxcontextmenu(box.id, e);
	}}
	role="group"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="header" onpointerdown={onHeaderPointerDown} onpointermove={onHeaderPointerMove} onpointerup={onHeaderPointerUp}>
		<span class="grip">⠿</span>
		<input
			class="name"
			value={box.name}
			placeholder="Name"
			onfocus={() => {
				editor.selected = { type: "box", id: box.id };
				editor.beginTextEdit(`name:${box.id}`);
			}}
			oninput={(e) => editor.renameBox(box.id, e.currentTarget.value)}
		/>
		<button
			class="handle"
			title="Drag to connect"
			aria-label="Create connector"
			onpointerdown={(e) => {
				e.stopPropagation();
				onconnectorstart(box.id, e);
			}}>↘</button
		>
	</div>

	<textarea
		class="desc"
		rows="1"
		value={box.description ?? ""}
		placeholder="Description…"
		use:autosize
		onfocus={() => {
			editor.selected = { type: "box", id: box.id };
			editor.beginTextEdit(`desc:${box.id}`);
		}}
		oninput={(e) => editor.setDescription(box.id, e.currentTarget.value)}
	></textarea>

	{#if box.fields.length}
		<div class="fields">
			{#each box.fields as f (f.id)}
				<div
					class="field"
					class:sel={editor.selected?.type === "field" && editor.selected.fieldId === f.id}
				>
					<input
						class="f-name"
						value={f.name}
						placeholder="name"
						onfocus={() => {
							editor.selected = { type: "field", boxId: box.id, fieldId: f.id };
							editor.beginTextEdit(`fn:${f.id}`);
						}}
						oninput={(e) => editor.updateField(box.id, f.id, { name: e.currentTarget.value })}
					/>
					<span class="colon">:</span>
					<input
						class="f-type"
						value={f.type}
						placeholder="type"
						onfocus={() => {
							editor.selected = { type: "field", boxId: box.id, fieldId: f.id };
							editor.beginTextEdit(`ft:${f.id}`);
						}}
						oninput={(e) => editor.updateField(box.id, f.id, { type: e.currentTarget.value })}
					/>
					<button class="x" aria-label="Delete field" onclick={() => editor.deleteField(box.id, f.id)}>×</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if box.comments.length}
		<div class="comments">
			{#each box.comments as c, i (i)}
				<div class="comment" class:sel={editor.selected?.type === "comment" && editor.selected.index === i && editor.selected.boxId === box.id}>
					<span class="c-mark">💬</span>
					<textarea
						rows="1"
						value={c}
						placeholder="comment…"
						use:autosize
						onfocus={() => {
							editor.selected = { type: "comment", boxId: box.id, index: i };
							editor.beginTextEdit(`c:${box.id}:${i}`);
						}}
						oninput={(e) => editor.updateComment(box.id, i, e.currentTarget.value)}
					></textarea>
					<button class="x" aria-label="Delete comment" onclick={() => editor.deleteComment(box.id, i)}>×</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="actions">
		<button onclick={() => editor.addField(box.id)} title="Add field (F)">+ field</button>
		<button onclick={() => editor.addComment(box.id)} title="Add comment (A)">+ comment</button>
	</div>
</div>

<style>
	.card {
		position: absolute;
		width: 230px;
		background: var(--card, #fff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 10px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04);
		display: flex;
		flex-direction: column;
		font-size: 13px;
		transition: box-shadow 0.12s, border-color 0.12s;
	}
	.card.selected {
		border-color: var(--ring, #18181b);
		box-shadow: 0 0 0 2px var(--ring, #18181b), 0 4px 12px rgb(0 0 0 / 0.1);
	}
	.card.linking {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px #6366f1;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 6px 4px;
		cursor: grab;
	}
	.grip {
		color: var(--muted-fg, #a1a1aa);
		font-size: 12px;
		cursor: grab;
		user-select: none;
	}
	.name {
		flex: 1;
		font-weight: 600;
		font-size: 14px;
		border: none;
		background: none;
		color: var(--fg, #18181b);
		padding: 2px 4px;
		border-radius: 4px;
		min-width: 0;
	}
	.name:focus {
		outline: none;
		background: var(--accent, #f4f4f5);
	}
	.handle {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 1px solid var(--border, #e4e4e7);
		background: var(--muted, #fafafa);
		color: var(--muted-fg, #71717a);
		cursor: crosshair;
		font-size: 11px;
		line-height: 1;
		padding: 0;
		flex-shrink: 0;
	}
	.handle:hover {
		background: #6366f1;
		color: #fff;
		border-color: #6366f1;
	}
	.desc {
		margin: 0 8px 6px;
		border: none;
		background: none;
		resize: none;
		font: inherit;
		font-size: 12px;
		color: var(--muted-fg, #52525b);
		padding: 3px 4px;
		border-radius: 4px;
		overflow: hidden;
	}
	.desc:focus {
		outline: none;
		background: var(--accent, #f4f4f5);
	}
	.fields {
		border-top: 1px solid var(--border, #f1f1f3);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: 5px;
		padding: 1px 2px;
	}
	.field.sel,
	.comment.sel {
		background: var(--accent, #eef2ff);
	}
	.f-name,
	.f-type {
		border: none;
		background: none;
		font: inherit;
		font-size: 12px;
		padding: 3px 4px;
		border-radius: 4px;
		min-width: 0;
	}
	.f-name {
		flex: 1;
		color: var(--fg, #18181b);
		font-weight: 500;
	}
	.f-type {
		flex: 1;
		color: #7c3aed;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}
	.f-name:focus,
	.f-type:focus {
		outline: none;
		background: #fff;
		box-shadow: inset 0 0 0 1px var(--border, #e4e4e7);
	}
	.colon {
		color: var(--muted-fg, #a1a1aa);
	}
	.comments {
		border-top: 1px solid var(--border, #f1f1f3);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.comment {
		display: flex;
		align-items: flex-start;
		gap: 4px;
		border-radius: 5px;
		padding: 2px;
	}
	.c-mark {
		font-size: 11px;
		padding-top: 3px;
	}
	.comment textarea {
		flex: 1;
		border: none;
		background: none;
		resize: none;
		font: inherit;
		font-size: 12px;
		color: #b45309;
		padding: 2px 3px;
		border-radius: 4px;
		overflow: hidden;
		min-width: 0;
	}
	.comment textarea:focus {
		outline: none;
		background: #fffbeb;
	}
	.x {
		border: none;
		background: none;
		color: var(--muted-fg, #c4c4cc);
		cursor: pointer;
		font-size: 15px;
		line-height: 1;
		padding: 0 3px;
		flex-shrink: 0;
	}
	.x:hover {
		color: #dc2626;
	}
	.actions {
		display: flex;
		gap: 4px;
		padding: 5px 8px 8px;
		border-top: 1px solid var(--border, #f1f1f3);
	}
	.actions button {
		font: inherit;
		font-size: 11px;
		color: var(--muted-fg, #71717a);
		background: var(--muted, #fafafa);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 5px;
		padding: 3px 8px;
		cursor: pointer;
	}
	.actions button:hover {
		background: var(--accent, #f4f4f5);
		color: var(--fg, #18181b);
	}
</style>
