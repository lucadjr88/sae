export class ScanPolicy {
  constructor() {
    this.reset();
  }

  reset() {
    this.previousFuelPct = null;
    this.forceAreaNext = false;
  }

  observeFuel(currentFuelPct, fuelMinimum) {
    const current = Number(currentFuelPct);
    const minimum = Number(fuelMinimum);
    if (!Number.isFinite(current) || !Number.isFinite(minimum)) return null;

    const crossedMinimum = this.previousFuelPct !== null
      && this.previousFuelPct > minimum
      && current <= minimum;
    const previous = this.previousFuelPct;
    this.previousFuelPct = current;
    if (!crossedMinimum) return null;

    this.forceAreaNext = true;
    return { previousFuelPct: previous, currentFuelPct: current };
  }

  takeRequestType() {
    const requestType = this.forceAreaNext ? 'area' : 'cell';
    this.forceAreaNext = false;
    return requestType;
  }
}