<script lang="ts">
	import { editor } from "$lib/editor/store.svelte";
	import Canvas from "$lib/editor/Canvas.svelte";

	let fileInput: HTMLInputElement;
	let mouse = { x: 0, y: 0 };

	function isTyping(t: EventTarget | null): boolean {
		const el = t as HTMLElement | null;
		return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
	}

	function addBoxAtMouse() {
		const el = document.querySelector(".viewport") as HTMLElement | null;
		const r = el?.getBoundingClientRect();
		const over = r && mouse.y > r.top && mouse.x > r.left && mouse.y < r.bottom && mouse.x < r.right;
		const cx = over ? mouse.x : (r?.left ?? 0) + 200;
		const cy = over ? mouse.y : (r?.top ?? 0) + 160;
		// convert screen → content coords (account for pan)
		const x = cx - (r?.left ?? 0) - editor.pan.x - 85;
		const y = cy - (r?.top ?? 0) - editor.pan.y - 20;
		editor.addRootBlock(x, y);
	}

	function onKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === "z") {
			e.preventDefault();
			if (e.shiftKey) editor.redo();
			else editor.undo();
			return;
		}
		if (mod && e.key.toLowerCase() === "y") {
			e.preventDefault();
			editor.redo();
			return;
		}

		const typing = isTyping(e.target);
		if (typing || mod) return;

		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			editor.deleteSelected();
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			editor.editSelectedName();
			return;
		}
		switch (e.key.toLowerCase()) {
			case "n":
				e.preventDefault();
				addBoxAtMouse();
				break;
			case "f":
				editor.addChildToSelected();
				break;
			case "a":
				editor.addCommentToSelected();
				break;
			case "c":
				editor.startConnectorFromSelected();
				break;
		}
	}

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

<svelte:window onkeydown={onKeydown} onpointermove={(e) => (mouse = { x: e.clientX, y: e.clientY })} />

<div class="app">
	<main><Canvas /></main>

	<footer class="hints">
		<span><kbd>N</kbd> box</span>
		<span><kbd>F</kbd> subblock</span>
		<span><kbd>A</kbd> comment</span>
		<span><kbd>C</kbd> connect</span>
		<span><kbd>↵</kbd> rename</span>
		<span><kbd>⌫</kbd> delete</span>
		<span><kbd>⌘Z</kbd> undo</span>
		<span class="dim">click to edit · drag to move · drag onto a box to nest · drag the dot to connect · autosaved</span>
	</footer>

	<div class="title">Limn</div>

	<div class="dock">
		<button onclick={save}>Save</button>
		<button onclick={() => fileInput.click()}>Load</button>
	</div>
	<input bind:this={fileInput} type="file" accept="application/json" onchange={load} hidden />
</div>

<style>
	:global(:root) {
		--bg: #fafafa;
		--grid: #e7e7ea;
		--card: #ffffff;
		--popover: #ffffff;
		--border: #e4e4e7;
		--fg: #18181b;
		--muted: #f4f4f5;
		--muted-fg: #71717a;
		--accent: #f4f4f5;
		--ring: #18181b;
	}
	:global(body) {
		margin: 0;
		font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
		color: var(--fg);
		-webkit-font-smoothing: antialiased;
	}
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
	}
	main {
		flex: 1;
		min-height: 0;
		position: relative;
	}
	.hints {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 6px 14px;
		background: var(--card);
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--muted-fg);
		z-index: 5;
	}
	.hints span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.hints .dim {
		margin-left: auto;
		opacity: 0.7;
	}
	.hints kbd {
		font-family: ui-monospace, monospace;
		font-size: 10px;
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 5px;
		color: var(--muted-fg);
	}
	.title {
		position: fixed;
		top: 16px;
		left: 18px;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--fg);
		pointer-events: none;
		user-select: none;
	}
	.dock {
		position: fixed;
		top: 14px;
		right: 16px;
		display: flex;
		gap: 6px;
		padding: 5px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 11px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
	}
	.dock button {
		font: inherit;
		font-size: 13px;
		padding: 6px 13px;
		border-radius: 7px;
		border: none;
		background: transparent;
		color: var(--fg);
		cursor: pointer;
		transition: background 0.1s;
	}
	.dock button:hover {
		background: var(--accent);
	}
</style>
