<script lang="ts">
	import { editor } from "$lib/editor/store.svelte";
	import Canvas from "$lib/editor/Canvas.svelte";
	import Inspector from "$lib/editor/Inspector.svelte";
	import PromptPanel from "$lib/editor/PromptPanel.svelte";

	let fileInput: HTMLInputElement;

	function save() {
		const blob = new Blob([editor.exportJSON()], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "diagram.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	async function load(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			editor.loadJSON(await file.text());
		} catch (err) {
			alert(`Invalid diagram: ${(err as Error).message}`);
		}
		(e.target as HTMLInputElement).value = "";
	}
</script>

<div class="app">
	<header class="topbar">
		<h1>Limn</h1>
		<span class="sub">diagrams → structured codegen prompts</span>
		<div class="spacer"></div>
		<button onclick={() => editor.addNode("component")}>+ Component</button>
		<button onclick={() => editor.addNode("screen")}>+ Screen</button>
		<button onclick={() => editor.addNode("model")}>+ Model</button>
		<button
			class="connect"
			class:active={editor.connectFrom}
			disabled={!editor.selectedNode}
			onclick={() => (editor.connectFrom = editor.selectedId)}
		>
			↳ Connect
		</button>
		<div class="divider"></div>
		<button onclick={save}>Save</button>
		<button onclick={() => fileInput.click()}>Load</button>
		<button class="danger" onclick={() => editor.clear()}>Clear</button>
		<input bind:this={fileInput} type="file" accept="application/json" onchange={load} hidden />
	</header>

	<main>
		<section class="canvas-area"><Canvas /></section>
		<aside class="inspector-area"><Inspector /></aside>
		<aside class="prompt-area"><PromptPanel /></aside>
	</main>
</div>

<style>
	:global(body) { margin: 0; font-family: system-ui, sans-serif; }
	.app { display: flex; flex-direction: column; height: 100vh; }
	.topbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: #1e293b;
		color: white;
		border-bottom: 1px solid #334155;
	}
	h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
	.sub { font-size: 12px; color: #94a3b8; }
	.spacer { flex: 1; }
	.divider { width: 1px; height: 22px; background: #475569; margin: 0 4px; }
	.topbar button {
		font: inherit;
		font-size: 13px;
		padding: 5px 11px;
		border-radius: 6px;
		border: 1px solid #475569;
		background: #334155;
		color: #e2e8f0;
		cursor: pointer;
	}
	.topbar button:hover { background: #475569; }
	.topbar button:disabled { opacity: 0.4; cursor: not-allowed; }
	.topbar button.danger { border-color: #b91c1c; color: #fca5a5; }
	.topbar button.connect.active { background: #f59e0b; color: #1e293b; border-color: #f59e0b; }
	main {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 300px 420px;
		min-height: 0;
	}
	.canvas-area { min-width: 0; }
	.inspector-area { border-left: 1px solid #e2e8f0; background: white; min-height: 0; }
	.prompt-area { min-height: 0; }
</style>
