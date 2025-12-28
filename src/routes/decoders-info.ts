import { Request, Response } from 'express';
import { SAGE_STARBASED_INSTRUCTIONS } from '../decoders/instruction-maps.js';

/**
 * API: List all supported instructions and categories
 */
export function decodersInfoHandler(_req: Request, res: Response) {
  try {
    const categories: Record<string, string[]> = {};
    for (const [name, details] of Object.entries(SAGE_STARBASED_INSTRUCTIONS)) {
      if (name === 'Unknown') continue;
      const cat = (details as any).category || 'unknown';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(name);
    }
    res.json({
      success: true,
      total_instructions: Object.keys(SAGE_STARBASED_INSTRUCTIONS).length - 1, // -1 for Unknown
      categories,
      source: 'Official Star Atlas Carbon Decoders',
      programs: {
        'SAGE-Starbased': 'SAGEQbkxz47ynfSeJ2cgvhy26yEQ6w57RPUAGuk76a1',
        'Crafting': 'CRAFT2RPXPJWCEix4WpJST3E7NLf79GTqZUL75wngXo5'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}