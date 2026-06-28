# Limn

Limn compiles UML/UI diagrams into structured LLM prompts for app code generation.

You draw your app as a typed graph — components, screens, data models, and the
edges that wire them together — and Limn emits a precise, declarative
specification you paste into an LLM (Claude Code, etc.). Limn does not call any
LLM itself; you stay in the loop.

## The core abstraction

Everything is one deterministic function:

```ts
patch(diagramOld, diagramNew) -> structured prompt
```

- **From-scratch generation** is just `patch(emptyDiagram(), diagram)`.
- **Editing** is `patch(previousDiagram, currentDiagram)`.

There is no separate "initial" vs "edit" code path. Every prompt is a diff
against a prior diagram state, with the empty diagram as the starting point.

Given the same inputs, `patch` always produces the same output — no randomness,
no network calls.

## The diagram model

A diagram is a typed graph, serialized as plain JSON (zero-loss round-trip):

- **Nodes**
  - `component` — name, typed props, local state (children come from render edges)
  - `screen` — a routable page that composes components
  - `model` — a data entity with typed fields
- **Edges**
  - `render` — a parent renders a child
  - `event` — `source.event` is wired to `target.handler`
  - `data` — data flows from source to target
- **Annotations** — free-text intent on any node or edge, folded into the prompt

The diagram is the single source of truth. See `src/lib/diagram/types.ts`.

## The compiler

`patch(old, new)` (in `src/lib/compiler/`) runs four deterministic steps:

1. **Diff** the two graphs into structural changes (added / removed / renamed /
   modified nodes and edges), with field-level detail.
2. **Compute the affected subgraph**: changed nodes plus their direct
   dependents (one hop along edges).
3. **Emit** a declarative spec for each affected node — props with types, local
   state, what it renders, event wiring, and data flow — folding annotations in
   as intent.
4. For a non-empty `old`, prepend the **diff summary** and an instruction to
   **patch the existing code as an anchor**, leaving unaffected regions
   byte-identical.

The compiler is a pure TypeScript module with no UI dependencies, so it is
testable in isolation.

## The editor

A SvelteKit app (`src/routes/`, `src/lib/editor/`) gives you:

- A canvas to place and drag nodes, and draw edges between them.
- An inspector to edit names, typed props/state/fields, routes, edge wiring, and
  annotations.
- A live prompt panel with copy-to-clipboard.
- **Commit as anchor** — snapshot the current diagram as the new `old`, so the
  next edits compile to a patch prompt (simulating "code was generated").
- Save / load the diagram as JSON.

## Develop

```sh
bun install
bun run dev      # editor at http://localhost:5173
bun run test     # compiler unit tests (vitest)
bun run check    # svelte-check / typecheck
bun run build    # production build
```

## Scope

This is V1. It covers the diagram editor and the `patch` compiler. Calling the
LLM, auto test generation, locking generated code, and multi-file project
management are out of scope for now.
