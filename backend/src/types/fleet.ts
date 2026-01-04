// Tipi condivisi per oggetti fleet con supporto campo error

export type FleetAccountData = {
  data: any;
  error?: {
    type: string;
    [key: string]: any;
  };
};
