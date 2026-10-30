function parseThreshold(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : 5;
}

function parseMinimumPct(value) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export class ScanPolicy {
  constructor() {
    this.reset();
  }

  reset() {
    this.previousFuelPct = null;
    this.forceAreaNext = false;
    this.pauseStrike = 0;
    this.resetCountsNext = false;
    this.lastScannedPct = null;
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

  observeScanResult(probabilityPct) {
    const parsed = Number(probabilityPct);
    this.lastScannedPct = Number.isFinite(parsed) ? parsed : null;
    return this.lastScannedPct;
  }

  takeRequestType(strikeThreshold = 5) {
    const forceArea = this.forceAreaNext;
    this.forceAreaNext = false;
    const threshold = parseThreshold(strikeThreshold);
    return forceArea || this.pauseStrike >= threshold ? 'area' : 'cell';
  }

  takeResetCounts() {
    const resetCounts = this.resetCountsNext;
    this.resetCountsNext = false;
    return resetCounts;
  }

  completeSelection({ requestType = 'cell', minimumPct = 0, scannedPct } = {}) {
    const effectiveScannedPct = scannedPct !== undefined
      ? (Number.isFinite(Number(scannedPct)) ? Number(scannedPct) : null)
      : this.lastScannedPct;
    this.lastScannedPct = null;

    if (requestType === 'area') {
      this.pauseStrike = 0;
      return this.pauseStrike;
    }

    const minPct = parseMinimumPct(minimumPct);
    const belowThreshold = effectiveScannedPct !== null && minPct > 0 && effectiveScannedPct < minPct;
    this.pauseStrike = belowThreshold ? this.pauseStrike + 1 : 0;
    return this.pauseStrike;
  }
}
