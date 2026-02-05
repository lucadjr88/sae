import { CraftingDetail } from './details';

export interface OperationStats {
  count: number;
  totalFee: number;
  avgFee?: number;
  percentageOfFleet?: number;
  details?: CraftingDetail[];
}

export interface FleetFeeData {
  totalFee: number;
  feePercentage?: number;
  totalOperations: number;
  isRented?: boolean;
  operations: { [operationName: string]: OperationStats };
}

export interface FeesByFleet {
  [fleetAccount: string]: FleetFeeData;
}

export interface OperationSummary {
  count: number;
  totalFee: number;
  avgFee?: number;
  details?: CraftingDetail[];
}

export interface FeesByOperation {
  [operationName: string]: OperationSummary;
}

export interface FleetOperationInfo {
  fleetAccount: string;
  fleetName: string;
  isRented: boolean;
  count: number;
  totalFee: number;
  percentageOfFleet: number;
}

export interface OperationFleetMap {
  [operationName: string]: FleetOperationInfo[];
}

export interface OperationListData {
  feesByFleet: FeesByFleet;
  feesByOperation: FeesByOperation;
  sageFees24h: number;
}

