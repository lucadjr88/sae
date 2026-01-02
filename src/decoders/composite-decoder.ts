import { Idl, BorshInstructionCoder } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import sageIdl from './sage-idl.json' with { type: 'json' };
import { decodeCompositeWithRust } from './rust-wrapper.js';

const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';

// Create instruction coder directly for decoding
const instructionCoder = new BorshInstructionCoder(sageIdl as Idl);

export interface DecodedCompositeInstruction {
  index: number;
  programId: string;
  instructionName?: string;
  decoded?: any;
  error?: string;
  success?: boolean;
}

export interface DecodedComposite {
  isComposite: boolean;
  sageInstructionCount: number;
  instructions: DecodedCompositeInstruction[];
  engine?: string;
}

export function decodeCompositeInstructions(txJson: any): DecodedComposite {
  const instructions = txJson.transaction?.message?.instructions || txJson.data?.transaction?.message?.instructions || [];
  const results: DecodedCompositeInstruction[] = [];
  
  // Conta istruzioni SAGE
  const sageInstructions = instructions.filter((ix: any) => {
    const pid = ix.programId?.toString() || '';
    return pid === SAGE_PROGRAM_ID && ix.data;
  });
  
  if (sageInstructions.length === 0) {
    return { isComposite: false, sageInstructionCount: 0, instructions: [] };
  }

  // Try Rust decoder first
  try {
    const rustPayload = sageInstructions.map((ix: any) => ({
      programId: ix.programId.toString(),
      data: Buffer.from(bs58.decode(ix.data)).toString('hex')
    }));

    const rustDecoded = decodeCompositeWithRust(rustPayload);
    if (rustDecoded && Array.isArray(rustDecoded)) {
      return {
        isComposite: true,
        sageInstructionCount: sageInstructions.length,
        engine: 'carbon-rust',
        instructions: rustDecoded.map((rd, i) => ({
          index: i,
          programId: SAGE_PROGRAM_ID,
          instructionName: rd.name,
          decoded: rd.data,
          success: rd.success,
          error: rd.error
        }))
      };
    }
  } catch (err) {
    console.error('Rust composite decoding failed, falling back to Anchor:', err);
  }

  // Crea Program senza connection (non necessaria per decode)
  // const program = new Program(sageIdl as Idl, new PublicKey(SAGE_PROGRAM_ID), null as any);

  for (let i = 0; i < instructions.length; i++) {
    const ix = instructions[i];
    if (ix.programId === SAGE_PROGRAM_ID) {
      try {
        // Decode dati (converti da base58 a bytes prima di decodificare)
        const dataBytes = bs58.decode(ix.data);
        const dataBuffer = Buffer.from(dataBytes);
        const decoded = instructionCoder.decode(dataBuffer);
        const instructionName = decoded?.name || 'Unknown';
        results.push({ index: i, programId: ix.programId, instructionName, decoded, success: true });
      } catch (err: any) {
        results.push({ index: i, programId: ix.programId, error: `Decode failed: ${err.message}`, success: false });
      }
    }
  }
  
  return { 
    isComposite: true, 
    sageInstructionCount: sageInstructions.length, 
    instructions: results,
    engine: 'anchor'
  };
}