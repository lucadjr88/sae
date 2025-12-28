
// src/decoders/instruction-maps.ts
// Mappa i nomi raw delle istruzioni in oggetti DecodedInstruction


export type DecodedInstruction = {
	program: string;
	instructionType: string;
	name: string;
	category?: string;
	description?: string;
};

export const SAGE_STARBASED_INSTRUCTIONS: { [key: string]: DecodedInstruction } = {};

export const CRAFTING_INSTRUCTIONS: { [key: string]: DecodedInstruction } = {};
