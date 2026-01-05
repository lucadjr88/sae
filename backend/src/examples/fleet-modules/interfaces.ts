// Interfacce per i moduli di modularizzazione getFleets

export interface FleetContext {
  fleets: any[];
  knownFleetKeys: Set<string>;
  walletAuthority: string | null;
  feePayerScannedDuringDerivation: boolean;
  primaryPayerCounts: Array<[string, number]>;
  fallbackPayerCounts: Array<[string, number]>;
  walletHeuristicKeys: Set<string>;
  srslyHeuristicKeys: Set<string>;
  operatedByWalletKeys: Set<string>;
  anchorConnection: any;
  poolConnection: any;
}

export interface FleetConnectionSetupInput {
  anchorConnOrEndpoint: any; // Connection | string
  poolConnOrWebsocket: any; // RpcPoolConnection | Connection | string
  walletPath: string;
  profileId: string;
}

export interface FleetConnectionSetupOutput {
  provider: any; // AnchorProvider
  sageProgram: any; // Program
  wallet: any; // Keypair
  playerProfilePubkey: any; // PublicKey
  context: FleetContext; // Inizializzato con connessioni
}

export interface FleetFetcherInput {
  sageProgram: any;
  playerProfilePubkey: any;
  connection: any;
}

export interface FleetFetcherOutput {
  ownedFleets: any[];
  rentedFleets: any[];
}

export interface WalletAuthorityDeriverInput {
  fleets: any[];
  connection: any;
  playerProfilePubkey: any;
  cacheProfileId?: string;
}

export interface WalletAuthorityDeriverOutput {
  walletAuthority: string | null;
  primaryPayerCounts: Array<[string, number]>;
  fallbackPayerCounts: Array<[string, number]>;
  feePayerScannedDuringDerivation: boolean;
}

export interface WalletTransactionScannerInput {
  walletAuthority: string | null;
  connection: any;
  knownFleetKeys: Set<string>;
  sageProgram: any;
  cacheProfileId?: string;  // Profile ID to use for cache (defaults to walletAuthority)
}

export interface WalletTransactionScannerOutput {
  additionalFleets: any[];
  walletHeuristicKeys: Set<string>;
  operatedByWalletKeys: Set<string>;
}

export interface SrslyRentalScannerInput {
  playerProfilePubkey: any;
  connection: any;
  knownFleetKeys: Set<string>;
  sageProgram: any;
  cacheProfileId?: string;
}

export interface SrslyRentalScannerOutput {
  srslyFleets: any[];
  srslyHeuristicKeys: Set<string>;
}

export interface FleetProcessorInput {
  fleets: any[];
  playerProfilePubkey: any;
  walletAuthority: string | null;
  walletHeuristicKeys: Set<string>;
  srslyHeuristicKeys: Set<string>;
  operatedByWalletKeys: Set<string>;
  connection: any;
  cacheProfileId?: string;
}

export interface FleetProcessorOutput {
  fleetsData: any[];
}

export interface FleetResult {
  fleets: any[];
  walletAuthority: string | null;
  _feePayerScannedDuringDerivation: boolean;
}