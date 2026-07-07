<script lang="ts">
	import { editor } from "./store.svelte";
</script>

<div class="switcher" role="group" aria-label="View">
	<button
		class:active={editor.panes.components}
		aria-pressed={editor.panes.components}
		onclick={() => editor.togglePane("components")}>Components</button
	>
	<button class:active={editor.panes.ui} aria-pressed={editor.panes.ui} onclick={() => editor.togglePane("ui")}>UI</button>
</div>

<style>
	.switcher {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--card, #fff);
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 11px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
	}
	.switcher button {
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		padding: 6px 16px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--muted-fg, #71717a);
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.switcher button:hover {
		background: var(--accent, #f4f4f5);
	}
	.switcher button.active {
		background: var(--ring, #18181b);
		color: #fff;
	}
</style>
