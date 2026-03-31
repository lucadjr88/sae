// Minimal API call for getFleetInfoMinimal
//export async function getFleetInfoMinimal(rpcUrl: string, fleetId: string) {
  export async function getFleetInfoMinimal(fleetId: string) {
  //const url = `/api/getFleetInfoMinimal?rpcUrl=${encodeURIComponent(rpcUrl)}&fleetId=${encodeURIComponent(fleetId)}`;
  const url = `/api/getFleetInfoMinimal?fleetId=${encodeURIComponent(fleetId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
