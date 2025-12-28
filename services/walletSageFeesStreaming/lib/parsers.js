// Pure function: parseSageTransaction
// Extracts operation, crafting, and material info from a transaction object
// No side-effects, no dependencies on global state
export function parseSageTransaction(tx, OP_MAP, SAGE_PROGRAM_ID) {
    let operation = 'Unknown';
    let isCrafting = false;
    let craftingMaterial = undefined;
    let craftingType = undefined;
    let hasSageInstruction = false;
    if (tx.instructions && tx.instructions.length > 0) {
        for (const instr of tx.instructions) {
            // decodeSageInstruction must be injected as a pure function in orchestrator
            // fallback legacy
            if (OP_MAP[instr]) {
                operation = OP_MAP[instr];
                hasSageInstruction = true;
                if (operation === 'Crafting')
                    isCrafting = true;
                break;
            }
            if (/craft/i.test(instr)) {
                operation = 'Crafting';
                isCrafting = true;
                hasSageInstruction = true;
                break;
            }
        }
    }
    // Skip ONLY pure non-SAGE transactions (no SAGE program ID at all)
    if (!tx.programIds.includes(SAGE_PROGRAM_ID)) {
        return { operation, isCrafting, craftingMaterial, craftingType, hasSageInstruction };
    }
    // 2. Pattern matching su logMessages (fallback for Unknown operations)
    if (operation === 'Unknown' && tx.logMessages) {
        for (const log of tx.logMessages) {
            const ixMatch = log.match(/Instruction:\s*(\w+)/);
            if (ixMatch) {
                const ixName = ixMatch[1];
                if (OP_MAP[ixName]) {
                    operation = OP_MAP[ixName];
                    hasSageInstruction = true;
                    if (operation.includes('Craft'))
                        isCrafting = true;
                    break;
                }
            }
        }
    }
    // 2b. Additional crafting detection
    if (!isCrafting && tx.logMessages) {
        for (const log of tx.logMessages) {
            if (/craft/i.test(log)) {
                operation = 'Crafting';
                isCrafting = true;
                hasSageInstruction = true;
                break;
            }
        }
    }
    // 2c. Enhanced FleetStateHandler detection for Subwarp/Mining completion
    if (operation === 'FleetStateHandler' && tx.logMessages) {
        const logsJoined = tx.logMessages.join(' ');
        if (logsJoined.includes('MoveSubwarp')) {
            operation = 'StopSubwarp';
        }
        else if (logsJoined.includes('MineAsteroid')) {
            operation = 'StopMining';
        }
    }
    // 3. Parsing innerInstructions per materiali (migliorato)
    // ...estrazione materiali da innerInstructions demandata a orchestratore o altra funzione...
    return { operation, isCrafting, craftingMaterial, craftingType, hasSageInstruction };
}
