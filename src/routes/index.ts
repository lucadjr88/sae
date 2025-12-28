import walletSageFeesDetailedRouter from './wallet-sage-fees-detailed';
import { Router } from 'express';
import walletRouter from './wallet';
import fleetsRouter from './fleets';

export function router({ rpcPool, services }: any) {
  const r = Router();
  r.use('/wallet', walletRouter({ rpcPool, services }));
  r.use('/fleets', fleetsRouter);
  r.use('/wallet-sage-fees-detailed', walletSageFeesDetailedRouter);
  // mount other routers similarly
  return r;
}

export default router;
