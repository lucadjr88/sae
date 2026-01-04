export interface TxMeta {
  operation: string;
  groupedOperation: string;
  isCrafting: boolean;
  craftingType?: string;
  craftingMaterial?: string;
  involvedFleetKey?: string;
  involvedFleetName?: string;
  hasSageInstruction: boolean;
}

export interface CraftingExtra {
  decodedRecipe?: { kind: string; data: any };
  craftingMaterial?: string;
  craftingType?: string;
  craftingAction?: string;
}

import { FeesByFleet, FeesByOperation } from './operation-list';

export interface AggregatorState {
  feesByFleet: FeesByFleet;
  feesByOperation: FeesByOperation;
  totalFees24h: number;
  sageFees24h: number;
  processedTransactions: any[];
  unknownOperations: number;
}

export interface PartialResult {
  type: string;
  stage: string;
  message: string;
  processed: number;
  total: number;
  percentage: string;
  batchTime: string;
  currentDelay: number;
  walletAddress: string;
  period: string;
  totalFees24h: number;
  sageFees24h: number;
  transactionCount24h: number;
  totalSignaturesFetched: number;
  feesByFleet: any;
  feesByOperation: any;
  unknownOperations: number;
  rentedFleetAccounts: string[];
  fleetAccountNamesEcho: { [account: string]: string };
  fleetRentalStatusFinal: { [account: string]: boolean };
}