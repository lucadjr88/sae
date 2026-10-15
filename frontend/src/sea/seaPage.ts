import Phaser from 'phaser';
import bs58 from 'bs58';
import { FleetFeed } from './data/FleetFeed.js';
import { classifyStarbases } from './model/starbaseKind.js';
import { Hud } from './ui/Hud.js';
import { wallet } from '../services/wallet.js';
import { BootScene } from './scenes/BootScene.js';
import { MapScene } from './scenes/MapScene.js';
import { setRotation } from './map/iso.js';
import './sea.css';

const form = document.querySelector<HTMLFormElement>('#profile-form');
const profileInput = document.querySelector<HTMLInputElement>('#profile-id');
const profileError = document.querySelector<HTMLDivElement>('#profile-error');
const loader = document.querySelector<HTMLDivElement>('#sea-loader');
const initialProfileId = new URLSearchParams(location.search).get('profileId') ?? '';
const returnLink = document.querySelector<HTMLAnchorElement>('.sea-topbar__link');

returnLink?.addEventListener('click', event => {
  try {
    if (history.length > 1 && new URL(document.referrer).origin === location.origin) {
      event.preventDefault();
      history.back();
    }
  } catch {
    return;
  }
});

if (profileInput) profileInput.value = initialProfileId;
if (!initialProfileId && loader) loader.hidden = true;

async function startMap(profileId: string) {
  if (!form) return;
  if (loader) loader.hidden = false;
  form.hidden = true;
  const starbases = classifyStarbases(await fetch('/api/sea/starbases').then(response => {
    if (!response.ok) throw new Error('starbases unavailable');
    return response.json();
  }).catch(() => []));
  setRotation(Number(new URLSearchParams(location.search).get('rot')) || 0);
  const feed = new FleetFeed({ profileId, pollMs: 15000 });
  const hud = new Hud(document.querySelector<HTMLElement>('#hud'), starbases, wallet);
  feed.on('snapshot', snapshot => hud.setSnapshot(snapshot));
  feed.on('status', status => hud.setConnection(status));
  let resolveMapReady: () => void = () => {};
  const mapReady = new Promise<void>(resolve => { resolveMapReady = resolve; });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, MapScene],
  });
  game.registry.set('services', { feed, hud, starbases, onMapReady: resolveMapReady });
  await Promise.all([feed.start(), mapReady]);
  if (loader) loader.hidden = true;
  window.addEventListener('pagehide', () => {
    feed.stop();
    hud.destroy();
    game.destroy(true);
  }, { once: true });
}

form?.addEventListener('submit', event => {
  event.preventDefault();
  const value = profileInput?.value.trim() ?? '';
  try {
    if (bs58.decode(value).length !== 32) throw new Error('invalid profile id');
    const profileId = value;
    history.replaceState(null, '', `/pages/sea.html?profileId=${encodeURIComponent(profileId)}`);
    if (profileError) profileError.textContent = '';
    startMap(profileId);
  } catch {
    if (loader) loader.hidden = true;
    if (profileError) profileError.textContent = 'Player Profile ID non valido';
  }
});

if (initialProfileId) form?.requestSubmit();