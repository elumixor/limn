<script lang="ts">
	export interface MenuItem {
		label: string;
		hint?: string;
		danger?: boolean;
		action: () => void;
	}

	let {
		x,
		y,
		items,
		onclose,
	}: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();

	let el: HTMLDivElement | undefined = $state();

	// Keep the menu inside the viewport.
	let pos = $derived.by(() => {
		const w = 200;
		const h = items.length * 34 + 10;
		return {
			left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - w - 8),
			top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - h - 8),
		};
	});
</script>

<svelte:window
	onpointerdown={(e) => {
		if (el && !el.contains(e.target as Node)) onclose();
	}}
	onkeydown={(e) => e.key === "Escape" && onclose()}
/>

<div bind:this={el} class="menu" style="left:{pos.left}px; top:{pos.top}px" role="menu">
	{#each items as item, i (i)}
		<button
			class="item"
			class:danger={item.danger}
			role="menuitem"
			onclick={() => {
				item.action();
				onclose();
			}}
		>
			<span>{item.label}</span>
			{#if item.hint}<kbd>{item.hint}</kbd>{/if}
		</button>
	{/each}
</div>

<style>
	.menu {
		position: fixed;
		z-index: 1000;
		min-width: 190px;
		padding: 4px;
		background: var(--popover, #ffffff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 8px;
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
		font-size: 13px;
	}
	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		gap: 12px;
		padding: 7px 9px;
		border: none;
		border-radius: 5px;
		background: none;
		color: var(--fg, #18181b);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}
	.item:hover {
		background: var(--accent, #f4f4f5);
	}
	.item.danger {
		color: #dc2626;
	}
	.item.danger:hover {
		background: #fef2f2;
	}
	kbd {
		font-family: ui-monospace, monospace;
		font-size: 11px;
		color: var(--muted-fg, #71717a);
		background: var(--muted, #f4f4f5);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 4px;
		padding: 1px 5px;
	}
</style>
