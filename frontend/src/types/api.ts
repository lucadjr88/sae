// public/js/types/api.ts

import { FeesByFleet } from './operation-list';

export interface FleetsRequest {
  profileId: string;
}

export interface FleetData {
  key: string;
  callsign: string;
  data: {
    fleetShips: string;
    fuelTank?: string;
    ammoBank?: string;
    cargoHold?: string;
  };
  isRented?: boolean;
}

export interface FleetsResponse {
  walletAuthority: string;
  fleets: FleetData[];
}

export interface WalletSageFeesStreamRequest {
  walletPubkey: string;
  fleetAccounts: string[];
  fleetNames: { [account: string]: string };
  fleetRentalStatus: { [account: string]: boolean };
  hours: number;
  enableSubAccountMapping: boolean;
}

export interface FleetBreakdownRequest {
  walletPubkey: string;
  fleetAccounts: string[];
  fleetNames: { [account: string]: string };
  fleetRentalStatus: { [account: string]: boolean };
  enableSubAccountMapping: boolean;
}

export interface FleetBreakdownResponse {
  feesByFleet: FeesByFleet;
}

export type ApiError =
  | { type: 'http'; status: number; message: string }
  | { type: 'network'; error: Error }
  | { type: 'parse'; cause: unknown };

export interface ApiEndpoint<TReq, TRes> {
  path: string;
  method: 'GET' | 'POST';
  req: TReq;
  res: TRes;
}