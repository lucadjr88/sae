import Phaser from 'phaser';
import { drawSea, SEA_DARK_HEX } from '../map/drawSea.js';
import { drawStarbases } from '../map/drawStarbases.js';
import { sectorToScreen, screenToSector, getRotation, setRotation } from '../map/iso.js';
import { fleetPosition } from '../model/fleetPosition.js';
import { starbaseSectorSet } from '../model/starbaseSectors.js';
import { scaleLabels } from '../map/labels.js';
import { FleetSprite } from '../entities/FleetSprite.js';

const ZOOM_MIN = 0.05;
const ZOOM_START = 0.5;
const ZOOM_MAX = 3;

export class MapScene extends Phaser.Scene {
  constructor() {
    super('map');
    this.sprites = new Map();
    this.fleets = new Map();
    this.selectedId = null;
  }

  init({ feed, hud, starbases }) {
    this.feed = feed;
    this.hud = hud;
    this.starbases = starbases;
    this.starbaseSectors = starbaseSectorSet(starbases);
  }

  create() {
    drawSea(this);
    const layer = drawStarbases(this, this.starbases);
    this.baseLabels = layer.labels;
    this.relayoutStarbases = layer.relayout;
    this.setupCamera();
    this.feed.on('snapshot', s => this.applySnapshot(s));
    if (this.feed.lastSnapshot) this.applySnapshot(this.feed.lastSnapshot);
    this.hud.on('select', id => this.select(id, true));
    this.hud.on('rotate', dir => this.rotateView(dir));
    this.input.keyboard.on('keydown-Q', () => this.rotateView(-1));
    this.input.keyboard.on('keydown-E', () => this.rotateView(1));
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(SEA_DARK_HEX);
    cam.setZoom(ZOOM_START);
    cam.centerOn(0, 0);
    this.centered = false;
    this.input.on('pointermove', p => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p, _o, _dx, dy) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), ZOOM_MIN, ZOOM_MAX));
    });
  }

  centerOnFleets() {
    const now = Date.now();
    const pts = [...this.fleets.values()].map(f => fleetPosition(f, now)).filter(Boolean);
    if (!pts.length) return;
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const s = sectorToScreen(x, y);
    this.cameras.main.centerOn(s.x, s.y);
    this.centered = true;
  }

  applySnapshot(snapshot) {
    const seen = new Set();
    for (const fleet of snapshot.fleets) {
      seen.add(fleet.id);
      this.fleets.set(fleet.id, fleet);
      if (!this.sprites.has(fleet.id)) this.sprites.set(fleet.id, new FleetSprite(this, fleet, this.starbaseSectors));
    }
    for (const id of [...this.sprites.keys()]) {
      if (seen.has(id)) continue;
      this.sprites.get(id).destroy();
      this.sprites.delete(id);
      this.fleets.delete(id);
    }
    if (!this.centered) this.centerOnFleets();
  }

  // Ruota di un quarto di giro mantenendo al centro dello schermo lo stesso punto della mappa.
  rotateView(dir) {
    const cam = this.cameras.main;
    const center = screenToSector(cam.midPoint.x, cam.midPoint.y);
    setRotation(getRotation() + dir);
    this.relayoutStarbases();
    const s = sectorToScreen(center.x, center.y);
    cam.centerOn(s.x, s.y);
  }

  select(id, focus) {
    this.sprites.get(this.selectedId)?.setSelected(false);
    this.selectedId = id;
    this.sprites.get(id)?.setSelected(true);
    this.hud.setSelected(id);
    if (!focus) return;
    const pos = fleetPosition(this.fleets.get(id), Date.now());
    if (pos) {
      const { x, y } = sectorToScreen(pos.x, pos.y);
      this.cameras.main.pan(x, y, 400);
    }
  }

  update() {
    const now = Date.now();
    const zoom = this.cameras.main.zoom;
    scaleLabels(this.baseLabels, zoom);
    scaleLabels([...this.sprites.values()].map(s => s.label), zoom);
    for (const [id, sprite] of this.sprites) {
      const pos = fleetPosition(this.fleets.get(id), now);
      sprite.setVisible(!!pos);
      if (pos) sprite.place(pos, zoom, this.fleets.get(id));
    }
    this.sprites.get(this.selectedId)?.setSelected(true);
  }
}
