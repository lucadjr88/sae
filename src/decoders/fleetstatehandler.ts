/**
 * FleetStateHandler Enrichment Module
 * 
 * Arricchisce le operazioni FleetStateHandler estraendo lo state type
 * dai log delle transazioni e aggiungendolo al nome dell'operazione.
 * 
 * Flusso:
 * 1. Operazione riconosciuta come "FleetStateHandler"
 * 2. Leggere i logMessages dalla transazione (già disponibili in txInfo)
 * 3. Estrarre il "Current state:" pattern
 * 4. Rinominare l'operazione: FleetStateHandler_[StateType]
 */

/**
 * Tipi di stato riconosciuti nei FleetStateHandler
 */
export enum FleetStateType {
  MineAsteroid = 'MineAsteroid',
  MoveSubwarp = 'MoveSubwarp',
  Idle = 'Idle',
  Unknown = 'Unknown',
}

/**
 * Interfaccia per operazione arricchita
 */
export interface EnrichedFleetStateHandler {
  originalName: string;
  enrichedName: string;
  stateType: FleetStateType;
  stateData?: Record<string, any>;
  txSignature?: string;
  blockTime?: number;
  timestamp?: number;
}

/**
 * Estrae il tipo di state da un log message
 * 
 * Pattern: "Program log: Current state: MineAsteroid(...)" 
 *          "Program log: Current state: MoveSubwarp(...)"
 *          "Program log: Current state: Idle(...)"
 * 
 * @param logMessage - Singolo log message
 * @returns FleetStateType
 */
export function extractStateTypeFromLog(logMessage: string): FleetStateType {
  const statePattern = /Program log: Current state: (\w+)\(/;
  const match = logMessage.match(statePattern);

  if (match && match[1]) {
    const stateType = match[1];
    
    if (Object.values(FleetStateType).includes(stateType as FleetStateType)) {
      return stateType as FleetStateType;
    }
  }

  return FleetStateType.Unknown;
}

/**
 * Estrae i dettagli dello state da un log message
 * 
 * @param logMessage - Singolo log message
 * @returns Object con i parametri dello state
 */
export function extractStateDetailsFromLog(logMessage: string): Record<string, any> {
  const details: Record<string, any> = {};

  // Pattern generico per estrarre il contenuto dentro le parentesi
  const contentPattern = /Program log: Current state: \w+\((.*)\)/;
  const match = logMessage.match(contentPattern);

  if (match && match[1]) {
    const content = match[1];

    // Parse per MineAsteroid
    if (content.includes('asteroid:')) {
      details.type = 'MineAsteroid';
      const asteroidMatch = content.match(/asteroid: ([^,]+)/);
      const resourceMatch = content.match(/resource: ([^,]+)/);
      const amountMinedMatch = content.match(/amount_mined: (\d+)/);
      
      if (asteroidMatch) details.asteroid = asteroidMatch[1].trim();
      if (resourceMatch) details.resource = resourceMatch[1].trim();
      if (amountMinedMatch) details.amount_mined = parseInt(amountMinedMatch[1]);
    }

    // Parse per MoveSubwarp
    if (content.includes('from_sector:')) {
      details.type = 'MoveSubwarp';
      const fromMatch = content.match(/from_sector: \[(.*?)\]/);
      const toMatch = content.match(/to_sector: \[(.*?)\]/);
      const fuelMatch = content.match(/fuel_expenditure: (\d+)/);
      
      if (fromMatch) details.from_sector = fromMatch[1];
      if (toMatch) details.to_sector = toMatch[1];
      if (fuelMatch) details.fuel_expenditure = parseInt(fuelMatch[1]);
    }

    // Parse per Idle
    if (content.includes('sector:') && !content.includes('from_sector')) {
      details.type = 'Idle';
      const sectorMatch = content.match(/sector: \[(.*?)\]/);
      if (sectorMatch) details.sector = sectorMatch[1];
    }
  }

  return details;
}

/**
 * Estrae lo state type dai log messages di una transazione
 * 
 * @param logMessages - Array di log messages
 * @returns FleetStateType
 */
export function extractStateTypeFromLogs(logMessages: string[]): FleetStateType {
  for (const log of logMessages) {
    if (log.includes('Program log: Current state:')) {
      const stateType = extractStateTypeFromLog(log);
      if (stateType !== FleetStateType.Unknown) {
        return stateType;
      }
    }
  }

  return FleetStateType.Unknown;
}

/**
 * Estrae TUTTI i dettagli dello state dai log messages
 * 
 * @param logMessages - Array di log messages
 * @returns Object con i parametri dello state
 */
export function extractStateDetailsFromLogs(
  logMessages: string[]
): Record<string, any> {
  for (const log of logMessages) {
    if (log.includes('Program log: Current state:')) {
      const details = extractStateDetailsFromLog(log);
      if (Object.keys(details).length > 0) {
        return details;
      }
    }
  }

  return {};
}

/**
 * Arricchisce un'operazione FleetStateHandler
 * 
 * Questo è il metodo principale da chiamare nel flusso di decoding.
 * 
 * @param operationName - Nome dell'operazione (es. "FleetStateHandler")
 * @param logMessages - Log messages dalla transazione
 * @param txSignature - Signature della transazione (opzionale)
 * @param blockTime - Block time della transazione (opzionale)
 * @returns EnrichedFleetStateHandler
 */
export function enrichFleetStateHandler(
  operationName: string,
  logMessages: string[],
  txSignature?: string,
  blockTime?: number
): EnrichedFleetStateHandler {
  const stateType = extractStateTypeFromLogs(logMessages);
  const stateData = extractStateDetailsFromLogs(logMessages);

  const enrichedName =
    stateType !== FleetStateType.Unknown
      ? `${operationName}_${stateType}`
      : operationName;

  return {
    originalName: operationName,
    enrichedName,
    stateType,
    stateData: Object.keys(stateData).length > 0 ? stateData : undefined,
    txSignature,
    blockTime,
    timestamp: blockTime ? blockTime * 1000 : undefined, // Convert to ms
  };
}

/**
 * Applicare l'arricchimento a un'operazione decodificata
 * 
 * @param decodedOp - Operazione decodificata
 * @param logMessages - Log messages dalla transazione
 * @returns Operazione con nome arricchito
 */
export function applyEnrichmentToOperation(
  decodedOp: any,
  logMessages: string[]
): any {
  if (decodedOp.name !== 'FleetStateHandler') {
    return decodedOp;
  }

  const enriched = enrichFleetStateHandler(
    decodedOp.name,
    logMessages,
    decodedOp.txSignature,
    decodedOp.blockTime
  );

  return {
    ...decodedOp,
    name: enriched.enrichedName,
    originalName: enriched.originalName,
    stateType: enriched.stateType,
    stateDetails: enriched.stateData,
  };
}
