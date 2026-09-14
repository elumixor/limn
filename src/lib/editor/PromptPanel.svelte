<script lang="ts">
	import { editor } from "./store.svelte";

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		await navigator.clipboard.writeText(editor.result.prompt);
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1500);
	}

	const label = $derived(editor.result.noChange ? "No changes" : editor.result.fromScratch ? "From scratch" : "Patch");
</script>

<aside class="panel">
	<header>
		<div class="heading">
			<strong>Prompt</strong>
			<span class="tag" class:scratch={editor.result.fromScratch} class:none={editor.result.noChange}>{label}</span>
		</div>
		<div class="actions">
			<button
				title="Mark this diagram as built. Later prompts describe only what changed."
				onclick={() => editor.commitAnchor()}
				disabled={editor.result.noChange}>Mark as built</button
			>
			{#if !editor.result.fromScratch}
				<button title="Forget the baseline; the prompt becomes a full build again." onclick={() => editor.resetAnchor()}>Reset</button>
			{/if}
			<button class="primary" onclick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
			<button class="close" aria-label="Close prompt panel" onclick={() => (editor.showPrompt = false)}>×</button>
		</div>
	</header>
	<pre>{editor.result.prompt}</pre>
</aside>

<style>
	.panel {
		position: fixed;
		top: 64px;
		right: 16px;
		bottom: 48px;
		width: min(480px, calc(100vw - 32px));
		display: flex;
		flex-direction: column;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 11px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
		z-index: 8;
		overflow: hidden;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px 10px 8px 14px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
	}
	.heading {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tag {
		font-size: 10px;
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 2px 7px;
		border-radius: 4px;
		background: #6366f1;
		color: white;
	}
	.tag.scratch {
		background: #10b981;
	}
	.tag.none {
		background: var(--muted-fg);
	}
	.actions {
		display: flex;
		gap: 4px;
	}
	button {
		font: inherit;
		font-size: 12px;
		padding: 5px 10px;
		border-radius: 7px;
		border: none;
		background: transparent;
		color: var(--fg);
		cursor: pointer;
	}
	button:hover {
		background: var(--accent);
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.primary {
		background: var(--ring);
		color: var(--card);
	}
	.primary:hover {
		opacity: 0.85;
		background: var(--ring);
	}
	.close {
		font-size: 16px;
		line-height: 1;
		padding: 4px 8px;
		color: var(--muted-fg);
	}
	pre {
		flex: 1;
		margin: 0;
		padding: 14px;
		overflow: auto;
		font-family: ui-monospace, "SF Mono", Menlo, monospace;
		font-size: 12px;
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
		user-select: text;
	}
</style>
