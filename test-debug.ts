import { debugFleetBreakdown } from './src/services/walletSageFeesStreaming/debug.ts';

// Mock services
const services = {
  rpcPool: null,
  logger: console,
  metrics: undefined
};

const walletPubkey = '9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY';
const opts = {
  enableSubAccountMapping: true,
  fleetAccounts: ['7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5'], // Rainbow Cargo
  fleetNames: {'7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5': 'Rainbow Cargo'},
  fleetRentalStatus: {}
};

async function test() {
  const result = await debugFleetBreakdown(services, walletPubkey, opts);
  console.log('Rainbow Cargo operations:', result.feesByFleet['7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5']?.operations || 0);
  console.log('Result keys:', Object.keys(result));
}

test();