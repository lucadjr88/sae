import Phaser from 'phaser';
import { drawSea, SEA_DARK_HEX } from '../map/drawSea.js';
import { drawStarbases, ISLE_WIDTH } from '../map/drawStarbases.js';
import { sectorToScreen, screenToSector, getRotation, setRotation } from '../map/iso.js';
import { fleetPosition } from '../model/fleetPosition.js';
import { starbaseSectorKey, starbaseSectorSet } from '../model/starbaseSectors.js';
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

  init({ feed, hud, starbases, onMapReady }) {
    this.feed = feed;
    this.hud = hud;
    this.starbases = starbases;
    this.onMapReady = onMapReady;
    this.starbaseSectors = starbaseSectorSet(starbases);
    this.starbaseWidths = new Map(starbases.map(({ sector, kind }) => [
      starbaseSectorKey(sector[0], sector[1]), ISLE_WIDTH[kind] ?? ISLE_WIDTH.mrz,
    ]));
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
    this.hud.on('zoom', dir => this.zoomView(dir));
    this.input.keyboard.on('keydown-Q', () => this.rotateView(-1));
    this.input.keyboard.on('keydown-E', () => this.rotateView(1));
    this.onMapReady?.();
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
      this.zoomView(dy > 0 ? -1 : 1);
    });
  }

  zoomView(dir) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dir > 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX));
  }

  centerOnFirstFleet() {
    const fleet = [...this.fleets.values()].sort((a, b) => a.name.localeCompare(b.name))[0];
    const pos = fleet && fleetPosition(fleet, Date.now());
    if (!pos) return;
    const s = sectorToScreen(pos.x, pos.y);
    this.cameras.main.centerOn(s.x, s.y);
    this.centered = true;
  }

  applySnapshot(snapshot) {
    const seen = new Set();
    for (const fleet of snapshot.fleets) {
      seen.add(fleet.id);
      this.fleets.set(fleet.id, fleet);
      if (!this.sprites.has(fleet.id)) this.sprites.set(fleet.id, new FleetSprite(this, fleet, this.starbaseSectors, this.starbaseWidths));
    }
    for (const id of [...this.sprites.keys()]) {
      if (seen.has(id)) continue;
      this.sprites.get(id).destroy();
      this.sprites.delete(id);
      this.fleets.delete(id);
    }
    if (!this.centered) this.centerOnFirstFleet();
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
