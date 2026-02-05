import fs from 'fs/promises';
import path from 'path';
import { setCache } from './cache';
function getCacheDir(profileId, namespace) {
    return path.join(process.cwd(), 'cache', profileId, namespace);
}
async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function extractFee(op) {
    if (!op)
        return 0;
    if (typeof op.txInfo?.fee === 'number')
        return op.txInfo.fee;
    if (typeof op.txInfo?.meta?.fee === 'number')
        return op.txInfo.meta.fee;
    if (typeof op.fee === 'number')
        return op.fee;
    return 0;
}
export async function buildFeesDetailed(profileId) {
    const breakdownDir = getCacheDir(profileId, 'fleet-breakdowns');
    const playerOpsDir = getCacheDir(profileId, 'player-ops');
    const unknownDir = getCacheDir(profileId, 'unknown');
    const fleetsDir = getCacheDir(profileId, 'fleets');
    const feesByFleet = {};
    const feesByOperation = {};
    // load fleets to detect isRented by checking rented-fleets folder presence
    const fleetFiles = await fs.readdir(fleetsDir).catch(() => []);
    const fleetSet = new Set(fleetFiles.map(f => f.replace(/\.json$/, '')));
    // process fleet-breakdowns
    const breakdownFiles = await fs.readdir(breakdownDir).catch(() => []);
    let totalSigs = 0;
    for (const bf of breakdownFiles) {
        const bpath = path.join(breakdownDir, bf);
        const raw = await readJson(bpath);
        if (!raw)
            continue;
        const payload = raw.data ?? raw;
        const fleet = payload.fleet;
        const ops = payload.ops || [];
        const fleetPk = fleet?.pubkey || bf.replace(/\.json$/, '');
        const fleetEntry = { totalFee: 0, totalOperations: 0, operations: {}, isRented: false };
        if (fleetSet.has(fleetPk)) {
            // check rented status by existence in rented-fleets
            const rentedPath = path.join(process.cwd(), 'cache', profileId, 'rented-fleets', `${fleetPk}.json`);
            const rentedExists = (await fs.stat(rentedPath).then(() => true).catch(() => false));
            fleetEntry.isRented = rentedExists;
        }
        for (const op of ops) {
            totalSigs += 1;
            const fee = extractFee(op);
            fleetEntry.totalFee += fee;
            fleetEntry.totalOperations += 1;
            const opName = (op.instructionName || op.instruction || 'Unknown').toString();
            if (!fleetEntry.operations[opName])
                fleetEntry.operations[opName] = { count: 0, totalFee: 0, details: [] };
            fleetEntry.operations[opName].count += 1;
            fleetEntry.operations[opName].totalFee += fee;
            // optional: keep small detail references
            fleetEntry.operations[opName].details.push({ signature: op.signature, fee });
            // aggregate global by operation
            if (!feesByOperation[opName])
                feesByOperation[opName] = { count: 0, totalFee: 0, details: [] };
            feesByOperation[opName].count += 1;
            feesByOperation[opName].totalFee += fee;
            feesByOperation[opName].details.push({ signature: op.signature, fee, fleet: fleetPk });
        }
        feesByFleet[fleetPk] = fleetEntry;
    }
    // process player-ops (unmatched) and unknown
    const extraDirs = [playerOpsDir, unknownDir];
    for (const dir of extraDirs) {
        const files = await fs.readdir(dir).catch(() => []);
        for (const f of files) {
            const p = path.join(dir, f);
            const raw = await readJson(p);
            if (!raw)
                continue;
            const op = raw.data ?? raw;
            totalSigs += 1;
            const fee = extractFee(op);
            const opName = (op.instructionName || op.instruction || 'Unknown').toString();
            if (!feesByOperation[opName])
                feesByOperation[opName] = { count: 0, totalFee: 0, details: [] };
            feesByOperation[opName].count += 1;
            feesByOperation[opName].totalFee += fee;
            feesByOperation[opName].details.push({ signature: op.signature, fee, fleet: null });
        }
    }
    const sageFees24h = Object.values(feesByFleet).reduce((s, f) => s + (f.totalFee || 0), 0) + Object.values(feesByOperation).reduce((s, o) => 0, 0);
    const payload = {
        feesByFleet,
        feesByOperation,
        sageFees24h,
        totalSignaturesFetched: totalSigs,
        transactionCount24h: totalSigs,
        fromCache: true
    };
    // persist payload in cache reports
    await setCache('reports', 'wallet-sage-fees-detailed', payload, profileId);
    return payload;
}
export default buildFeesDetailed;
