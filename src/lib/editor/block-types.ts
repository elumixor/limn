import type { BlockType } from "../diagram";

/**
 * Presentation metadata for each `BlockType`: the human label shown in the
 * header button/select and an accent colour for its icon. `icon` is a lucide
 * key resolved by `BlockTypeIcon.svelte` — kept as a string so the pure model
 * stays free of any rendering concern.
 */
export interface BlockTypeMeta {
	label: string;
	color: string;
	icon: "component" | "package" | "braces" | "database";
}

export const BLOCK_TYPE_META: Record<BlockType, BlockTypeMeta> = {
	component: { label: "Component", color: "#6366f1", icon: "component" },
	module: { label: "Module", color: "#0ea5e9", icon: "package" },
	data: { label: "Data", color: "#16a34a", icon: "braces" },
	database: { label: "Database", color: "#d97706", icon: "database" },
};
