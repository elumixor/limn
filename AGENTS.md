# AGENTS.md

Guidance for AI agents and contributors working in this repo. For the product
overview and user-facing feature list, read `README.md` first — this file
covers architecture, conventions, and gotchas instead.

## What this is

Limn is a freeform diagram editor (SvelteKit + Svelte 5). Diagrams are a tree of
recursive `Block`s plus `Connector`s between root blocks, and are eventually
meant to compile into structured LLM prompts (the compiler isn't in the tree
yet — the editor is the current focus).

## Stack

- **SvelteKit** (`@sveltejs/kit`) with **Svelte 5 runes** (`$state`, `$derived`,
  `$props`, `$effect`). No stores from `svelte/store` — state lives in runes.
- **TypeScript**, strict.
- **Vitest** for unit tests.
- **Biome** for lint + format.
- **Bun** is the package manager / task runner.

## Commands

```sh
bun install
bun run dev      # editor at http://localhost:5173
bun run check    # svelte-kit sync && svelte-check (the real typecheck)
bun run build    # production build
bun test         # vitest run
npx biome check src   # lint + format check
```

`bun run build` only emits — it is **not** a typecheck. Use `bun run check` to
typecheck `.svelte`/`.ts`, and Biome for `.ts` lint/format.

## Architecture

Two domains, kept separate:

### `src/lib/diagram/` — the pure model

- `types.ts` — the data model. `Block` (recursive: `name`, `comments[]`,
  `children[]`, optional `x/y/w/h`, `showComments`), `Connector`, `UIElement`
  (a free-drawn box on the UI canvas), `Mapping` (component→UI-element link),
  `Diagram` (`blocks`, `connectors`, `ui`, `mappings`), `Anchor`. Bump
  `DIAGRAM_VERSION` and migrate when the shape changes.
- `index.ts` — pure tree operations: `walk`, `findBlock`, `ownerList`,
  `isAncestor`, `isRoot`, `serialize`/`parse`, `migrate` (upgrades older-version
  saves forward), and `validate` (throws on the first structural problem; the
  gatekeeper for anything loaded from disk or `localStorage`).

No DOM, no Svelte, no editor state here. Plain JSON that round-trips losslessly.

### `src/lib/editor/` — the editor

- `store.svelte.ts` — `EditorStore`, the single source of truth (`export const
  editor`). Owns the `Diagram`, selection (blocks / connector / UI element /
  mapping), editing state, pending-connector and pending-mapping state, which
  panes are visible (`panes` — Components and/or UI; both = split view), the two
  canvases' pan offsets, measured root sizes, and all model mutations. Drives
  undo via `History` and autosave via an `$effect.root`. **All model changes go
  through this class** — never mutate `editor.diagram` from a component.
- `canvas-controller.svelte.ts` — `CanvasController`, the pointer-interaction
  state machine. Owns transient interaction state (pan / drag / resize / marquee
  / connector-link / endpoint-drag / hover / context menu) and the DOM
  measurement freeform nesting needs. One instance per `Canvas.svelte`.
- `geometry.ts` — **pure** functions over rectangles/points: connection anchors,
  bezier connector paths, resize hit-zones. No DOM, no state. Unit-tested.
- `layout.ts` — shared freeform-nesting constants and helpers
  (`fitToChildren`, `childrenExtent`, `nextChildY`, `descendantIds`, sizing
  constants). The parent-fits-its-children rules live here so the store and the
  controller agree.
- `dom.ts` — tiny shared DOM predicates (`isTextInput`, `blockIdAt`).
- `Canvas.svelte` — the **Components** screen: markup + SVG. Reads
  controller/store state and forwards events to the controller; holds almost no
  logic itself.
- `BlockView.svelte` — recursive block renderer (renders itself for children).
- `UIView.svelte` — the **UI** screen: a second, self-contained freeform canvas
  for free-drawn `UIElement` boxes (double-click to add, drag to move, corner to
  resize). Its own pan (`editor.uiPan`); no nesting or connectors.
- `MappingLayer.svelte` — absolute overlay shown only in split view. Reads the
  live on-screen rects of both panes each frame (rAF) to draw component→UI
  mapping links, and hosts the drag handle that creates them (the two canvases
  pan independently, so the DOM is the only shared coordinate space).
- `ViewSwitcher.svelte` — the top-center Components/UI segmented control
  (`editor.togglePane`).
- `ContextMenu.svelte` — generic menu driven by a `MenuItem[]`.

`src/routes/+page.svelte` is the page shell: global keyboard shortcuts, the
Components/UI split layout, the switcher + Save/Load dock, and CSS variables
(theme tokens).

### The split that matters

Pure logic (`geometry.ts`, `layout.ts`, `diagram/`) is separated from stateful
logic (`store.svelte.ts`, `canvas-controller.svelte.ts`) which is separated from
rendering (`*.svelte`). Keep it that way:

- Pure, stateless transforms → plain functions in `geometry.ts` / `layout.ts` /
  `diagram/index.ts`. These are the testable units.
- State + behavior → a method on `EditorStore` or `CanvasController`.
- Components stay thin: read reactive state, forward events. No business logic,
  no direct `editor.diagram` mutation.

## Conventions

- **Formatting (Biome):** tabs, double quotes, semicolons, 120-col width. Run
  `npx biome check src` before finishing; it auto-sorts imports.
- Biome **does not lint `.svelte` files** (see `biome.json` excludes) — they
  can't see template usage and would false-flag. `svelte-check` covers them.
- **Coordinates:** root blocks store canvas-space `x/y`; nested blocks store
  parent-local `x/y`. Connector geometry uses root rects only (measured sizes in
  `editor.sizes`, with `DEFAULT_ROOT_SIZE` fallback). Anchors are normalized
  border fractions (0..1), so they track moves/resizes for free.
- **History:** call `editor.snapshot()` before a discrete mutation, or
  `editor.beginTextEdit(key)` for coalescing text edits. Most store mutations
  already record internally — check before adding a redundant snapshot.
- **Comments:** explain *why* (intent, invariants, gotchas), not *what*. Match
  the dense, purposeful comment style already in these files.
- Keep new magic numbers as named constants near their siblings
  (`layout.ts` for sizing, the controller for interaction thresholds).

## Gotchas

- After `svelte-kit sync`/codegen the TS server can show **stale** errors for
  symbols that plainly exist. Cross-check against `bun run check`; if it's green,
  reload the editor window.
- IDE "Problems" may show cSpell "unknown word" noise on code identifiers
  (`vrect`, `droptarget`, `subblock`, …). Not real findings.
- `validate()` runs on every load and every undo/redo restore. If you add or
  rename model fields, update `validate` and the `DIAGRAM_VERSION` together.
- `localStorage` key is `limn.diagram.v4` (older keys in `LEGACY_KEYS` are read
  once and migrated forward via `migrate`). Bump it (and add a migration) on a
  breaking model change, or old saves will fail `validate` and silently reset to
  an empty diagram.

## Before you finish

Run and fix everything that breaks, on touched files:

1. `npx biome check src` (lint + format)
2. `bun run check` (typecheck — the authoritative one)
3. `bun run build`
4. `bun test`
5. IDE diagnostics on touched files (ignore cSpell noise)

Refactors are behavior-preserving by default — preserve behavior exactly unless
a behavior change was explicitly requested.
