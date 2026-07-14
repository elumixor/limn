<script lang="ts">
	import { type Block, type Connector, walk } from "../diagram";
	import { editor } from "./store.svelte";
	import BlockView from "./BlockView.svelte";
	import CommentBubble from "./CommentBubble.svelte";
	import ContextMenu from "./ContextMenu.svelte";
	import { CanvasController } from "./canvas-controller.svelte";
	import { anchorDir, anchorPoint, CARDINALS, curve, curveMid, handlePoint, pickCardinal, resizeCursor, resizeZones } from "./geometry";

	let viewport: HTMLDivElement | undefined = $state();
	const ctl = new CanvasController(() => viewport);

	/** Blocks that have comments (at any depth) — each gets a floating bubble. */
	function commentedBlocks(): Block[] {
		const out: Block[] = [];
		walk(editor.diagram.blocks, (b) => {
			if (b.comments.length) out.push(b);
		});
		return out;
	}
	/** Resolved bubble offset for a block (its stored `commentPos`, else just below it). */
	function bubbleOffset(b: Block, rectH: number): { x: number; y: number } {
		return b.commentPos ?? { x: 0, y: rectH + 10 };
	}

	function autofocusBtn(node: HTMLButtonElement) {
		requestAnimationFrame(() => node.focus());
	}

	/** Focus (and select) the connector label input when it enters edit mode. */
	function focusWhenEditing(node: HTMLInputElement, editing: boolean) {
		let raf = 0;
		let was = false;
		const focus = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				node.focus();
				node.select();
			});
		};
		if (editing) {
			was = true;
			focus();
		}
		return {
			update(next: boolean) {
				if (next && !was) focus(); // only on the false→true transition
				else if (!next) cancelAnimationFrame(raf); // entering blur: don't re-grab focus
				was = next;
			},
			destroy() {
				cancelAnimationFrame(raf);
			},
		};
	}
</script>

<svelte:window onpointermove={ctl.onWindowPointerMove} onpointerup={ctl.onWindowPointerUp} />

<!-- A connector's clickable hit-area + visible line. Rendered behind blocks for
     root↔root connectors, but on top for any connector touching a nested block
     so it isn't swallowed by the parent box it emerges from. -->
{#snippet edge(c: Connector)}
	{@const d = curve(ctl.geo(c))}
	{@const sel = editor.selectedConnector === c.id}
	<path
		class="edge-hit"
		{d}
		onpointerdown={(e) => {
			e.stopPropagation();
			editor.selectConnector(c.id);
		}}
		ondblclick={(e) => {
			e.stopPropagation();
			editor.selectConnector(c.id);
			editor.editing = { id: c.id, part: "connector" };
		}}
		oncontextmenu={(e) => ctl.onConnectorContextMenu(c.id, e)}
		role="button"
		tabindex="-1"
	/>
	<path {d} stroke={sel ? "#6366f1" : "#a1a1aa"} stroke-width={sel ? 2.5 : 1.5} fill="none" />
{/snippet}

<!-- Arrowhead(s), always drawn on top of blocks so they stay visible. -->
{#snippet arrowhead(c: Connector)}
	{#if c.kind !== "line"}
		{@const d = curve(ctl.geo(c))}
		{@const sel = editor.selectedConnector === c.id}
		<path
			{d}
			stroke="transparent"
			fill="none"
			marker-end={`url(#${sel ? "ah-sel" : "ah"})`}
			marker-start={c.kind === "double" ? `url(#${sel ? "ah-sel" : "ah"})` : undefined}
		/>
	{/if}
{/snippet}

<div
	bind:this={viewport}
	class="viewport"
	class:panning={!!ctl.panning}
	role="application"
	tabindex="-1"
	onpointerdown={ctl.onPointerDown}
	ondblclick={ctl.onDoubleClick}
	oncontextmenu={ctl.onContextMenu}
	onwheel={ctl.onWheel}
>
	<div class="content" style="transform: translate({editor.pan.x}px, {editor.pan.y}px)">
		<svg class="edges">
			<defs>
				<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill="#a1a1aa" />
				</marker>
				<marker id="ah-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
				</marker>
			</defs>
			{#each editor.diagram.connectors as c (c.id)}
				{#if editor.isRoot(c.source) && editor.isRoot(c.target)}
					{@render edge(c)}
				{/if}
			{/each}
			{#if ctl.linking && editor.pendingConnector}
				{@const a = ctl.canvasRect(editor.pendingConnector)}
				{@const sa = editor.pendingAnchor ?? pickCardinal(a, ctl.linking)}
				{@const p1 = anchorPoint(a, sa)}
				{@const dl = curve({ p1, p2: ctl.linking, d1: anchorDir(sa), d2: { x: 0, y: 0 } })}
				<path d={dl} stroke="#6366f1" stroke-width="1.5" stroke-dasharray="4 4" fill="none" />
			{/if}
		</svg>

		{#each editor.diagram.connectors as c (c.id)}
			{@const m = curveMid(ctl.geo(c))}
			{@const mx = m.x}
			{@const my = m.y}
			{@const sel = editor.selectedConnector === c.id}
			{#if c.description || (editor.editing?.id === c.id && editor.editing.part === "connector")}
				<input
					class="conn-desc"
					class:sel
					style="left:{mx}px; top:{my}px"
					value={c.description ?? ""}
					placeholder="describe…"
					use:focusWhenEditing={editor.editing?.id === c.id && editor.editing.part === "connector"}
					onpointerdown={(e) => e.stopPropagation()}
					oncontextmenu={(e) => ctl.onConnectorContextMenu(c.id, e)}
					onkeydown={(e) => {
						if (e.key === "Enter" || e.key === "Escape") {
							e.preventDefault();
							e.currentTarget.blur();
							editor.editing = null;
						}
					}}
					onfocus={() => {
						editor.selectConnector(c.id);
						editor.beginTextEdit(`cd:${c.id}`);
					}}
					oninput={(e) => editor.setConnectorDescription(c.id, e.currentTarget.value)}
				/>
			{/if}
		{/each}

		{#each editor.diagram.blocks as block (block.id)}
			<BlockView {block} root />
		{/each}

		<!-- Top layer above blocks: arrowheads for every connector, plus the full
		     line for connectors touching a nested block (so it shows in front of the
		     parent instead of being hidden behind it). -->
		<svg class="edges edges-top">
			{#each editor.diagram.connectors as c (c.id)}
				{#if !(editor.isRoot(c.source) && editor.isRoot(c.target))}
					{@render edge(c)}
				{/if}
				{@render arrowhead(c)}
			{/each}
		</svg>

		<!-- Comment bubbles: each commented block's notes float beside it. -->
		{#each commentedBlocks() as b (b.id)}
			{@const r = ctl.canvasRect(b.id)}
			{@const off = bubbleOffset(b, r.h)}
			<CommentBubble block={b} left={r.x + off.x} top={r.y + off.y} offset={off} />
		{/each}

		<!-- Ghost of the "exposes" panel being grown out of a block's side. -->
		{#if ctl.exposeDrag}
			{@const r = ctl.exposeDrag.rect}
			<div class="expose-ghost" style="left:{r.x}px; top:{r.y}px; width:{r.w}px; height:{r.h}px">exposes</div>
		{/if}

		<!-- Draggable endpoints of the selected connector -->
		{#if editor.selectedConnector}
			{@const c = editor.connector(editor.selectedConnector)}
			{#if c}
				{@const g = ctl.geo(c)}
				<div
					class="endpoint"
					class:active={ctl.endDrag?.id === c.id && ctl.endDrag?.end === "source"}
					style="left:{g.p1.x}px; top:{g.p1.y}px"
					role="button"
					tabindex="-1"
					aria-label="Connector start"
					onpointerdown={(e) => ctl.onEndpointDown(c.id, "source", e)}
				></div>
				<div
					class="endpoint"
					class:active={ctl.endDrag?.id === c.id && ctl.endDrag?.end === "target"}
					style="left:{g.p2.x}px; top:{g.p2.y}px"
					role="button"
					tabindex="-1"
					aria-label="Connector end"
					onpointerdown={(e) => ctl.onEndpointDown(c.id, "target", e)}
				></div>
			{/if}
		{/if}

		<!-- Invisible resize zones along the hovered block's edges & corners -->
		{#if ctl.hover && !ctl.endDrag && !editor.pendingConnector && !ctl.drag && !ctl.resizing}
			{@const rid = ctl.hover.id}
			{#each resizeZones(ctl.canvasRect(rid)) as z (z.dir)}
				<div
					class="resize-zone"
					style="left:{z.left}px; top:{z.top}px; width:{z.width}px; height:{z.height}px; cursor:{resizeCursor(z.dir)}"
					role="button"
					tabindex="-1"
					aria-label="Resize block"
					onpointerdown={(e) => ctl.onResizeDown(e, rid, z.dir)}
				></div>
			{/each}
		{/if}

		<!-- The 4 cardinal connection handles, shown while hovering any block -->
		{#if ctl.hover && !ctl.endDrag && !editor.pendingConnector && !ctl.drag && !ctl.resizing}
			{@const hid = ctl.hover.id}
			{@const hr = ctl.canvasRect(hid)}
			{#each CARDINALS as c (c.key)}
				{@const p = handlePoint(hr, c)}
				<div
					class="spawn"
					style="left:{p.x}px; top:{p.y}px"
					role="button"
					tabindex="-1"
					aria-label="Drag to connect"
					title="Drag to connect"
					onpointerdown={(e) => ctl.onHandleDown(e, hid, c.anchor)}
				></div>
			{/each}
		{/if}

		<!-- In-place "create a block here" prompt after dropping on empty space -->
		{#if ctl.addPrompt}
			<button
				class="add-prompt"
				style="left:{ctl.addPrompt.x}px; top:{ctl.addPrompt.y}px"
				title="Create a block here"
				use:autofocusBtn
				onclick={ctl.confirmAddPrompt}
				onpointerleave={ctl.cancelAddPrompt}
				onblur={ctl.cancelAddPrompt}
				onkeydown={(e) => e.key === "Escape" && ctl.cancelAddPrompt()}
			>+ New block</button>
		{/if}
	</div>

	{#if ctl.marquee}
		<div
			class="marquee"
			style="left:{Math.min(ctl.marquee.x0, ctl.marquee.x1)}px; top:{Math.min(ctl.marquee.y0, ctl.marquee.y1)}px; width:{Math.abs(
				ctl.marquee.x1 - ctl.marquee.x0,
			)}px; height:{Math.abs(ctl.marquee.y1 - ctl.marquee.y0)}px"
		></div>
	{/if}

	{#if !editor.diagram.blocks.length}
		<div class="empty"><p>Press <kbd>N</kbd> or right-click to add a box.</p></div>
	{/if}
</div>

{#if ctl.menu}
	<ContextMenu x={ctl.menu.x} y={ctl.menu.y} items={ctl.menu.items} onclose={ctl.closeMenu} />
{/if}

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
	.edges {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		width: 1px;
		height: 1px;
		pointer-events: none;
	}
	.edge-hit {
		stroke: transparent;
		stroke-width: 12;
		fill: none;
		pointer-events: stroke;
		cursor: pointer;
		outline: none;
	}
	.conn-desc {
		position: absolute;
		/* Above the `edges-top` layer (which draws nested-connector lines over blocks)
		   so the label's opaque background isn't overdrawn by its own arrow. */
		z-index: 4;
		transform: translate(-50%, -50%);
		/* Size the box to its text (with a floor so the placeholder fits) instead of
		   a fixed width, so the background hugs the label. */
		field-sizing: content;
		min-width: 60px;
		max-width: 220px;
		text-align: center;
		font-size: 11px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 6px;
		background: var(--card, #fff);
		color: var(--fg, #3f3f46);
		padding: 3px 5px;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
		outline: none;
	}
	.conn-desc:focus,
	.conn-desc.sel {
		border-color: #6366f1;
	}
	.spawn {
		position: absolute;
		width: 12px;
		height: 12px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: #6366f1;
		border: 2px solid var(--card, #fff);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
		cursor: crosshair;
		outline: none;
		z-index: 5;
	}
	.resize-zone {
		position: absolute;
		background: transparent;
		outline: none;
		z-index: 6;
	}
	.endpoint {
		position: absolute;
		width: 11px;
		height: 11px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: var(--card, #fff);
		border: 2px solid #6366f1;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
		cursor: grab;
		outline: none;
		z-index: 6;
	}
	.endpoint:hover,
	.endpoint.active {
		background: #6366f1;
		cursor: grabbing;
	}
	.add-prompt {
		position: absolute;
		transform: translate(-50%, -50%);
		white-space: nowrap;
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 7px;
		border: 1px solid #6366f1;
		background: var(--card, #fff);
		color: #6366f1;
		cursor: pointer;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
		z-index: 7;
	}
	.add-prompt:hover {
		background: #6366f1;
		color: #fff;
	}
	.expose-ghost {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		border: 1.5px dashed #db2777;
		border-radius: 9px;
		background: rgb(219 39 119 / 0.06);
		color: #db2777;
		font-size: 13px;
		font-weight: 600;
		pointer-events: none;
		z-index: 5;
	}
	.marquee {
		position: absolute;
		background: rgb(99 102 241 / 0.1);
		border: 1px solid #6366f1;
		border-radius: 2px;
		pointer-events: none;
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
	.empty kbd {
		font-family: ui-monospace, monospace;
		background: var(--muted, #f4f4f5);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 12px;
	}
</style>
