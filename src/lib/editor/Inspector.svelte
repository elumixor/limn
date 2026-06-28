<script lang="ts">
	import type { ComponentNode, ModelNode, ScreenNode, EdgeKind } from "../diagram";
	import { editor } from "./store.svelte";

	const node = $derived(editor.selectedNode);
	const edge = $derived(editor.selectedEdge);

	function addProp(c: ComponentNode) {
		c.props.push({ name: "prop", type: "string" });
	}
	function addState(c: ComponentNode) {
		c.state.push({ name: "value", type: "number", initial: "0" });
	}
	function addField(m: ModelNode) {
		m.fields.push({ name: "field", type: "string" });
	}
</script>

<div class="inspector">
	{#if node}
		<header>
			<span class="badge {node.kind}">{node.kind}</span>
			<button class="del" onclick={() => editor.deleteNode(node.id)}>Delete</button>
		</header>

		<label>Name <input bind:value={node.name} /></label>

		{#if node.kind === "screen"}
			<label>Route <input bind:value={(node as ScreenNode).route} placeholder="/path" /></label>
		{/if}

		<label>Annotation (intent)
			<textarea bind:value={node.annotation} rows="2" placeholder="Free-text intent…"></textarea>
		</label>

		{#if node.kind === "component"}
			{@const c = node as ComponentNode}
			<section>
				<div class="sec-head"><h4>Props</h4><button onclick={() => addProp(c)}>+</button></div>
				{#each c.props as p, i (i)}
					<div class="field-row">
						<input class="fname" bind:value={p.name} placeholder="name" />
						<input class="ftype" bind:value={p.type} placeholder="type" />
						<label class="opt"><input type="checkbox" bind:checked={p.optional} />?</label>
						<button class="x" onclick={() => (c.props = c.props.filter((_, j) => j !== i))}>×</button>
					</div>
				{/each}
			</section>
			<section>
				<div class="sec-head"><h4>State</h4><button onclick={() => addState(c)}>+</button></div>
				{#each c.state as s, i (i)}
					<div class="field-row">
						<input class="fname" bind:value={s.name} placeholder="name" />
						<input class="ftype" bind:value={s.type} placeholder="type" />
						<input class="finit" bind:value={s.initial} placeholder="init" />
						<button class="x" onclick={() => (c.state = c.state.filter((_, j) => j !== i))}>×</button>
					</div>
				{/each}
			</section>
		{/if}

		{#if node.kind === "model"}
			{@const m = node as ModelNode}
			<section>
				<div class="sec-head"><h4>Fields</h4><button onclick={() => addField(m)}>+</button></div>
				{#each m.fields as f, i (i)}
					<div class="field-row">
						<input class="fname" bind:value={f.name} placeholder="name" />
						<input class="ftype" bind:value={f.type} placeholder="type" />
						<label class="opt"><input type="checkbox" bind:checked={f.optional} />?</label>
						<button class="x" onclick={() => (m.fields = m.fields.filter((_, j) => j !== i))}>×</button>
					</div>
				{/each}
			</section>
		{/if}
	{:else if edge}
		<header>
			<span class="badge edge">{edge.kind} edge</span>
			<button class="del" onclick={() => editor.deleteEdge(edge.id)}>Delete</button>
		</header>

		<label>Type
			<select
				value={edge.kind}
				onchange={(e) => {
					const kind = (e.currentTarget as HTMLSelectElement).value as EdgeKind;
					const { source, target } = edge;
					editor.deleteEdge(edge.id);
					editor.addEdge(kind, source, target);
				}}
			>
				<option value="render">render</option>
				<option value="event">event</option>
				<option value="data">data</option>
			</select>
		</label>

		{#if edge.kind === "event"}
			<label>Event <input bind:value={edge.event} placeholder="click" /></label>
			<label>Handler <input bind:value={edge.handler} placeholder="onClick" /></label>
		{/if}
		{#if edge.kind === "data"}
			<label>Field <input bind:value={edge.field} placeholder="todos" /></label>
		{/if}

		<label>Annotation
			<textarea bind:value={edge.annotation} rows="2"></textarea>
		</label>
	{:else}
		<p class="empty">Select a node or edge to edit it.</p>
	{/if}
</div>

<style>
	.inspector {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
		height: 100%;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.badge {
		font-size: 11px;
		text-transform: uppercase;
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 4px;
		color: white;
	}
	.badge.component { background: #6366f1; }
	.badge.screen { background: #0ea5e9; }
	.badge.model { background: #10b981; }
	.badge.edge { background: #64748b; }
	.del {
		font-size: 12px;
		color: #dc2626;
		background: none;
		border: 1px solid #fca5a5;
		border-radius: 4px;
		padding: 2px 8px;
		cursor: pointer;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 12px;
		font-weight: 600;
		color: #475569;
	}
	input, textarea, select {
		font: inherit;
		font-size: 13px;
		font-weight: 400;
		padding: 5px 7px;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		width: 100%;
		box-sizing: border-box;
	}
	section { border-top: 1px solid #e2e8f0; padding-top: 8px; }
	.sec-head { display: flex; justify-content: space-between; align-items: center; }
	.sec-head h4 { margin: 0; font-size: 13px; color: #334155; }
	.sec-head button {
		width: 22px; height: 22px; border-radius: 4px;
		border: 1px solid #cbd5e1; background: #f1f5f9; cursor: pointer; font-size: 14px;
	}
	.field-row { display: flex; gap: 4px; align-items: center; margin-top: 5px; }
	.fname { flex: 1; }
	.ftype { flex: 1; }
	.finit { width: 56px; }
	.opt { flex-direction: row; align-items: center; gap: 1px; font-size: 11px; }
	.opt input { width: auto; }
	.x {
		border: none; background: none; color: #94a3b8; cursor: pointer; font-size: 16px; padding: 0 2px;
	}
	.empty { color: #94a3b8; font-size: 13px; text-align: center; margin-top: 40px; }
</style>
