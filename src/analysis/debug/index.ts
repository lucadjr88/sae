import { Router } from 'express';
import { decodeProfileWithRustHandler } from './decodeProfileWithRust.js';
import { getWalletAuthorityHandler } from './getWalletAuthority.js';
import { getWalletTxsHandler } from './getWalletTxs.js';
import { decodeSageOpsHandler } from './decodeSageOps.js';
import { decodeSageOpsFullHandler } from './decodeSageOpsFull.js';
import { associateSageOpsToFleetsHandler } from './associateSageOpsToFleets.js';
import { walletSageFeesDetailedHandler } from './walletSageFeesDetailed.js';
import { playloadHandler } from './playload.js';
import { playerProfileIdHandler } from './playerProfileId.js';
import { enrichFleetStateHandler } from '../../decoders/fleetstatehandler.js';
import { getProfileFactionUtil } from '../../utils/getProfileFaction.js';

const debugRouter = Router();

debugRouter.get('/decode-profile-with-rust', decodeProfileWithRustHandler);
debugRouter.get('/get-wallet-authority', getWalletAuthorityHandler);
debugRouter.get('/get-wallet-txs', getWalletTxsHandler);
debugRouter.get('/decode-sage-ops', decodeSageOpsHandler);
debugRouter.get('/decode-sage-ops-full', decodeSageOpsFullHandler);
debugRouter.get('/associate-sage-ops-to-fleets', associateSageOpsToFleetsHandler);
debugRouter.get('/player-profile-id', playerProfileIdHandler);
debugRouter.get('/profile-faction', async (req, res) => {
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId.trim() : '';
  if (!profileId) return res.status(400).json({ error: 'Missing profileId' });
  return res.json(await getProfileFactionUtil(profileId, false));
});
debugRouter.get('/playload', playloadHandler);
debugRouter.post('/playload', walletSageFeesDetailedHandler);

// FleetStateHandler enrichment test endpoint
debugRouter.get('/enrich-fleet-state-handler-test', (req, res) => {
  // Simulare log messages per test
  const testLogs = [
    'Program log: Instruction: FleetStateHandler',
    'Program log: Current state: MineAsteroid(MineAsteroid { asteroid: 3smQvmWWiPtN5ycQBjS6kRbL74qvXY4AXN2WvjczZTUu, resource: qBnf8FXUiBsaoyB5R6TW4N3eTRSjEcM2NZNyuGhPCTD, start: 1770038872, end: 0, amount_mined: 0, last_update: 1770038872 })',
  ];

  const enriched = enrichFleetStateHandler(
    'FleetStateHandler',
    testLogs,
    '5kDVEG9AEWkkof6odeb8osyHRLGLvVfwyScndmwFQoUgDDXbxXrmNvtvqW1QfvJgzdMRG6EphipybGQ4DgSXvcRc',
    1770038872
  );

  res.json(enriched);
});

export default debugRouter;
