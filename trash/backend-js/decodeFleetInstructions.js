import { decodeInstructions } from '../decoders/decodeInstructions';
export async function decodeAllFleetInstructions(fleets) {
    // Supponiamo che ogni fleet abbia una lista di transazioni raw in fleet.transactions
    return fleets.map(fleet => ({
        ...fleet,
        decodedInstructions: decodeInstructions(fleet.transactions || [])
    }));
}
