import express from 'express';
import { RentalService } from '../rental/rentalService';
import { PublicKey } from '@solana/web3.js';
const SRSLY_PROGRAM_ID = 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
const rentalService = new RentalService(new PublicKey(SRSLY_PROGRAM_ID), 30000);
import type { ContractQueryOptions, ContractStateFilter, FleetStarbase } from '../rental/types';

const router = express.Router();

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


router.get('/rentals/contracts', async (req, res) => {
  console.log('[rental] GET /rentals/contracts', {
    profileId: queryString(req.query.profileId),
  });
  const options: ContractQueryOptions = {
    profileId: queryString(req.query.profileId),
    q: queryString(req.query.q),
    state: queryState(req.query.state),
    starbase: queryStarbase(req.query.starbase),
    minRate: queryNumber(req.query.minRate),
    maxRate: queryNumber(req.query.maxRate),
    limit: queryNumber(req.query.limit),
    includeModules: req.query.includeModules === 'true' ? true : false,
  };

  try {
    const contracts = await rentalService.getContracts(options);
    res.json({ contracts, total: contracts.length });
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

export default router;
