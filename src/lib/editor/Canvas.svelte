<script lang="ts">
	import type { DiagramEdge, DiagramNode } from "../diagram";
	import { editor } from "./store.svelte";

	const NODE_W = 160;
	const NODE_H = 64;

	let dragging: { id: string; dx: number; dy: number } | null = null;

	function center(n: DiagramNode) {
		return { x: (n.x ?? 0) + NODE_W / 2, y: (n.y ?? 0) + NODE_H / 2 };
	}

	function nodeById(id: string) {
		return editor.diagram.nodes.find((n) => n.id === id);
	}

	function edgePath(e: DiagramEdge): string {
		const s = nodeById(e.source);
		const t = nodeById(e.target);
		if (!s || !t) return "";
		const a = center(s);
		const b = center(t);
		return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
	}

	function edgeMid(e: DiagramEdge) {
		const s = nodeById(e.source);
		const t = nodeById(e.target);
		if (!s || !t) return { x: 0, y: 0 };
		const a = center(s);
		const b = center(t);
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	}

	function onPointerDown(e: PointerEvent, node: DiagramNode) {
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		editor.selectedId = node.id;
		if (editor.connectFrom) {
			editor.connect(node.id);
			return;
		}
		dragging = { id: node.id, dx: e.clientX - (node.x ?? 0), dy: e.clientY - (node.y ?? 0) };
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		editor.moveNode(dragging.id, e.clientX - dragging.dx, e.clientY - dragging.dy);
	}

	function onPointerUp() {
		dragging = null;
	}

	const edgeColor: Record<string, string> = {
		render: "#6366f1",
		event: "#f59e0b",
		data: "#10b981",
	};
	const kindColor: Record<string, string> = {
		component: "#6366f1",
		screen: "#0ea5e9",
		model: "#10b981",
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="canvas"
	role="application"
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onclick={(e) => {
		if (e.target === e.currentTarget) {
			editor.selectedId = null;
			editor.connectFrom = null;
		}
	}}
>
	<svg class="edges">
		<defs>
			{#each Object.entries(edgeColor) as [kind, color] (kind)}
				<marker id="arrow-{kind}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
				</marker>
			{/each}
		</defs>
		{#each editor.diagram.edges as e (e.id)}
			<path
				d={edgePath(e)}
				stroke={edgeColor[e.kind]}
				stroke-width={editor.selectedId === e.id ? 3 : 1.5}
				fill="none"
				marker-end="url(#arrow-{e.kind})"
			/>
			{@const m = edgeMid(e)}
			<g
				role="button"
				tabindex="-1"
				class="edge-label"
				onclick={() => (editor.selectedId = e.id)}
				onkeydown={() => {}}
			>
				<rect x={m.x - 26} y={m.y - 10} width="52" height="18" rx="4" fill="white" stroke={edgeColor[e.kind]} />
				<text x={m.x} y={m.y + 3} text-anchor="middle" font-size="10" fill={edgeColor[e.kind]}>{e.kind}</text>
			</g>
		{/each}
	</svg>

	{#each editor.diagram.nodes as node (node.id)}
		<div
			class="node"
			class:selected={editor.selectedId === node.id}
			class:connect-source={editor.connectFrom === node.id}
			style="left:{node.x ?? 0}px; top:{node.y ?? 0}px; width:{NODE_W}px; height:{NODE_H}px; border-color:{kindColor[node.kind]}"
			role="button"
			tabindex="0"
			onpointerdown={(e) => onPointerDown(e, node)}
			onkeydown={() => {}}
		>
			<span class="kind" style="color:{kindColor[node.kind]}">{node.kind}</span>
			<span class="name">{node.name}</span>
		</div>
	{/each}

	{#if editor.connectFrom}
		<div class="hint">Click a target node to draw an edge (Esc to cancel)</div>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") editor.connectFrom = null;
	}}
/>

<style>
	.canvas {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: auto;
		background:
			radial-gradient(circle, #e2e8f0 1px, transparent 1px) 0 0 / 20px 20px;
		background-color: #f8fafc;
	}
	.edges {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.edge-label {
		pointer-events: auto;
		cursor: pointer;
	}
	.node {
		position: absolute;
		background: white;
		border: 2px solid;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 6px 10px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: grab;
		user-select: none;
	}
	.node.selected {
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.4);
	}
	.node.connect-source {
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.6);
	}
	.kind {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}
	.name {
		font-size: 14px;
		font-weight: 600;
		color: #1e293b;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		background: #1e293b;
		color: white;
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		z-index: 10;
	}
</style>
