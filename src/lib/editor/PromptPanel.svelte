<script lang="ts">
	import { editor } from "./store.svelte";

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(editor.result.prompt);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const label = $derived(
		editor.result.noChange
			? "No changes"
			: editor.result.fromScratch
				? "From scratch"
				: "Patch",
	);
</script>

<div class="panel">
	<header>
		<div>
			<strong>Generated prompt</strong>
			<span class="tag" class:scratch={editor.result.fromScratch} class:none={editor.result.noChange}>{label}</span>
		</div>
		<div class="actions">
			<button class="commit" onclick={() => editor.commit()} disabled={editor.result.noChange}>
				Commit as anchor
			</button>
			<button class="copy" onclick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
		</div>
	</header>
	<pre>{editor.result.prompt}</pre>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0f172a;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: #1e293b;
		color: #e2e8f0;
		font-size: 13px;
	}
	.tag {
		font-size: 10px;
		text-transform: uppercase;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 4px;
		margin-left: 8px;
		background: #6366f1;
		color: white;
	}
	.tag.scratch { background: #10b981; }
	.tag.none { background: #64748b; }
	.actions { display: flex; gap: 6px; }
	button {
		font: inherit;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 5px;
		border: none;
		cursor: pointer;
	}
	.commit { background: #334155; color: #e2e8f0; }
	.commit:disabled { opacity: 0.4; cursor: not-allowed; }
	.copy { background: #6366f1; color: white; }
	pre {
		flex: 1;
		margin: 0;
		padding: 14px;
		overflow: auto;
		color: #cbd5e1;
		font-family: ui-monospace, "SF Mono", Menlo, monospace;
		font-size: 12px;
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
