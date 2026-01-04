import type { IDecoder } from '../services/IDecoder.js';
// import sageCraftingDecoder from './sage-crafting-decoder';

const decoders: IDecoder[] = [];

export function registerDecoder(d: IDecoder) { decoders.push(d); }
export function decode(input: string | string[]) {
  for (const d of decoders) if (d.canDecode(input)) return d.decode(input);
}
export { decoders };
