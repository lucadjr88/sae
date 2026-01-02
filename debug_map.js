import { buildAccountToFleetMap } from './src/services/walletSageFeesStreaming/lib/fleet-association.js';
import * as fs from 'fs';

const request = JSON.parse(fs.readFileSync('fleet_breakdown_request.json', 'utf8'));
const map = buildAccountToFleetMap(request.fleetAccounts);

for (const [acc, fleet] of map.entries()) {
  console.log(`${acc} -> ${fleet}`);
}
