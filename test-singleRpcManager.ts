import { getSingleHealthyRpc } from './src/utils/rpc/singleRpcManager';

(async () => {
  const rpc = await getSingleHealthyRpc();
  console.log('Healthy RPC:', rpc);
})();
