
import express from 'express'
import { spawn } from 'child_process'
import { Connection } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import bs58 from 'bs58';
import fs from 'fs';
const sageIdlPath = new URL('../idl/sage_idl.json', import.meta.url);
const sageIdl = JSON.parse(fs.readFileSync(sageIdlPath, 'utf-8'));

const router = express.Router()

// GET /api/getFleetInfoMinimal?rpcUrl=...&fleetId=...
router.get('/getFleetInfoMinimal', async (req, res) => {
  const rpcUrl = req.query.rpcUrl as string;
  const fleetId = req.query.fleetId as string;
  if (!rpcUrl || !fleetId) {
    return res.status(400).json({ error: 'Missing rpcUrl or fleetId' });
  }
  const proc = spawn('./decoder/get_fleet_info_minimal', [rpcUrl, fleetId]);
  let data = '';
  let err = '';
  proc.stdout.on('data', chunk => (data += chunk));
  proc.stderr.on('data', chunk => (err += chunk));
  proc.on('close', async code => {
    if (code === 0) {
      try {
        // Estrai la prima parentesi graffa e l'ultima per isolare il JSON
        const first = data.indexOf('{');
        const last = data.lastIndexOf('}');
        if (first === -1 || last === -1 || last <= first) throw new Error('JSON not found in output');
        const jsonStr = data.slice(first, last + 1);
        const json = JSON.parse(jsonStr);

        // Se posizione.starbase è presente, decodifica il nome
        if (json.posizione && json.posizione.starbase && Array.isArray(json.posizione.starbase)) {
          try {
            const starbasePubkeyBytes = Buffer.from(json.posizione.starbase);
            const starbasePubkey = bs58.encode(starbasePubkeyBytes);
            // Recupera solo il nome della starbase
            const name = await getStarbaseName(rpcUrl, starbasePubkey);
            json.posizione.starbase_name = name;
          } catch (e) {
            json.posizione.starbase_name = null;
            json.posizione.starbase_name_error = String(e);
          }
        }
        res.json(json);
      } catch (e) {
        res.status(500).json({ error: 'Invalid JSON', details: String(e), raw: data });
      }
    } else {
      res.status(500).json({ error: 'Rust process failed', code, stderr: err });
    }
  });
});



// Funzione minimale: restituisce solo il nome della starbase
async function getStarbaseName(rpcUrl: string, starbasePubkey: string): Promise<string|null> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const program = new Program(sageIdl as any, SAGE_PROGRAM_ID, { connection });
  const account = await program.account.starbase.fetch(starbasePubkey);
  let name: string|null = null;
  try {
    const nameBytes = (account as any).name;
    if (nameBytes && Array.isArray(nameBytes)) {
      const bytes = nameBytes.filter((b: unknown) => typeof b === 'number' && b !== 0) as number[];
      name = Buffer.from(bytes).toString('utf-8');
    }
  } catch {}
  return name;
}
export default router
