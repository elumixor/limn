# Limn

A diagram editor whose diagrams are meant to compile into structured LLM prompts
for app code generation. Right now the focus is the editor; the codegen compiler
will be added back over this model once the editing experience is right.

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

Editor-first. The codegen compiler (the eventual product —
`patch(old, new) -> prompt`) was removed when the model changed and will be
rewritten over the `Block` model. Calling an LLM, auto test generation, and
multi-file project management remain out of scope for now.
