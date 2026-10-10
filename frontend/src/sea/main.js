import { SERVER } from './config.js';
import { FleetFeed } from './data/FleetFeed.js';
import { classifyStarbases } from './model/starbaseKind.js';
import { setRotation } from './map/iso.js';
import { Hud } from './ui/Hud.js';
import { BootScene } from './scenes/BootScene.js';
import { MapScene } from './scenes/MapScene.js';

const starbases = classifyStarbases(await fetch('/starbases').then(r => r.json()).catch(() => []));
setRotation(Number(new URLSearchParams(location.search).get('rot')) || 0);
const feed = new FleetFeed({ wsUrl: `ws://${location.host}${SERVER.wsPath}`, retryMs: SERVER.retryMs });
const hud = new Hud(document.getElementById('hud'), starbases);
feed.on('snapshot', s => hud.setSnapshot(s));
feed.on('status', s => hud.setConnection(s));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, MapScene],
});
game.registry.set('services', { feed, hud, starbases });

feed.start();
