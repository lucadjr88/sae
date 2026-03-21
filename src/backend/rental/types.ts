export type FleetStarbase = 'mud' | 'oni' | 'ustur';

export interface RentalContract {
  address: string;
  owner: string;
  owner_profile: string;
  fleet: string;
  fleet_name?: string;
  fleet_composition?: string;
  fleet_ships?: string;
  starbase?: FleetStarbase;
  faction?: number;
  game_id: string;
  rate: number;
  duration_min: number;
  duration_max: number;
  payment_frequency: string;
  to_close: boolean;
  current_rental_state: string | null;
  rental_start_time?: number;
  rental_end_time?: number;
  owner_token_account: string;
  fuel_level?: number;
  fleet_position_x?: number;
  fleet_position_y?: number;
  // Campi aggiuntivi per allineamento SRLY
  crew_count?: number;
  rented_crew?: number;
  cargo_hold?: string;
  fuel_tank?: string;
  ammo_bank?: string;
  crew?: string;
  fuel_data?: any;
  cargo_data?: any;
  ammo_data?: any;
  crew_data?: any;
  stats?: {
    movement_stats: any;
    cargo_stats: any;
    misc_stats: any;
  };
  // Campi settore estratti da FleetState
  sector?: [string, string] | null;
  from_sector?: [string, string] | null;
  to_sector?: [string, string] | null;
  current_sector?: [string, string] | null;
}

export interface ActiveRental {
  address: string;
  borrower: string;
  thread: string;
  contract: string;
  owner_token_account: string;
  rate: number;
  start_time: number;
  end_time: number;
  cancelled: boolean;
}

export type ContractStateFilter = 'all' | 'available' | 'active';

export interface ContractQueryOptions {
  profileId?: string;
  q?: string;
  state?: ContractStateFilter;
  starbase?: FleetStarbase;
  minRate?: number;
  maxRate?: number;
  limit?: number;
  includeModules?: boolean;
}
