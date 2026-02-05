export function aggregateFleetStats(fleets) {
    let totalFees = 0;
    let sageFees = 0;
    let transactionCount = 0;
    let unknownOperations = 0;
    for (const fleet of fleets) {
        const txs = fleet.transactions || [];
        for (const tx of txs) {
            const fee = tx.fee || (tx.meta && tx.meta.fee) || 0;
            totalFees += Number(fee) || 0;
            if (tx.programIds && Array.isArray(tx.programIds) && tx.programIds.includes('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE')) {
                sageFees += Number(fee) || 0;
            }
            transactionCount++;
            const op = tx.operation || (tx.meta && tx.meta.operation);
            if (op === 'Unknown' || op === 'unknown')
                unknownOperations++;
        }
    }
    return { totalFees, sageFees, transactionCount, unknownOperations };
}
