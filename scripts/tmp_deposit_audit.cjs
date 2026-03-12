const fs = require('fs');
const path = require('path');

const profile = 'CpnGr2beMA1HLUe5TSkNj4NqyAsY72VHaWHFrB6Pj7Zu';
const fleetsDir = path.join('cache', profile, 'fleets');
const breakdownDir = path.join('cache', profile, 'fleet-breakdowns');

const ownedOwners = new Set();
if (fs.existsSync(fleetsDir)) {
  for (const file of fs.readdirSync(fleetsDir)) {
    const raw = JSON.parse(fs.readFileSync(path.join(fleetsDir, file), 'utf8'));
    let payload = raw;
    if (raw && raw.data) payload = raw.data;
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries) {
      const fleet = entry && entry.data ? entry.data : entry;
      let cargo = '';
      let ammo = '';
      let fuel = '';
      if (fleet) {
        if (fleet.cargoHold) cargo = fleet.cargoHold;
        else if (fleet.cargo_hold) cargo = fleet.cargo_hold;
        if (fleet.ammoBank) ammo = fleet.ammoBank;
        else if (fleet.ammo_bank) ammo = fleet.ammo_bank;
        if (fleet.fuelTank) fuel = fleet.fuelTank;
        else if (fleet.fuel_tank) fuel = fleet.fuel_tank;
      }
      if (cargo) ownedOwners.add(cargo);
      if (ammo) ownedOwners.add(ammo);
      if (fuel) ownedOwners.add(fuel);
    }
  }
}

function toAmount(uiTokenAmount) {
  if (!uiTokenAmount) return 0;
  const amount = Number(uiTokenAmount.amount);
  const decimals = Number(uiTokenAmount.decimals);
  if (!Number.isFinite(amount)) return 0;
  if (!Number.isFinite(decimals)) return amount;
  if (decimals <= 0) return amount;
  return amount / Math.pow(10, decimals);
}

function hasDecodedName(op, target) {
  if (!Array.isArray(op.decoded)) return false;
  for (const d of op.decoded) {
    if (!d) continue;
    if (!d.name) continue;
    if (String(d.name) === target) return true;
  }
  return false;
}

const byMint = new Map();
const suspiciousExamples = [];
let depositOps = 0;

if (fs.existsSync(breakdownDir)) {
  for (const file of fs.readdirSync(breakdownDir)) {
    const raw = JSON.parse(fs.readFileSync(path.join(breakdownDir, file), 'utf8'));
    let payload = raw;
    if (raw && raw.data) payload = raw.data;
    const ops = Array.isArray(payload.ops) ? payload.ops : [];

    for (const op of ops) {
      if (!hasDecodedName(op, 'DepositCargoToFleet')) continue;
      depositOps += 1;

      const pre = op.txInfo && Array.isArray(op.txInfo.preTokenBalances) ? op.txInfo.preTokenBalances : [];
      const post = op.txInfo && Array.isArray(op.txInfo.postTokenBalances) ? op.txInfo.postTokenBalances : [];
      const preMap = new Map(pre.map((p) => [p.accountIndex, p]));
      const postMap = new Map(post.map((p) => [p.accountIndex, p]));
      const indexes = new Set([...preMap.keys(), ...postMap.keys()]);

      const rows = [];
      for (const idx of indexes) {
        const a = preMap.get(idx);
        const b = postMap.get(idx);
        if (!a) continue;
        if (!b) continue;

        const mint = a.mint;
        const owner = a.owner ? String(a.owner) : '';
        const delta = toAmount(b.uiTokenAmount) - toAmount(a.uiTokenAmount);
        if (delta === 0) continue;

        rows.push({ mint, owner, delta, isOwned: owner ? ownedOwners.has(owner) : false });

        if (!byMint.has(mint)) {
          byMint.set(mint, {
            mint,
            posOwned: 0,
            negOwned: 0,
            posExternal: 0,
            negExternal: 0,
            ops: 0
          });
        }

        const rec = byMint.get(mint);
        rec.ops += 1;
        const isOwned = owner ? ownedOwners.has(owner) : false;
        if (delta > 0) {
          if (isOwned) rec.posOwned += delta;
          else rec.posExternal += delta;
        } else {
          const amt = Math.abs(delta);
          if (isOwned) rec.negOwned += amt;
          else rec.negExternal += amt;
        }
      }

      const hasOwnedPositive = rows.some((r) => r.isOwned && r.delta > 0);
      const hasOwnedNegative = rows.some((r) => r.isOwned && r.delta < 0);
      if (hasOwnedPositive && !hasOwnedNegative) {
        suspiciousExamples.push({
          signature: op.signature ? String(op.signature) : '',
          file,
          decoded: Array.isArray(op.decoded) ? op.decoded.map((d) => (d && d.name ? String(d.name) : null)) : [],
          rows
        });
      }
    }
  }
}

const byMintOut = [...byMint.values()].sort((a, b) => {
  const av = Math.abs(a.posOwned) + Math.abs(a.negOwned) + Math.abs(a.posExternal) + Math.abs(a.negExternal);
  const bv = Math.abs(b.posOwned) + Math.abs(b.negOwned) + Math.abs(b.posExternal) + Math.abs(b.negExternal);
  return bv - av;
});

console.log(JSON.stringify({
  ownedOwnerCount: ownedOwners.size,
  depositOps,
  byMint: byMintOut,
  suspiciousExamples: suspiciousExamples.slice(0, 20)
}, null, 2));
