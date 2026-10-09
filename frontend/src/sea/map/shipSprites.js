// Sprite generati da tools/build_ships.py (meta.json descrive ogni texture):
//   <modello>_sail (in movimento, con scia), <modello>_furled (ferma), <modello>_net<N> (scanning SDU, con rete).
// La direzione è il flip orizzontale: tutti gli sprite hanno la prua in basso a destra.
// Per classe nave (campo `size` dello snapshot): modelli possibili e larghezza a schermo.
export const SHIP_CLASSES = {
  xxSmall: { sprites: ['peschereccio'], width: 70 },
  xSmall: { sprites: ['sloop', 'ketch'], width: 85 },
  small: { sprites: ['cutter_war', 'lougre_grande'], width: 100 },
  medium: { sprites: ['small_brig', 'pink', 'spritsail_barge'], width: 120 },
  large: { sprites: ['barque', 'nave_della_neve'], width: 145 },
  capital: { sprites: ['sloop_guerra_grande'], width: 170 },
  commander: { sprites: ['sloop_guerra_grande'], width: 190 },
  titan: { sprites: ['sloop_guerra_grande'], width: 220 },
};
const DEFAULT_CLASS = 'small';

const classOf = fleet => SHIP_CLASSES[fleet.size] ?? SHIP_CLASSES[DEFAULT_CLASS];

// Tra i modelli della classe sceglie in modo stabile in base all'id della flotta.
export function shipLook(fleet) {
  const cls = classOf(fleet);
  let h = 0;
  for (const c of fleet.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { model: cls.sprites[h % cls.sprites.length], width: cls.width };
}

export const META_KEY = 'shipMeta';

export function loadShipSprites(scene) {
  scene.load.json(META_KEY, '/sea/assets/ships_clean/meta.json');
  scene.load.once(`filecomplete-json-${META_KEY}`, () => {
    for (const key of Object.keys(scene.cache.json.get(META_KEY).textures)) {
      scene.load.image(`ship_${key}`, `/sea/assets/ships_clean/${key}.png`);
    }
  });
}
