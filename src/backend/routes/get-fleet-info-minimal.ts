
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
  const get_fleet_info_minimal_bin = spawn('./utility/bin/get_fleet_info_minimal', [rpcUrl, fleetId]);
  let data = '';
  let err = '';
  get_fleet_info_minimal_bin.stdout.on('data', chunk => (data += chunk));
  get_fleet_info_minimal_bin.stderr.on('data', chunk => (err += chunk));
  get_fleet_info_minimal_bin.on('close', async code => {
    if (code === 0) {
      try {
        // Estrai la prima parentesi graffa e l'ultima per isolare il JSON
        const first = data.indexOf('{');
        const last = data.lastIndexOf('}');
        if (first === -1 || last === -1 || last <= first) throw new Error('JSON not found in output');
        const jsonStr = data.slice(first, last + 1);
        const json = JSON.parse(jsonStr);

        // Se posizione.starbase è presente, decodifica il nome e aggiungi la pubkey
        let starbasePubkey = null;
        if (json.posizione && json.posizione.starbase && Array.isArray(json.posizione.starbase)) {
          try {
            const starbasePubkeyBytes = Buffer.from(json.posizione.starbase);
            starbasePubkey = bs58.encode(starbasePubkeyBytes);
            // Recupera solo il nome della starbase
            const name = await getStarbaseName(rpcUrl, starbasePubkey);
            json.posizione.starbase_name = name;
            json.posizione.starbase_pubkey = starbasePubkey;
          } catch (e) {
            json.posizione.starbase_name = null;
            json.posizione.starbase_name_error = String(e);
            json.posizione.starbase_pubkey = null;
          }
        }

        // PATCH: aggiorna cache/contracts.json aggiungendo la pubkey della starbase alla flotta corrispondente
        try {
          const contractsPath = 'cache/contracts.json';
          //console.log('[DEBUG] contractsPath:', contractsPath);
          //console.log('[DEBUG] starbasePubkey:', starbasePubkey);
          //console.log('[DEBUG] fleetId:', fleetId);
          if (fs.existsSync(contractsPath) && starbasePubkey) {
            const contractsObj = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
            if (contractsObj && Array.isArray(contractsObj.contracts)) {
              const idx = contractsObj.contracts.findIndex((c: any) => c.fleet === fleetId);
              //console.log('[DEBUG] idx trovato:', idx);
              if (idx !== -1) {
                //console.log('[DEBUG] Prima della scrittura:', JSON.stringify(contractsObj.contracts[idx], null, 2));
                contractsObj.contracts[idx].starbase_pubkey = starbasePubkey;
                fs.writeFileSync(contractsPath, JSON.stringify(contractsObj, null, 2));
                //console.log('[DEBUG] Dopo la scrittura:', JSON.stringify(contractsObj.contracts[idx], null, 2));
              } else {
                console.log('[DEBUG] Nessun contratto trovato per fleetId:', fleetId);
              }
            } else {
              console.log('[DEBUG] contractsObj.contracts non è un array');
            }
          } else {
            console.log('[DEBUG] File non esiste o starbasePubkey mancante');
          }
        } catch (e) {
          console.log('[DEBUG] Errore scrittura contracts.json:', e);
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
