import Phaser from 'phaser';
import { sectorToScreen } from '../map/iso.js';
import { shipLook, META_KEY } from '../map/shipSprites.js';
import { makeLabel } from '../map/labels.js';
import { shipTilt } from '../map/shipTilt.js';
import { isStarbaseSector, starbaseSectorKey } from '../model/starbaseSectors.js';
import { miningOrbit, mooringOffset } from './miningOrbit.js';

const DASH_PX = 10;
const GAP_PX = 7;
const NET_FRAME_MS = 3500;
const ISLE_RADIUS_RATIO = 0.55;
const DOCKED_SCALE = 0.5;
const SCALE_TRANSITION_MS = 700;
const DEPARTURE_TURN_MS = 350;

function pointOnRadius(center, radius, angle) {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export class FleetSprite {
  constructor(scene, fleet, starbaseSectors, starbaseWidths) {
    this.hovered = false;
    this.visible = true;
    this.look = shipLook(fleet);
    let hash = 0;
    for (const character of fleet.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    this.miningOffset = ((hash % 8) * Math.PI) / 4;
    this.mooringSlot = hash % 8;
    this.starbaseSectors = starbaseSectors;
    this.starbaseWidths = starbaseWidths;
    this.mooringAngles = new Map();
    this.mooringRadii = new Map();
    const defaultOffset = mooringOffset(1, this.mooringSlot);
    this.defaultMooringAngle = Math.atan2(defaultOffset.y, defaultOffset.x);
    this.meta = scene.cache.json.get(META_KEY);
    this.key = null;
    this.image = scene.add.image(0, 0, `ship_${this.look.model}_furled`);
    this.label = makeLabel(scene, fleet.name, { backgroundColor: '#000000aa', padding: { x: 12, y: 4 }, strokeThickness: 0 }).setOrigin(0.5, 1).setVisible(false);
    this.ring = scene.add.ellipse(0, 0, this.look.width * 0.8, this.look.width * 0.4).setStrokeStyle(2, 0xffe066).setVisible(false);
    this.route = scene.add.graphics().setDepth(5e5);
    this.image.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1, 1), Phaser.Geom.Rectangle.Contains);
    this.image.on('pointerover', () => this.setHovered(true));
    this.image.on('pointerout', () => this.setHovered(false));
    this.useTexture(`${this.look.model}_furled`);
  }

  // Texture di stato: scala, perno e area sensibile dipendono dalla texture (meta.json).
  useTexture(key) {
    if (key === this.key) return;
    this.key = key;
    const m = this.meta.textures[key];
    this.image.setTexture(`ship_${key}`).setOrigin(0.5, m.oy);
    this.scale = this.look.width / m.w;
    this.image.setScale(this.scale);
    this.top = m.top * this.scale;
    // Area sensibile attorno allo scafo, senza i margini trasparenti della scia.
    const H = this.image.height;
    this.image.input.hitArea.setTo(this.image.width / 2 - m.w / 2, m.oy * H - m.top, m.w, m.top + 0.15 * m.w);
  }

  textureFor(moving, scanning) {
    const model = this.look.model;
    if (moving) return `${model}_sail`;
    const nets = this.meta.models[model].nets;
    if (scanning && nets) return `${model}_net${Math.floor(Date.now() / NET_FRAME_MS) % nets}`;
    return `${model}_furled`;
  }

  setSelected(selected) {
    this.ring.setVisible(selected);
  }

  setHovered(hovered) {
    this.hovered = hovered;
    this.label.setVisible(hovered && this.visible);
    if (!hovered) this.route.clear();
  }

  // Linea tratteggiata dalla nave alla destinazione, con spessore e tratteggio costanti a schermo.
  drawRoute(from, to, zoom) {
    const g = this.route.clear();
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const dash = DASH_PX / zoom;
    const step = (DASH_PX + GAP_PX) / zoom;
    g.lineStyle(2 / zoom, 0xffffff, 0.9);
    for (let d = 0; d < len; d += step) {
      const e = Math.min(d + dash, len);
      g.lineBetween(from.x + (dx * d) / len, from.y + (dy * d) / len, from.x + (dx * e) / len, from.y + (dy * e) / len);
    }
    g.fillStyle(0xffffff, 0.9).fillCircle(to.x, to.y, 4 / zoom);
  }

  mooringRadius(key) {
    const savedRadius = this.mooringRadii.get(key);
    if (savedRadius !== undefined) return savedRadius;
    const isleWidth = this.starbaseWidths.get(key);
    return isleWidth ? isleWidth * ISLE_RADIUS_RATIO + this.look.width * 0.5 : this.look.width * 0.6;
  }

  mooringAngle(key) {
    return this.mooringAngles.get(key) ?? this.defaultMooringAngle;
  }

  // Gli sprite hanno la prua in basso a destra (verso chi guarda): si specchiano quando la nave va verso sinistra.
  // `pos` è il risultato di fleetPosition(); `zoom` serve a tenere l'etichetta a distanza costante dalla nave.
  place(pos, zoom, fleet) {
    const anchor = sectorToScreen(pos.x, pos.y);
    const mining = fleet.state === 'MineAsteroid';
    const orbit = mining ? miningOrbit(Date.now(), this.miningOffset) : null;
    const orbitRadius = this.look.width * 1.2;
    const inTransit = (fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp')
      && pos.progress !== null && fleet.from && fleet.to;
    const traveling = inTransit && pos.progress < 1;
    const arrived = (fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp') && pos.progress !== null && pos.progress >= 1;
    const parked = isStarbaseSector(pos, this.starbaseSectors)
      && (fleet.state === 'StarbaseLoadingBay' || fleet.state === 'Idle' || arrived);
    let position = anchor;
    let displayScale = parked ? DOCKED_SCALE : 1;
    let routeTarget = fleet.to ? sectorToScreen(fleet.to[0], fleet.to[1]) : null;

    if (inTransit) {
      const progress = clamp01(pos.progress);
      const from = sectorToScreen(fleet.from[0], fleet.from[1]);
      const to = sectorToScreen(fleet.to[0], fleet.to[1]);
      const fromKey = starbaseSectorKey(fleet.from[0], fleet.from[1]);
      const toKey = starbaseSectorKey(fleet.to[0], fleet.to[1]);
      const fromWidth = this.starbaseWidths.get(fromKey);
      const toWidth = this.starbaseWidths.get(toKey);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      const span = Math.max(1, fleet.arrival - fleet.departure);
      let lineStart = from;
      let lineStartProgress = 0;

      if (fromWidth && distance > 0) {
        const radius = this.mooringRadius(fromKey);
        const startRadius = Math.min(radius, distance * 0.45);
        const startAngle = this.mooringAngle(fromKey);
        const travelAngle = Math.atan2(dy, dx);
        const turn = angleDelta(startAngle, travelAngle);
        const dockPoint = pointOnRadius(from, startRadius, startAngle);
        const exitPoint = pointOnRadius(from, startRadius, travelAngle);
        const scaleProgress = Math.min(0.2, SCALE_TRANSITION_MS / span);
        const turnProgress = Math.min(0.15, DEPARTURE_TURN_MS / span);
        lineStartProgress = scaleProgress + turnProgress;

        if (progress < scaleProgress) {
          position = dockPoint;
          displayScale = lerp(DOCKED_SCALE, 1, progress / scaleProgress);
        } else if (progress < lineStartProgress) {
          const turnT = (progress - scaleProgress) / turnProgress;
          position = pointOnRadius(from, startRadius, startAngle + turn * turnT);
        } else {
          const moveT = clamp01((progress - lineStartProgress) / (1 - lineStartProgress));
          position = { x: lerp(exitPoint.x, to.x, moveT), y: lerp(exitPoint.y, to.y, moveT) };
        }
        lineStart = exitPoint;
      } else {
        position = { x: lerp(from.x, to.x, progress), y: lerp(from.y, to.y, progress) };
      }

      if (toWidth && distance > 0) {
        const pathDx = to.x - lineStart.x;
        const pathDy = to.y - lineStart.y;
        const pathLength = Math.hypot(pathDx, pathDy);
        if (pathLength > 0) {
          const radius = Math.min(this.mooringRadius(toKey), pathLength * 0.45);
          const targetProgress = lineStartProgress + (1 - lineStartProgress) * (1 - radius / pathLength);
          const angle = Math.atan2(-pathDy, -pathDx);
          const boundary = pointOnRadius(to, radius, angle);
          routeTarget = boundary;
          if (progress >= targetProgress) {
            position = boundary;
            const scaleStart = Math.max(targetProgress, 1 - Math.min(SCALE_TRANSITION_MS, span * 0.2) / span);
            displayScale = lerp(1, DOCKED_SCALE, clamp01((progress - scaleStart) / (1 - scaleStart)));
            this.mooringAngles.set(toKey, angle);
            this.mooringRadii.set(toKey, radius);
          }
        }
      }
    }

    if (parked) {
      const key = starbaseSectorKey(Math.round(pos.x), Math.round(pos.y));
      const radius = this.mooringRadius(key);
      const offset = pointOnRadius({ x: 0, y: 0 }, radius, this.mooringAngle(key));
      position = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      displayScale = DOCKED_SCALE;
    }

    const x = position.x + (orbit ? Math.cos(orbit.angle) * orbitRadius : 0);
    const y = position.y + (orbit ? Math.sin(orbit.angle) * orbitRadius : 0);
    const moving = traveling || !!orbit?.moving;
    const scanning = (fleet.state === 'Idle' && fleet.scanCooldownEnd > Date.now()) || (mining && !orbit.moving);
    this.useTexture(this.textureFor(moving, scanning));
    this.image.setScale(this.scale * displayScale);
    this.ring.setScale(displayScale);
    if (orbit) {
      const tangent = { x: -Math.sin(orbit.angle), y: Math.cos(orbit.angle) };
      this.image.setFlipX(tangent.x < 0).setRotation(shipTilt(tangent));
    } else if (pos.heading) {
      const v = sectorToScreen(...pos.heading);
      this.image.setFlipX(v.x < 0).setRotation(shipTilt(v));
    } else {
      this.image.setFlipX(false).setRotation(0);
    }
    this.image.setPosition(x, y).setDepth(y);
    this.ring.setPosition(x, y).setDepth(y - 1);
    this.label.setPosition(x, y - this.top * displayScale - 6 / zoom).setDepth(1e6);
    if (this.hovered && fleet.to && traveling) {
      this.drawRoute({ x, y }, routeTarget ?? sectorToScreen(fleet.to[0], fleet.to[1]), zoom);
    } else if (this.hovered) {
      this.route.clear();
    }
  }

  setVisible(v) {
    this.visible = v;
    this.image.setVisible(v);
    this.label.setVisible(v && this.hovered);
    if (!v) {
      this.ring.setVisible(false);
      this.route.clear();
    }
  }

  destroy() {
    this.image.destroy();
    this.label.destroy();
    this.ring.destroy();
    this.route.destroy();
  }
}
