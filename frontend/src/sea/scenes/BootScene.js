import Phaser from 'phaser';
import { loadShipSprites } from '../map/shipSprites.js';
import { loadIsleSprites } from '../map/isleSprites.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    loadShipSprites(this);
    loadIsleSprites(this);
  }

  create() {
    this.scene.start('map', this.game.registry.get('services'));
  }
}
