<script lang="ts">
	import { editor } from "./store.svelte";

	// A translucent overlay stretched across the split. It draws the component→UI
	// mapping links by reading the live on-screen rects of the two panes' DOM
	// nodes each frame — the two canvases pan independently, so there is no shared
	// coordinate space to compute this from; the DOM is the single source of truth.
	let overlay: HTMLDivElement | undefined = $state();

	type Link = { id: string; x1: number; y1: number; x2: number; y2: number; sel: boolean; mid: { x: number; y: number } };
	let links = $state<Link[]>([]);
	/** Start handle for the selected component (right edge), or null. */
	let handle = $state<{ x: number; y: number } | null>(null);
	/** Live pointer position while a link is being dragged (overlay-local). */
	let pointer = $state<{ x: number; y: number } | null>(null);

	function rectOf(selector: string): DOMRect | null {
		return (document.querySelector(selector) as HTMLElement | null)?.getBoundingClientRect() ?? null;
	}

	function path(x1: number, y1: number, x2: number, y2: number): string {
		const dx = Math.max(40, Math.abs(x2 - x1) / 2);
		return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
	}

	// Recompute geometry every frame while the split is shown. Cheap (a handful of
	// getBoundingClientRect reads) and always correct through pan/drag/resize.
	$effect(() => {
		if (!editor.isSplit) {
			links = [];
			handle = null;
			return;
		}
		let raf = 0;
		const tick = () => {
			const o = overlay?.getBoundingClientRect();
			if (o) {
				const next: Link[] = [];
				for (const m of editor.diagram.mappings) {
					const b = rectOf(`[data-block-id="${CSS.escape(m.blockId)}"]`);
					const e = rectOf(`[data-ui-id="${CSS.escape(m.elementId)}"]`);
					if (!b || !e) continue;
					const x1 = b.right - o.left;
					const y1 = b.top + b.height / 2 - o.top;
					const x2 = e.left - o.left;
					const y2 = e.top + e.height / 2 - o.top;
					next.push({ id: m.id, x1, y1, x2, y2, sel: editor.selectedMapping === m.id, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } });
				}
				links = next;

				const sel = editor.selectedBlock;
				const selRoot = sel && editor.isRoot(sel.id) ? rectOf(`[data-block-id="${CSS.escape(sel.id)}"]`) : null;
				handle = selRoot ? { x: selRoot.right - o.left, y: selRoot.top + selRoot.height / 2 - o.top } : null;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});

	function onHandleDown(e: PointerEvent) {
		e.stopPropagation();
		e.preventDefault();
		const sel = editor.selectedBlock;
		if (!sel) return;
		editor.startMapping(sel.id);
		const o = overlay?.getBoundingClientRect();
		pointer = o ? { x: e.clientX - o.left, y: e.clientY - o.top } : null;
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (!editor.pendingMap) return;
		const o = overlay?.getBoundingClientRect();
		pointer = o ? { x: e.clientX - o.left, y: e.clientY - o.top } : null;
	}

	function onWindowPointerUp(e: PointerEvent) {
		if (!editor.pendingMap) return;
		const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const el = target?.closest("[data-ui-id]") as HTMLElement | null;
		if (el?.dataset.uiId) editor.completeMapping(el.dataset.uiId);
		else editor.cancelMapping();
		pointer = null;
	}
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<div bind:this={overlay} class="overlay">
	<svg class="lines">
		<defs>
			<marker id="map-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
				<circle cx="5" cy="5" r="4" fill="#6366f1" />
			</marker>
		</defs>
		{#each links as l (l.id)}
			<path
				class="hit"
				d={path(l.x1, l.y1, l.x2, l.y2)}
				role="button"
				tabindex="-1"
				aria-label="Mapping link"
				onpointerdown={(e) => {
					e.stopPropagation();
					editor.selectMapping(l.id);
				}}
			/>
			<path
				class="link"
				class:sel={l.sel}
				d={path(l.x1, l.y1, l.x2, l.y2)}
				marker-start="url(#map-dot)"
				marker-end="url(#map-dot)"
			/>
		{/each}
		{#if editor.pendingMap && handle && pointer}
			<path class="link pending" d={path(handle.x, handle.y, pointer.x, pointer.y)} marker-start="url(#map-dot)" />
		{/if}
	</svg>

	{#each links as l (l.id)}
		{#if l.sel}
			<button
				class="del"
				style="left:{l.mid.x}px; top:{l.mid.y}px"
				aria-label="Delete mapping"
				title="Delete mapping"
				onpointerdown={(e) => e.stopPropagation()}
				onclick={() => editor.deleteMapping(l.id)}>×</button
			>
		{/if}
	{/each}

	{#if handle && !editor.pendingMap}
		<button
			class="handle"
			style="left:{handle.x}px; top:{handle.y}px"
			aria-label="Drag to map this component to a UI frame"
			title="Drag to map to a UI frame"
			onpointerdown={onHandleDown}
		></button>
	{/if}
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 20;
	}
	.lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.link {
		fill: none;
		stroke: #a5b4fc;
		stroke-width: 2;
		stroke-dasharray: 5 4;
	}
	.link.sel {
		stroke: #6366f1;
		stroke-width: 2.5;
	}
	.link.pending {
		stroke: #6366f1;
	}
	.hit {
		fill: none;
		stroke: transparent;
		stroke-width: 14;
		pointer-events: stroke;
		cursor: pointer;
	}
	.handle {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #6366f1;
		border: 2px solid var(--card, #fff);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
		cursor: crosshair;
		pointer-events: auto;
		padding: 0;
	}
	.del {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1px solid var(--border, #e4e4e7);
		background: var(--card, #fff);
		color: #dc2626;
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
	}
</style>
