
import express from 'express';
import scriptAffittaNaviRouter from '../rental/script_affitta_navi.js';
import scriptCancelRentRouter from '../rental/script_cancel_rent.js';
import scriptDelistRouter from '../rental/script_delist.js';
import scriptListRouter from '../rental/script_list.js';
import { RentalService } from '../rental/rentalService.js';
import { PublicKey } from '@solana/web3.js';
const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
const rentalService = new RentalService(new PublicKey(SRSLY_PROGRAM_ID), 30000);
import type { ContractQueryOptions, ContractStateFilter, FleetStarbase } from '../rental/types.js';
import { getRentalFleetDetails } from '../../decoders/rental_details.js';

const router = express.Router();
// Espone tutte le route definite in script_affitta_navi (inclusa /rent-fleet)
router.use('/', scriptAffittaNaviRouter);
router.use('/', scriptCancelRentRouter);
router.use('/', scriptDelistRouter);
router.use('/', scriptListRouter);

function queryString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const raw = queryString(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function queryState(value: unknown): ContractStateFilter {
  const raw = queryString(value);
  if (raw === 'available' || raw === 'active') return raw;
  return 'all';
}

function queryStarbase(value: unknown): FleetStarbase | undefined {
  const raw = queryString(value)?.toLowerCase();
  if (raw === 'mud' || raw === 'oni' || raw === 'ustur') return raw;
  return undefined;
}

import fs from 'fs/promises';
import path from 'path';
import { resolveToPlayerProfileId } from '../../utils/resolveToPlayerProfileId.js';

router.get('/rentals/contracts', async (req, res) => {
  const rawProfileId = queryString(req.query.profileId);
  const profileId = rawProfileId ? await resolveToPlayerProfileId(rawProfileId, req.query.wipecache === 'true') : undefined;
  console.log('[rental] GET /rentals/contracts', {
    rawProfileId,
    profileId,
    wipecache: req.query.wipecache,
  });
  const options: ContractQueryOptions = {
    profileId,
    q: queryString(req.query.q),
    state: queryState(req.query.state),
    starbase: queryStarbase(req.query.starbase),
    minRate: queryNumber(req.query.minRate),
    maxRate: queryNumber(req.query.maxRate),
    limit: queryNumber(req.query.limit),
    includeModules: req.query.includeModules === 'true' ? true : false,
  };

  // Se richiesto, elimina la cache prima di proseguire
  if (req.query.wipecache === 'true') {
    try {
      const cachePath = path.join(process.cwd(), 'cache', 'contracts.json');
      await fs.unlink(cachePath);
      console.log('[rental] contracts.json cache wiped');
    } catch (err) {
      if (err && (err as any).code !== 'ENOENT') {
        console.warn('[rental] Failed to wipe contracts.json:', err);
      }
    }
  }

  try {
    const { contracts, createdAt } = await rentalService.getContracts(options);
    res.json({ contracts, total: contracts.length, createdAt });
  } catch (error) {
    console.log('[rental] Failed to fetch contracts', {
      profileId: options.profileId,
      detail: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      error: 'Failed to fetch rental contracts',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/rentalDetails?fleetId=...&contractId=...
router.get('/rentalDetails', async (req, res) => {
  const fleetIdStr = queryString(req.query.fleetId);
  const contractIdStr = queryString(req.query.contractId);
  if (!fleetIdStr || !contractIdStr) {
    return res.status(400).json({ error: 'Missing fleetId or contractId' });
  }
  try {
    const fleetId = new PublicKey(fleetIdStr);
    const contractId = new PublicKey(contractIdStr);
    const details = await getRentalFleetDetails(fleetId, contractId);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rental details', detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
