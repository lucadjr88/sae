export function resolveScanOperation(fleet, destination, movementMode = 'subwarp', now = Date.now()) {
  if (!fleet || !destination) return { status: 'unavailable', reason: 'missing_data' };

  if (fleet.state === 'Idle' && fleet.sector) {
    const atDestination = fleet.sector[0] === destination.x && fleet.sector[1] === destination.y;
    return { status: 'ready', action: atDestination ? 'scan' : movementMode === 'warp' ? 'warp_start' : 'subwarp_start' };
  }

  if (fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp') {
    const action = fleet.state === 'MoveWarp' ? 'warp_exit' : 'subwarp_exit';
    return fleet.arrival > now
      ? { status: 'waiting', action }
      : { status: 'ready', action };
  }

  return { status: 'unavailable', reason: 'fleet_state' };
}