// Interfacce per la modularizzazione di getWalletSageFeesDetailedStreaming
// Definisce contratti TypeScript per input/output di ogni modulo

import { TransactionInfo } from '../types.js';
import { RpcPoolConnection } from '../../utils/rpc/pool-connection.js';

// === STATO CONDIVISO ===
export interface StreamingFeesContext {
  // Configurazione iniziale
  config: StreamingFeesConfig;
  constants: StreamingFeesConstants;

  // Stato accumulato durante processing
  feesByFleet: Record<string, FleetFeeData>;
  feesByOperation: Record<string, OperationFeeData>;
  processedTransactions: TransactionInfo[];
  totalFees24h: number;
  sageFees24h: number;
  unknownOperations: number;
  rentedFleets: Set<string>;

  // Connessioni riutilizzate
  sharedPoolConnection: RpcPoolConnection;

  // Cache e progress
  cacheSavePromises: Promise<void>[];
  isIncrementalUpdate: boolean;
}

// === CONFIGURAZIONE ===
export interface StreamingFeesConfig {
  rpcEndpoint: string;
  rpcWebsocket: string;
  walletPubkey: string;
  fleetAccounts: string[];
  fleetAccountNames: Record<string, string>;
  fleetRentalStatus: Record<string, boolean>;
  hours: number;
  maxTransactions: number;
  batchSize: number;
  cutoffTime: number;
  excludeAccounts: string[];
}

export interface StreamingFeesConstants {
  SAGE_PROGRAM_ID: string;
  CRAFT_PROGRAM_ID: string;
  MATERIALS: Record<string, string>;
  OP_MAP: Record<string, string>;
  // Parametri rate limiting
  MIN_DELAY: number;
  MAX_DELAY: number;
  BACKOFF_MULTIPLIER: number;
  SUCCESS_PROBE_WINDOW: number;
  SUCCESS_DECREASE_STEP: number;
  JITTER_PCT: number;
  MAX_RETRIES: number;
}

// === DATI FEE ===
export interface FleetFeeData {
  totalFee: number;
  feePercentage: number;
  totalOperations: number;
  operations: Record<string, FleetOperationData>;
  isRented: boolean;
}

export interface FleetOperationData {
  count: number;
  totalFee: number;
  avgFee: number;
  percentageOfFleet: number;
  details: CraftingDetail[];
}

export interface OperationFeeData {
  count: number;
  totalFee: number;
  avgFee: number;
  details: CraftingDetail[];
}

export interface CraftingDetail {
  action?: string;
  type?: string;
  displayType?: string;
  fee: number;
  material?: string;
  txid: string;
  fleet?: string;
  decodedKind?: string;
  decodedData?: any;
}

// === INTERFACCE MODULO: SETUP ===
export interface StreamingFeesSetupInput {
  rpcEndpoint: string;
  rpcWebsocket: string;
  walletPubkey: string;
  fleetAccounts: string[];
  fleetAccountNames?: Record<string, string>;
  fleetRentalStatus?: Record<string, boolean>;
  hours?: number;
  maxTransactions?: number;
  cachedData?: any;
  lastProcessedSignature?: string;
}

export interface StreamingFeesSetupOutput {
  context: StreamingFeesContext;
  specificFleetAccounts: string[];
}

// === INTERFACCE MODULO: SIGNATURE FETCHER ===
export interface SignatureFetcherInput {
  walletPubkey: string;
  hours: number;
  cutoffTime: number;
  maxTransactions: number;
  rpcEndpoint: string;
  rpcWebsocket: string;
}

export interface SignatureFetcherOutput {
  allTransactions: TransactionInfo[];
  totalSignaturesFetched: number;
}

// === INTERFACCE MODULO: TRANSACTION BATCH PROCESSOR ===
export interface TransactionBatchProcessorInput {
  batch: TransactionInfo[];
  context: StreamingFeesContext;
  sendUpdate: (data: any) => void;
  saveProgress?: (partialResult: any) => Promise<void>;
}

export interface TransactionBatchProcessorOutput {
  processedCount: number;
  feesUpdates: Record<string, FleetFeeData>;
  operationUpdates: Record<string, OperationFeeData>;
  newTransactions: TransactionInfo[];
}

// === INTERFACCE MODULO: SAGE INSTRUCTION PARSER ===
export interface SageInstructionParserInput {
  transaction: TransactionInfo;
  opMap: Record<string, string>;
}

export interface SageInstructionParserOutput {
  operation: string;
  isCrafting: boolean;
  hasSageInstruction: boolean;
  craftingType?: string;
}

// === INTERFACCE MODULO: CRAFTING DETECTOR ===
export interface CraftingDetectorInput {
  transaction: TransactionInfo;
  operation: string;
  isCrafting: boolean;
  sageProgramId: string;
  materials: Record<string, string>;
}

export interface CraftingDetectorOutput {
  craftingMaterial?: string;
  craftingAction?: string;
  craftingType?: string;
  decodedRecipe?: any;
  enhancedOperation: string;
}

// === INTERFACCE MODULO: RECIPE DECODER ===
export interface RecipeDecoderInput {
  transaction: TransactionInfo;
  sharedPoolConnection: RpcPoolConnection;
  craftProgramId: string;
  excludeAccounts: string[];
}

export interface RecipeDecoderOutput {
  decodedRecipe?: {
    kind: 'recipe' | 'process' | 'item';
    data: any;
  };
  craftingMaterial?: string;
  craftingType?: string;
}

// === INTERFACCE MODULO: FLEET ASSOCIATOR ===
export interface FleetAssociatorInput {
  transaction: TransactionInfo;
  operation: string;
  fleetAccounts: string[];
  fleetAccountNames: Record<string, string>;
  excludeAccounts: string[];
}

export interface FleetAssociatorOutput {
  involvedFleetName?: string;
  involvedFleetAccount?: string;
}

// === INTERFACCE MODULO: FEE AGGREGATOR ===
export interface FeeAggregatorInput {
  transaction: TransactionInfo;
  operation: string;
  involvedFleetName?: string;
  craftingDetails?: CraftingDetectorOutput;
  sageProgramId: string;
}

export interface FeeAggregatorOutput {
  feesByFleetUpdate: Record<string, FleetFeeData>;
  feesByOperationUpdate: Record<string, OperationFeeData>;
}

// === INTERFACCE MODULO: CRAFTING PAIRER ===
export interface CraftingPairerInput {
  processedTransactions: TransactionInfo[];
  timeWindowMs?: number;
}

export interface CraftingPairerOutput {
  mergedTransactions: TransactionInfo[];
  pairedCount: number;
}

// === INTERFACCE MODULO: RESULT BUILDER ===
export interface ResultBuilderInput {
  context: StreamingFeesContext;
  allTransactions: TransactionInfo[];
  totalSignaturesFetched: number;
  mergedTransactions: TransactionInfo[];
  walletPubkey: string;
  hours: number;
}

export interface ResultBuilderOutput {
  type: 'complete';
  walletAddress: string;
  period: string;
  totalFees24h: number;
  sageFees24h: number;
  transactionCount24h: number;
  totalSignaturesFetched: number;
  feesByFleet: Record<string, any>;
  feesByOperation: Record<string, any>;
  transactions: TransactionInfo[];
  unknownOperations: number;
  rentedFleetAccounts: string[];
  fleetAccountNamesEcho: Record<string, string>;
  fleetRentalStatusFinal: Record<string, boolean>;
}

// === TIPI UTILITY ===
export type CraftingAction = 'crafting_start' | 'crafting_claim' | 'unknown';
export type RecipeKind = 'recipe' | 'process' | 'item';