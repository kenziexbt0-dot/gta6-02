// Solmarina — configuration and tuning for the open-world game.
// Every number that shapes how the city feels lives here, so balance
// changes touch one file and the systems read the same truth.
export const WORLD = {
  width: 3600,
  height: 2700,
  // Avenues run north-south, streets east-west. Roads are 72 px wide.
  avenues: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400],
  streets: [200, 600, 1000, 1400, 1800, 2200, 2600],
  roadHalf: 36,
  // East of the last avenue: sand, then the sea at the world edge.
  beachStart: 3452,
  seaStart: 3540,
};

export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  health: 100,
  punchDamage: 18,
  punchRange: 34,
  punchArc: 1.1,
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmoStart: 24,
};

export const CAR = {
  length: 54,
  width: 26,
  // Arcade driving: acceleration, braking, steering that weakens at speed.
  accel: 520,
  brake: 760,
  reverseAccel: 300,
  maxSpeed: 560,
  maxReverse: 210,
  steerRate: 2.6,
  grip: 3.2,
  handbrakeGrip: 1.1,
  health: 100,
  // How close the player must be to hop in, and how far a stolen car
  // may be from its driver before the driver gives up the chase.
  enterRange: 46,
};

export const TRAFFIC = {
  count: 30,
  cruiseMin: 120,
  cruiseMax: 185,
  spawnSafeRadius: 520,
};

export const PEDS = {
  count: 42,
  walkMin: 42,
  walkMax: 78,
  fleeSpeed: 150,
  // A share of the crowd are joggers, out for a run along the avenues.
  joggerChance: 0.15,
  jogMin: 120,
  jogMax: 165,
};

// Seagulls circling the beach and the pier, for life above the streets.
export const BIRDS = {
  count: 8,
};

export const POLICE = {
  // Wanted stars 0..5. Each star adds one active pursuer, up to 5.
  maxStars: 5,
  // A patrol car cruises at this speed; a chase tops out here while the
  // player dawdles — but a player flat out at 560 used to walk away from
  // every pursuit, so a chase now scales just past it: the cap follows
  // the player's speed, and a pursuer far behind gets a catch-up boost.
  // The edge is deliberately small (575 vs the player's 560): a chase
  // is a threat, not a sentence — sharp turns, traffic and the city's
  // blocks still shed a pursuer, so a getaway stays possible.
  chaseSpeed: 430,
  chaseSpeedMax: 575,
  catchUpRange: 600,
  catchUpBoost: 1.15,
  patrolSpeed: 150,
  footCopSpeed: 205,
  bustSeconds: 1.6,
  ramDamage: 9,
  // Stars decay when the player stays clean and unseen this long.
  decayQuietSeconds: 22,
  decayStepSeconds: 9,
};

export const ECONOMY = {
  startMoney: 250,
  hospitalFee: 120,
  impoundFee: 80,
  pistolPrice: 350,
  ammoPrice: 60,
  ammoAmount: 24,
  repairPrice: 90,
  medkitPrice: 40,
};

export const MISSIONS = {
  // Marker pulse, dialogue timing, objective radii.
  markerRadius: 26,
  arriveRadius: 64,
  dialogueSeconds: 4.5,
};

export const SAVE_KEY = 'solmarina-save-v1';

export const COLORS = {
  grass: '#8aa864',
  grassDark: '#7d9a58',
  road: '#3b4048',
  roadEdge: '#2e3238',
  sidewalk: '#b7b0a0',
  lane: '#e8d44f',
  beach: '#e9d79b',
  sea: '#2e7fb4',
  seaDeep: '#256b9c',
  park: '#6f9e52',
  buildingRoof: ['#c96f4a', '#d9a05b', '#7d8ba0', '#b0563f', '#8a6f9e', '#5f8a6e'],
  towerRoof: ['#5d6b7d', '#6b7d8f', '#7a6a8a'],
  warehouseRoof: '#9a8f7a',
  houseRoof: ['#b0563f', '#c97e4a', '#7d8a5a', '#8a6f9e'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
