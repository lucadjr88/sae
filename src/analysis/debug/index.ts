import { Router } from 'express';
import { decodeProfileWithRustHandler } from './decodeProfileWithRust';
import { dumpFleetsHandler } from './dumpFleets';
import { dumpProfileHexHandler } from './dumpProfileHex';
import { refreshAllowedWalletsHandler } from './refreshAllowedWallets';
import { scanProfileOwnerHandler } from './scanProfileOwner';
import { getWalletAuthorityHandler } from './getWalletAuthority';
import { getWalletTxsHandler } from './getWalletTxs';
import { decodeSageOpsHandler } from './decodeSageOps';
import { decodeSageOpsFullHandler } from './decodeSageOpsFull';
import { getFleetsHandler } from './getFleets';
import { getRentedFleetsHandler } from './getRentedFleets';
import { associateSageOpsToFleetsHandler } from './associateSageOpsToFleets';
import { walletSageFeesDetailedHandler } from './walletSageFeesDetailed';
import { playloadHandler } from './playload';
import { enrichFleetStateHandler } from '../../decoders/fleetstatehandler';

const debugRouter = Router();

debugRouter.get('/decode-profile-with-rust', decodeProfileWithRustHandler);
debugRouter.get('/dump-fleets', dumpFleetsHandler);
debugRouter.get('/dump-profile-hex', dumpProfileHexHandler);
debugRouter.get('/refresh-allowed-wallets', refreshAllowedWalletsHandler);
debugRouter.get('/scan-profile-owner', scanProfileOwnerHandler);
debugRouter.get('/get-wallet-authority', getWalletAuthorityHandler);
debugRouter.get('/get-wallet-txs', getWalletTxsHandler);
debugRouter.get('/decode-sage-ops', decodeSageOpsHandler);
debugRouter.get('/decode-sage-ops-full', decodeSageOpsFullHandler);
debugRouter.get('/get-fleets', getFleetsHandler);
debugRouter.get('/get-rented-fleets', getRentedFleetsHandler);
debugRouter.get('/associate-sage-ops-to-fleets', associateSageOpsToFleetsHandler);
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
