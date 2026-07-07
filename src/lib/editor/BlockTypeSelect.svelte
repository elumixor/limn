<script lang="ts">
	import { type Block, BLOCK_TYPES, type BlockType, DEFAULT_BLOCK_TYPE } from "../diagram";
	import { BLOCK_TYPE_META } from "./block-types";
	import BlockTypeIcon from "./BlockTypeIcon.svelte";
	import { editor } from "./store.svelte";

	let { block }: { block: Block } = $props();

	const current = $derived(block.type ?? DEFAULT_BLOCK_TYPE);
	const meta = $derived(BLOCK_TYPE_META[current]);

	let open = $state(false);
	let btn = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	// Fixed-position popover coords: the block clips its overflow, so the menu is
	// positioned in viewport space from the button rect (same trick as ContextMenu).
	let pos = $state({ left: 0, top: 0 });

	function toggle() {
		if (open) {
			open = false;
			return;
		}
		const r = btn!.getBoundingClientRect();
		const w = 176;
		const h = BLOCK_TYPES.length * 34 + 8;
		pos = {
			left: Math.min(r.left, window.innerWidth - w - 8),
			top: Math.min(r.bottom + 4, window.innerHeight - h - 8),
		};
		open = true;
	}

	function choose(t: BlockType) {
		editor.setBlockType(block.id, t);
		open = false;
	}
</script>

<svelte:window
	onpointerdown={(e) => {
		if (open && !btn?.contains(e.target as Node) && !menu?.contains(e.target as Node)) open = false;
	}}
	onkeydown={(e) => e.key === "Escape" && open && (open = false)}
/>

<button
	bind:this={btn}
	class="type-btn"
	title="Block type"
	aria-haspopup="listbox"
	aria-expanded={open}
	style="color:{meta.color}"
	onpointerdown={(e) => e.stopPropagation()}
	onclick={(e) => {
		e.stopPropagation();
		toggle();
	}}
>
	<BlockTypeIcon icon={meta.icon} size={12} />
	<span class="type-label">{meta.label}</span>
</button>

{#if open}
	<div bind:this={menu} class="type-menu" style="left:{pos.left}px; top:{pos.top}px" role="listbox">
		{#each BLOCK_TYPES as t (t)}
			{@const m = BLOCK_TYPE_META[t]}
			<button
				class="type-option"
				class:selected={t === current}
				role="option"
				aria-selected={t === current}
				onpointerdown={(e) => e.stopPropagation()}
				onclick={(e) => {
					e.stopPropagation();
					choose(t);
				}}
			>
				<span class="opt-icon" style="color:{m.color}"><BlockTypeIcon icon={m.icon} size={13} /></span>
				<span class="opt-label">{m.label}</span>
				{#if t === current}<span class="check" aria-hidden="true">✓</span>{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.type-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		max-width: 120px;
		padding: 2px 6px 2px 4px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: none;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
		user-select: none;
	}
	.type-btn:hover {
		background: var(--accent, #f4f4f5);
		border-color: var(--border, #e4e4e7);
	}
	.type-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.type-menu {
		position: fixed;
		z-index: 1000;
		min-width: 176px;
		padding: 4px;
		background: var(--popover, #ffffff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 8px;
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
	}
	.type-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 8px;
		border: none;
		border-radius: 5px;
		background: none;
		color: var(--fg, #18181b);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.type-option:hover {
		background: var(--accent, #f4f4f5);
	}
	.type-option.selected {
		font-weight: 600;
	}
	.opt-icon {
		display: inline-flex;
	}
	.opt-label {
		flex: 1;
	}
	.check {
		color: var(--muted-fg, #71717a);
		font-size: 12px;
	}
</style>
