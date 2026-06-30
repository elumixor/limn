/** Small DOM helpers shared by the canvas controller and the page-level key handler. */

/** True when the event target is inside a text-editing field (so global shortcuts should yield). */
export function isTextInput(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	return !!el && (!!el.closest("input, textarea") || el.isContentEditable);
}

/** Id of the nearest enclosing block element, or null. */
export function blockIdAt(node: EventTarget | null): string | null {
	return ((node as HTMLElement)?.closest("[data-block-id]") as HTMLElement)?.dataset.blockId ?? null;
}
