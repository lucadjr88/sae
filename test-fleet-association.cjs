const fs = require('fs');
const path = require('path');

// Mock transaction interface
// (defined inline)

// Fleet data from cache
const fleetKey = '7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5';
const cacheFile = path.join(process.cwd(), 'cache', 'fleets', `${fleetKey}.json`);
const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const fleetData = cacheData.data.data;

// Sub-accounts
const cargoHold = fleetData.cargoHold;
const fuelTank = fleetData.fuelTank;
const ammoBank = fleetData.ammoBank;

console.log('Fleet:', fleetKey);
console.log('CargoHold:', cargoHold);
console.log('FuelTank:', fuelTank);
console.log('AmmoBank:', ammoBank);

// Build accountToFleet map
const accountToFleet = {};
accountToFleet[cargoHold] = fleetKey;
accountToFleet[fuelTank] = fleetKey;
accountToFleet[ammoBank] = fleetKey;

// Specific fleet accounts (simulate owned fleets)
const specificFleetAccounts = [fleetKey];

// Mock transactions that should match
const mockTransactions = [
  {
    signature: 'mock1',
    accountKeys: [fleetKey, 'other'],
    instructions: ['idleToLoadingBay'],
    logMessages: ['Docked at loading bay']
  },
  {
    signature: 'mock2',
    accountKeys: [cargoHold, 'other'],
    instructions: ['loadingBayToIdle'],
    logMessages: ['Undocked from loading bay']
  },
  {
    signature: 'mock3',
    accountKeys: ['random', 'other'],
    instructions: ['idleToLoadingBay'],
    logMessages: ['Some dock operation']
  }
];

// OP_MAP for operations
const OP_MAP = {
  'idleToLoadingBay': 'Dock',
  'loadingBayToIdle': 'Undock'
};

// Simulate matching logic
for (const tx of mockTransactions) {
  let matchedFleet = null;
  for (const account of tx.accountKeys || []) {
    if (specificFleetAccounts.includes(account)) {
      matchedFleet = account;
      break;
    }
    if (accountToFleet[account]) {
      matchedFleet = accountToFleet[account];
      break;
    }
  }

  let operation = 'Unknown';
  if (tx.instructions && tx.instructions.length > 0) {
    for (const instr of tx.instructions) {
      if (OP_MAP[instr]) {
        operation = OP_MAP[instr];
        break;
      }
    }
  }

  console.log(`\nTransaction ${tx.signature}:`);
  console.log(`  AccountKeys: ${tx.accountKeys.join(', ')}`);
  console.log(`  Instructions: ${tx.instructions.join(', ')}`);
  console.log(`  Matched Fleet: ${matchedFleet}`);
  console.log(`  Operation: ${operation}`);
  console.log(`  Associated: ${matchedFleet && operation !== 'Unknown' ? 'YES' : 'NO'}`);
}