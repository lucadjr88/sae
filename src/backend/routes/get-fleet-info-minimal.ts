

import express from 'express';
import { spawn } from 'child_process';
import { Program } from '@project-serum/anchor';
import { getRpcConnection, getRpcConnectionWithUrl } from '../../utils/rpc/connection.js';
import bs58 from 'bs58';
import fs from 'fs';
const sageIdlPath = new URL('../idl/sage_idl.json', import.meta.url);
const sageIdl = JSON.parse(fs.readFileSync(sageIdlPath, 'utf-8'));

const router = express.Router();



// GET /api/getFleetInfoMinimal?rpcUrl=...&fleetId=...


router.get('/getFleetInfoMinimal', async (req, res) => {
  console.log('[DEBUG] /api/getFleetInfoMinimal handler called');
  const fleetId = req.query.fleetId as string;
  console.log('[DEBUG] Params:', { fleetId });

  if (!fleetId) {
    return res.status(400).json({ error: 'Missing fleetId' });
  }

  let rpcUrl: string;
  try {
    ({ rpcUrl } = await getRpcConnectionWithUrl());
  } catch (error) {
    console.log('[DEBUG] No healthy RPC endpoint found:', error);
    return res.status(500).json({ error: 'No healthy RPC endpoint found' });
  }

  const get_fleet_info_minimal_bin = spawn('./utility/bin/get_fleet_info_minimal', [rpcUrl, fleetId]);
  let data = '';
  let err = '';
  get_fleet_info_minimal_bin.stdout.on('data', chunk => {
    data += chunk;
    if (data.length < 500) console.log('[DEBUG] Rust stdout chunk:', chunk.toString());
  });
  get_fleet_info_minimal_bin.stderr.on('data', chunk => {
    err += chunk;
    console.log('[DEBUG] Rust stderr chunk:', chunk.toString());
  });
  get_fleet_info_minimal_bin.on('close', async code => {
    console.log('[DEBUG] Rust process closed with code:', code);
    if (code === 0) {
      try {
        const first = data.indexOf('{');
        const last = data.lastIndexOf('}');
        if (first === -1 || last === -1 || last <= first) {
          console.log('[DEBUG] JSON not found in output:', data);
          throw new Error('JSON not found in output');
        }
        const jsonStr = data.slice(first, last + 1);
        console.log('[DEBUG] JSON string extracted:', jsonStr.slice(0, 300));
        const json = JSON.parse(jsonStr);

        let starbasePubkey = null;
        if (json.posizione && json.posizione.starbase && Array.isArray(json.posizione.starbase)) {
          try {
            const starbasePubkeyBytes = Buffer.from(json.posizione.starbase);
            starbasePubkey = bs58.encode(starbasePubkeyBytes);
            console.log('[DEBUG] Decoded starbasePubkey:', starbasePubkey);
            const name = await getStarbaseName(starbasePubkey);
            console.log('[DEBUG] getStarbaseName result:', name);
            json.posizione.starbase_name = name;
            json.posizione.starbase_pubkey = starbasePubkey;
          } catch (e) {
            console.log('[DEBUG] Error in getStarbaseName:', e);
            json.posizione.starbase_name = null;
            json.posizione.starbase_name_error = String(e);
            json.posizione.starbase_pubkey = null;
          }
        }

        try {
          const contractsPath = 'cache/contracts.json';
          if (fs.existsSync(contractsPath) && starbasePubkey) {
            const contractsObj = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
            if (contractsObj && Array.isArray(contractsObj.contracts)) {
              const idx = contractsObj.contracts.findIndex((c: any) => c.fleet === fleetId);
              console.log('[DEBUG] contracts.json idx trovato:', idx);
              if (idx !== -1) {
                console.log('[DEBUG] Prima della scrittura:', JSON.stringify(contractsObj.contracts[idx], null, 2));
                contractsObj.contracts[idx].starbase_pubkey = starbasePubkey;
                fs.writeFileSync(contractsPath, JSON.stringify(contractsObj, null, 2));
                console.log('[DEBUG] Dopo la scrittura:', JSON.stringify(contractsObj.contracts[idx], null, 2));
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

        console.log('[DEBUG] Risposta finale inviata');
        res.json(json);
      } catch (e) {
        console.log('[DEBUG] Error parsing or handling JSON:', e);
        res.status(500).json({ error: 'Invalid JSON', details: String(e), raw: data });
      }
    } else {
      console.log('[DEBUG] Rust process failed, stderr:', err);
      res.status(500).json({ error: 'Rust process failed', code, stderr: err });
    }
  });
});



// Funzione minimale: restituisce solo il nome della starbase usando un RPC valido
async function getStarbaseName(starbasePubkey: string): Promise<string|null> {
  let connection;
  try {
    connection = await getRpcConnection();
  } catch (error) {
    console.log('[DEBUG] getStarbaseName: no healthy RPC found', error);
    return null;
  }
  const rpcUrl = connection.rpcEndpoint;
  console.log('[DEBUG] getStarbaseName called', { rpcUrl, starbasePubkey });
  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  const program = new Program(sageIdl as any, SAGE_PROGRAM_ID, { connection });
  let name: string|null = null;
  try {
    const account = await program.account.starbase.fetch(starbasePubkey);
    const nameBytes = (account as any).name;
    if (nameBytes && Array.isArray(nameBytes)) {
      const bytes = nameBytes.filter((b: unknown) => typeof b === 'number' && b !== 0) as number[];
      name = Buffer.from(bytes).toString('utf-8');
    }
    console.log('[DEBUG] Decoded starbase name:', name);
  } catch (e) {
    console.log('[DEBUG] Error in getStarbaseName fetch:', e);
  }
  return name;
}
export default router
