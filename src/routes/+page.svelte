<script lang="ts">
	import { editor } from "$lib/editor/store.svelte";
	import Canvas from "$lib/editor/Canvas.svelte";

	let fileInput: HTMLInputElement;
	let mouse = { x: 0, y: 0 };

	function isTyping(t: EventTarget | null): boolean {
		const el = t as HTMLElement | null;
		return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
	}

	function canvasEl() {
		return document.querySelector(".canvas") as HTMLElement | null;
	}

	/** Place a box under the cursor when it's over the canvas; otherwise center it. */
	function addBoxAtMouse() {
		const el = canvasEl();
		const r = el?.getBoundingClientRect();
		const over = r && mouse.y > r.top && mouse.x > r.left;
		if (!over) return addBoxCentered();
		const x = mouse.x - r.left + (el?.scrollLeft ?? 0) - 115;
		const y = mouse.y - r.top + (el?.scrollTop ?? 0) - 28;
		editor.addBox(Math.max(8, x), Math.max(8, y));
	}

	/** Cascade new boxes into the visible top-left of the canvas. */
	function addBoxCentered() {
		const el = canvasEl();
		const n = editor.diagram.boxes.length;
		const x = (el?.scrollLeft ?? 0) + 60 + (n % 5) * 40;
		const y = (el?.scrollTop ?? 0) + 50 + (n % 5) * 36;
		editor.addBox(x, y);
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
		if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
			e.preventDefault();
			editor.deleteSelected();
			return;
		}
		if (typing || mod) return;

		switch (e.key.toLowerCase()) {
			case "n":
				e.preventDefault();
				addBoxAtMouse();
				break;
			case "c":
				editor.startConnectorFromSelected();
				break;
			case "f":
				editor.addFieldToSelected();
				break;
			case "a":
				editor.addCommentToSelected();
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
	<header class="topbar">
		<div class="brand">
			<span class="logo">Limn</span>
			<span class="sub">diagram editor</span>
		</div>

		<div class="spacer"></div>

		<div class="group">
			<button class="ghost" onclick={() => editor.undo()} disabled={!editor.canUndo} title="Undo (⌘Z)" aria-label="Undo">↶</button>
			<button class="ghost" onclick={() => editor.redo()} disabled={!editor.canRedo} title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
		</div>

		<div class="sep"></div>

		<button class="primary" onclick={addBoxCentered}>+ Box <kbd>N</kbd></button>

		<div class="sep"></div>

		<div class="group">
			<button class="ghost" onclick={save}>Save</button>
			<button class="ghost" onclick={() => fileInput.click()}>Load</button>
			<button class="ghost danger" onclick={() => editor.clear()}>Clear</button>
		</div>
		<input bind:this={fileInput} type="file" accept="application/json" onchange={load} hidden />
	</header>

	<main><Canvas /></main>

	<footer class="hints">
		<span><kbd>N</kbd> box</span>
		<span><kbd>F</kbd> field</span>
		<span><kbd>A</kbd> comment</span>
		<span><kbd>C</kbd> connect</span>
		<span><kbd>⌫</kbd> delete</span>
		<span><kbd>⌘Z</kbd> undo</span>
		<span class="dim">drag ↘ to connect · right-click for menu · autosaved</span>
	</footer>
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
		font-family:
			ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
		color: var(--fg);
		-webkit-font-smoothing: antialiased;
	}
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.logo {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.03em;
	}
	.sub {
		font-size: 12px;
		color: var(--muted-fg);
	}
	.spacer {
		flex: 1;
	}
	.group {
		display: flex;
		gap: 2px;
	}
	.sep {
		width: 1px;
		height: 20px;
		background: var(--border);
		margin: 0 4px;
	}
	button {
		font: inherit;
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 11px;
		border-radius: 7px;
		border: 1px solid transparent;
		cursor: pointer;
		transition: background 0.1s, border-color 0.1s;
	}
	.ghost {
		background: transparent;
		color: var(--fg);
		border-color: var(--border);
	}
	.ghost:hover:not(:disabled) {
		background: var(--accent);
	}
	.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.ghost.danger {
		color: #dc2626;
		border-color: #fecaca;
	}
	.ghost.danger:hover {
		background: #fef2f2;
	}
	.primary {
		background: var(--fg);
		color: #fff;
		font-weight: 500;
	}
	.primary:hover {
		background: #27272a;
	}
	kbd {
		font-family: ui-monospace, monospace;
		font-size: 10px;
		padding: 1px 5px;
		border-radius: 4px;
		background: rgb(255 255 255 / 0.15);
		border: 1px solid rgb(255 255 255 / 0.25);
	}
	.hints kbd {
		background: var(--muted);
		border: 1px solid var(--border);
		color: var(--muted-fg);
	}
	main {
		flex: 1;
		min-height: 0;
	}
	.hints {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 5px 14px;
		background: var(--card);
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--muted-fg);
	}
	.hints span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.hints .dim {
		margin-left: auto;
		color: var(--muted-fg);
		opacity: 0.7;
	}
</style>
