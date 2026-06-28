# Limn

A diagram editor whose diagrams are meant to compile into structured LLM prompts
for app code generation. Right now the focus is the editor itself; the compiler
exists in the codebase but is not wired into the UI yet (see *Status* below).

## The diagram model

A diagram is a loose typed graph, serialized as plain JSON (zero-loss
round-trip). Deliberately unopinionated — no rigid component/screen/model split:

- **Boxes** — a name, a free-text description, typed fields (`name: type`), and
  free-text comments. A box can be anything: a component, a screen, a model, a
  service. What it *is* lives in its description and connectors, not a fixed kind.
- **Connectors** — directed relationships between boxes, with a free-text label
  (e.g. "renders", "onSubmit → addTodo") and optional comments.

See `src/lib/diagram/types.ts`.

## The editor

A SvelteKit + Svelte 5 app. Everything is edited inline on the canvas — there is
no separate properties panel.

- **Inline editing** — click any box's name, description, field name/type, or
  comment and type. No modal, no side panel.
- **Connectors** — drag the ↘ handle from one box onto another. Connector labels
  are editable inline on the canvas.
- **Context menu** — right-click a box (add field/comment, connect, delete), a
  connector (delete), or empty canvas (new box, clear).
- **Keyboard**
  - `N` — new box (at the cursor)
  - `F` — add a field to the box in context
  - `A` — add a comment to the box in context
  - `C` — start a connector from the selected box
  - `Delete` / `Backspace` — delete the selected box, field, comment, or connector
  - `⌘Z` / `Ctrl+Z` — undo, `⌘⇧Z` / `Ctrl+Y` — redo
- **Undo / redo** — full history; rapid keystrokes in one field coalesce into a
  single step.
- **Autosave** — the diagram persists to `localStorage` on every change and
  reloads on open. Save / Load export and import JSON.

Editor code lives in `src/lib/editor/` (`store.svelte.ts`, `Canvas.svelte`,
`BoxCard.svelte`, `ContextMenu.svelte`).

## The compiler (not currently in the UI)

`patch(old, new) -> structured prompt` is the eventual product: a deterministic
function that diffs two diagram states and emits a precise spec — from scratch
when `old` is empty, or a patch (with a "leave unaffected code byte-identical"
instruction) when it isn't. It lives in `src/lib/compiler/` with unit tests, and
already targets the boxes/connectors model, but it is intentionally **not mounted
in the editor yet** — we're getting the editing experience right first, then
wiring codegen back in.

## Develop

```sh
bun install
bun run dev      # editor at http://localhost:5173
bun run test     # compiler unit tests (vitest)
bun run check    # svelte-check / typecheck
bun run build    # production build
```

## Status

V1, editor-first. Calling an LLM, auto test generation, locking generated code,
and multi-file project management are out of scope for now.
