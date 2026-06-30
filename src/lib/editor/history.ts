/**
 * Undo/redo over opaque snapshot strings. Knows nothing about the diagram —
 * callers serialize their state, push snapshots, and restore the returned ones.
 * Rapid edits sharing a coalesce key collapse into a single history step.
 */
export class History {
	#undo: string[] = [];
	#redo: string[] = [];
	#coalesceKey = "";
	#coalesceAt = 0;
	/** How long (ms) edits with the same coalesce key keep merging into one step. */
	#window = 700;
	/** Cap on retained undo steps. */
	#limit = 200;

	/** Record a snapshot. Same `coalesceKey` within the window updates in place. */
	record(snapshot: string, coalesceKey = "") {
		const now = Date.now();
		if (coalesceKey && coalesceKey === this.#coalesceKey && now - this.#coalesceAt < this.#window) {
			this.#coalesceAt = now;
			return;
		}
		if (this.#undo[this.#undo.length - 1] !== snapshot) {
			this.#undo.push(snapshot);
			if (this.#undo.length > this.#limit) this.#undo.shift();
		}
		this.#redo = [];
		this.#coalesceKey = coalesceKey;
		this.#coalesceAt = now;
	}

	/** Snapshot to restore for an undo, or null if nothing to undo. `current` is pushed onto redo. */
	undo(current: string): string | null {
		if (!this.#undo.length) return null;
		this.#redo.push(current);
		this.#coalesceKey = "";
		return this.#undo.pop() as string;
	}

	/** Snapshot to restore for a redo, or null if nothing to redo. `current` is pushed onto undo. */
	redo(current: string): string | null {
		if (!this.#redo.length) return null;
		this.#undo.push(current);
		this.#coalesceKey = "";
		return this.#redo.pop() as string;
	}
}
