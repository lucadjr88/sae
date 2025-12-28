import { Request, Response } from 'express';
import { decodeSageInstruction } from '../decoders/sage-crafting-decoder.js';
import { SAGE_STARBASED_INSTRUCTIONS, CRAFTING_INSTRUCTIONS } from '../decoders/instruction-maps.js';

/**
 * API: Decode SAGE/Crafting instruction using official decoders
 */
export function decodeInstructionHandler(_req: Request, res: Response) {
  try {
    const instruction = _req.params.instruction;
    const decoded = decodeSageInstruction(instruction);
    if (!decoded) {
      return res.status(404).json({
        success: false,
        instruction,
        message: 'Unknown instruction',
        available_categories: Object.keys(SAGE_STARBASED_INSTRUCTIONS)
          .map((k: string) => SAGE_STARBASED_INSTRUCTIONS[k as keyof typeof SAGE_STARBASED_INSTRUCTIONS])
          .reduce((acc: any, curr: any) => {
            if (!acc[curr.category]) acc[curr.category] = [];
            acc[curr.category].push(curr.instructionType);
            return acc;
          }, {})
      });
    }
    res.json({
      success: true,
      instruction,
      decoded,
      description: (SAGE_STARBASED_INSTRUCTIONS[instruction as keyof typeof SAGE_STARBASED_INSTRUCTIONS] || 
                   CRAFTING_INSTRUCTIONS[instruction as keyof typeof CRAFTING_INSTRUCTIONS])?.description || 'No description'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}