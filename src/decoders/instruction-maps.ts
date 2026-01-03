
// src/decoders/instruction-maps.ts
// Mappa i nomi raw delle istruzioni in oggetti DecodedInstruction

import { STARBASED } from './sage/data/starbased/index.js';
import { CRAFTING } from './sage/data/crafting.js';
import { STARBASED_CATEGORIES, CRAFTING_CATEGORIES } from './sage/data/categories.js';

export type DecodedInstruction = {
	program: string;
	instructionType: string;
	name: string;
	category?: string;
	description?: string;
};

function buildMap(
	dataset: ReadonlyArray<{ name: string; description?: string; category?: string }>,
	program: string,
	categories: Record<string, string>
): Record<string, DecodedInstruction> {
	return dataset.reduce<Record<string, DecodedInstruction>>((acc, entry) => {
		acc[entry.name] = {
			program,
			instructionType: entry.name,
			name: entry.name,
			category: categories[entry.name] ?? entry.category,
			description: entry.description,
		};
		return acc;
	}, {});
}

export const SAGE_STARBASED_INSTRUCTIONS = buildMap(STARBASED, 'SAGE-Starbased', STARBASED_CATEGORIES);

export const CRAFTING_INSTRUCTIONS = buildMap(CRAFTING, 'Crafting', CRAFTING_CATEGORIES);

export const ALL_SAGE_INSTRUCTION_NAMES = new Set([
	...Object.keys(SAGE_STARBASED_INSTRUCTIONS),
	...Object.keys(CRAFTING_INSTRUCTIONS),
]);
