export const ISLE_TEXTURES = ['isle01', 'isle02', 'isle03'];

export function loadIsleSprites(scene) {
  for (const name of ISLE_TEXTURES) scene.load.image(name, `/sea/assets/isles/${name}.png`);
}

// Isola deterministica per settore.
export function isleFor(sector) {
  const h = Math.abs(sector[0] * 73856093 ^ sector[1] * 19349663);
  return ISLE_TEXTURES[h % ISLE_TEXTURES.length];
}
