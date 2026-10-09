export const starbaseSectorKey = (x, y) => `${x},${y}`;

export function starbaseSectorSet(starbases) {
  return new Set(starbases.map(({ sector }) => starbaseSectorKey(sector[0], sector[1])));
}

export function isStarbaseSector(position, sectors) {
  return sectors.has(starbaseSectorKey(position.x, position.y));
}