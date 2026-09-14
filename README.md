# Limn

A diagram editor whose diagrams compile into structured LLM prompts for app
code generation. Draw the system, copy the prompt, hand it to a coding agent.
Change the diagram, and the next prompt is a patch: only what changed and its
neighbours.

## The model

Everything is a recursive **Block**:

- `name`
- `comments[]` — free text (description, type, intent); toggleable inline per block
- `children[]` — nested blocks

There is no separate field / property / component distinction. A "property" is
just a child block; a sub-component is just a child block. Depth and comments
carry the meaning, and it all concatenates to text later.

Root blocks live on the canvas (they have `x`/`y`); nested blocks flow inside
their parent. **Connectors** relate two root blocks and have a `kind`
(`line` / `arrow` / `double`) plus an optional `description` (default reads as
"source → target"). See `src/lib/diagram/types.ts`.

Plain JSON, zero-loss round-trip.

## The prompt

`patch(old, new)` is the core function (`src/lib/compiler/`). It is pure and
deterministic: same two diagrams, same text.

- With no baseline it emits a **build specification**: every root block as a
  unit with its intent (comments), its parts (nested blocks as an indented
  tree) and its relations (connectors, both directions).
- After **Mark as built** the current diagram becomes the baseline. The prompt
  turns into a **patch specification**: a change summary, removals, and the
  full spec of every root block that changed plus the ones connected to it.
  Layout is not semantic, so moving boxes changes nothing.

Open the panel with the **Prompt** button or `P`. **Example** loads the
reference diagram: the architecture of [pai](https://github.com/elumixor/pai)
transcribed from its `docs/architecture.md` (`src/lib/examples/pai.ts`).

## The editor

SvelteKit + Svelte 5. Full-bleed canvas; the only chrome is a floating title and
a floating Save / Load dock. Everything is edited inline on the canvas.

- **Select vs drag** — press and release (without moving) selects the deepest
  block under the cursor; press and move drags. Dragging never selects.
- **Edit** — double-click a name or comment to edit it.
- **Nest** — drag a block onto another to nest it; drag a nested block out to the
  canvas (or use the context menu) to promote it back to a root.
- **Connect** — drag the small handle on a root block onto another root block.
  Connectors attach at the closest edge points; right-click to cycle the arrow
  style, edit the description, or delete.
- **Comments** — not always shown; toggle per block (a `💬n` badge marks hidden
  ones).
- **Context menu** — right-click a block, a connector, or empty canvas.
- **Keyboard**
  - `N` — new box (at the cursor)
  - `F` — add a child block to the selection
  - `A` — add a comment to the selection
  - `C` — start a connector from the selected block
  - `P` — toggle the prompt panel
  - `Enter` — rename the selected block
  - `Delete` / `Backspace` — delete the selection
  - `⌘Z` / `Ctrl+Z` — undo, `⌘⇧Z` / `Ctrl+Y` — redo
- **Undo / redo** — full in-session history; rapid keystrokes coalesce into one
  step.
- **Autosave** — persists to `localStorage` on every change; Save / Load export
  and import JSON.

Editor code: `src/lib/editor/` (`store.svelte.ts`, `Canvas.svelte`,
`BlockView.svelte`, `ContextMenu.svelte`).

## Develop

```sh
bun install
bun run dev      # editor at http://localhost:5173
bun run check    # svelte-check / typecheck
bun run build    # production build
```

## Status

Editor + compiler. Calling an LLM from the app, auto test generation, and
multi-file project management remain out of scope for now.
