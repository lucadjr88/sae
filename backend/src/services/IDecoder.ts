export type Decoded = { program: string; type: string; [k: string]: any };
export interface IDecoder {
  id: string;
  canDecode(input: string | string[]): boolean;
  decode(input: string | string[]): Decoded | undefined;
}
