// Modulo per setup configurazione e costanti per streaming fees
// Estrae la logica di inizializzazione dalla funzione monolitica

import { TransactionInfo } from '../types.js';
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';
import { Connection } from '@solana/web3.js';
import OP_MAP from '../op-map.js';
import {
  StreamingFeesSetupInput,
  StreamingFeesSetupOutput,
  StreamingFeesContext,
  StreamingFeesConfig,
  StreamingFeesConstants,
  FleetFeeData,
  OperationFeeData
} from './interfaces.js';

/**
 * Setup configurazione e costanti per streaming fees analysis
 * Estrae tutta la logica di inizializzazione dalla funzione monolitica
 */
export async function setupStreamingFees(input: StreamingFeesSetupInput): Promise<StreamingFeesSetupOutput> {
  const {
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    fleetAccounts,
    fleetAccountNames = {},
    fleetRentalStatus = {},
    hours = 24,
    maxTransactions = 3000,
    cachedData,
    lastProcessedSignature
  } = input;

  // === CONFIGURAZIONE ===
  const config: StreamingFeesConfig = {
    rpcEndpoint,
    rpcWebsocket,
    walletPubkey,
    fleetAccounts,
    fleetAccountNames,
    fleetRentalStatus,
    hours,
    maxTransactions,
    batchSize: 150,
    cutoffTime: Date.now() - (hours * 60 * 60 * 1000),
    excludeAccounts: [
      'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
      'GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr',
      '11111111111111111111111111111111',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ]
  };

  // === COSTANTI ===
  const constants: StreamingFeesConstants = {
    SAGE_PROGRAM_ID: 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
    CRAFT_PROGRAM_ID: 'CRAFT2RPXPJWCEix4WpJST3E7NLf79GTqZUL75wngXo5',
    MATERIALS: {
      'MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog': 'Biomass',
      'foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG': 'Food',
      'fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim': 'Fuel',
      'HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp': 'Hydrogen',
    },
    OP_MAP,
    // Parametri rate limiting
    MIN_DELAY: 70,
    MAX_DELAY: 5000,
    BACKOFF_MULTIPLIER: 1.5,
    SUCCESS_PROBE_WINDOW: 25,
    SUCCESS_DECREASE_STEP: 5,
    JITTER_PCT: 0.10,
    MAX_RETRIES: 5
  };

  // === GESTIONE INCREMENTALE/CACHE ===
  const isIncrementalUpdate = !!(cachedData && lastProcessedSignature);

  // === INIZIALIZZAZIONE STATO CONDIVISO ===
  const context: StreamingFeesContext = {
    config,
    constants,

    // Stato accumulato durante processing
    feesByFleet: isIncrementalUpdate && cachedData ? { ...cachedData.feesByFleet } : {},
    feesByOperation: isIncrementalUpdate && cachedData ? { ...cachedData.feesByOperation } : {},
    processedTransactions: [],
    totalFees24h: isIncrementalUpdate && cachedData ? (cachedData.totalFees24h || 0) : 0,
    sageFees24h: isIncrementalUpdate && cachedData ? (cachedData.sageFees24h || 0) : 0,
    unknownOperations: 0,
    rentedFleets: new Set<string>(),

    // Connessioni riutilizzate
    sharedPoolConnection: new RpcPoolConnection(new Connection(rpcEndpoint, 'confirmed')),

    // Cache e progress
    cacheSavePromises: [],
    isIncrementalUpdate
  };

  // === FILTRO FLEET ACCOUNTS ===
  const specificFleetAccounts = fleetAccounts.filter(account =>
    account &&
    !config.excludeAccounts.includes(account) &&
    account.length > 40
  );

  return {
    context,
    specificFleetAccounts
  };
}