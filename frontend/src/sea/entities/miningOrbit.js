const PERIOD_MS = 5000;
const MOVE_MS = 900;
const STEP_ANGLE = Math.PI / 4;
const STEPS_PER_ORBIT = 8;
const MOORING_ANGLES = [
  -Math.PI * 5 / 6,
  -Math.PI * 3 / 4,
  -Math.PI * 2 / 3,
  -Math.PI * 7 / 12,
  -Math.PI * 5 / 12,
  -Math.PI / 3,
  -Math.PI / 4,
  -Math.PI / 6,
];

export function miningOrbit(now, offset = 0) {
  const phase = ((now % PERIOD_MS) + PERIOD_MS) % PERIOD_MS;
  const step = Math.floor(now / PERIOD_MS) % STEPS_PER_ORBIT;
  const progress = Math.min(1, phase / MOVE_MS);
  const eased = progress * progress * (3 - 2 * progress);
  return {
    angle: offset + (step + eased) * STEP_ANGLE,
    moving: phase < MOVE_MS,
  };
}

export function mooringOffset(radius, slot) {
  const angle = MOORING_ANGLES[((slot % MOORING_ANGLES.length) + MOORING_ANGLES.length) % MOORING_ANGLES.length];
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}