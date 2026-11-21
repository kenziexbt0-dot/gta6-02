// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame.
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { addWanted, stepDriving, stepOnFoot } from './player.js';
import { initCarVelocity, makeCar } from './entities.js';
import { startMission } from './missions.js';

const STEP = 1 / 60;
const SILENT = {
  update() {}, pickup() {}, cash() {}, crash() {}, punch() {},
  gunshot() {}, horn() {}, mission() {}, fail() {}, busted() {},
  setMuted() {}, isMuted() { return true; }, unlock() {},
};

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Drive the player's car toward a waypoint: throttle on, steer at the
// target, brake if we are about to overshoot it. maxSpeed, when given,
// caps the cruise so a chase can stay on the player's tail.
function driveToward(player, tx, ty, dt, city, entities, maxSpeed) {
  const want = Math.atan2(ty - player.y, tx - player.x);
  const diff = angleDiff(player.angle, want);
  const d = Math.hypot(tx - player.x, ty - player.y);
  let yAxis = d < 120 ? 0.4 : -1;
  if (maxSpeed && player.car && player.car.speed > maxSpeed) yAxis = 0.3;
  const axes = { x: Math.max(-1, Math.min(1, diff * 2.4)), y: yAxis };
  stepDriving(player, axes, false, dt, city, entities, SILENT, () => {}, () => {});
}

function giveCar(world, x, y, angle, color) {
  const { entities, player } = world;
  const car = makeCar(x, y, angle, color || '#d94f3d', 'player');
  car.vx = 0;
  car.vy = 0;
  initCarVelocity(car);
  player.car = car;
  player.x = x;
  player.y = y;
  player.angle = angle;
  return car;
}

function stepWorld(world, dt, time) {
  const { city, entities, player, missions } = world;
  entities.updateTraffic(dt, player);
  entities.updatePeds(dt, null);
  entities.updateBirds(dt);
  entities.updateParticles(dt);
  entities.updatePolice(dt, player, player.wanted, () => {});
  updateMissionsShim(world, dt);
  return time + dt;
}

function updateMissionsShim(world, dt) {
  // updateMissions is imported lazily to keep this file's import list
  // short; the real call lives in main.js, here we only need timers.
  const { missions } = world;
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  if (missions.dialogueTimer > 0) missions.dialogueTimer -= dt;
}

function baseState(world, screen, time) {
  return {
    screen,
    time,
    player: world.player,
    entities: world.entities,
    missions: world.missions,
    city: world.city,
    prompt: null,
    fee: 0,
    hasSave: false,
  };
}

// The title screen over a slow pan of the city.
function sceneStart(world) {
  return { state: baseState(world, SCREEN_TITLE, 14) };
}

function trace(world, t) {
  window.__shotTrace = window.__shotTrace || [];
  const nearestCop = world.entities.policeCars.length > 0
    ? Math.round(Math.min(...world.entities.policeCars.map((c) => Math.hypot(c.x - world.player.x, c.y - world.player.y))))
    : null;
  window.__shotTrace.push({
    t: +t.toFixed(1), x: Math.round(world.player.x), y: Math.round(world.player.y),
    speed: Math.round(world.player.speed), angle: +world.player.angle.toFixed(2),
    wanted: world.player.wanted, nearestCop,
  });
}

// Rook driving south down Ocean Avenue in traffic, HUD and minimap live.
function sceneDrive(world) {
  const { city, entities, player } = world;
  giveCar(world, 1800, 700, Math.PI / 2, '#3d7dd9');
  let time = 0;
  for (let i = 0; i < 3 / STEP; i += 1) {
    driveToward(player, 1800, 2600, STEP, city, entities);
    time = stepWorld(world, STEP, time);
    if (i % 60 === 0) trace(world, time);
  }
  const state = baseState(world, SCREEN_PLAY, time);
  state.prompt = 'E — Get out   ·   Space — Handbrake';
  return { state };
}

// Three stars, three police cars closing in, the getaway job running.
function sceneChase(world) {
  const { city, entities, player, missions } = world;
  giveCar(world, 1400, 500, Math.PI / 2, '#d94f3d');
  startMission(missions, player, entities, (n) => addWanted(player, n), SILENT);
  // Jump to the getaway step: the first two jobs are skipped for the shot.
  missions.index = 2;
  missions.active = false;
  startMission(missions, player, entities, (n) => addWanted(player, n), SILENT);
  // One step so the wanted level spawns its patrol cars, then pull them
  // in close behind the player: at full speed they start 700 px out and
  // would take a while to reach the frame, so the chase would show no
  // police at all. v2 police are faster than the player's top speed, so
  // the autopilot cruises at 430 and the patrol cars start at 420.
  stepWorld(world, STEP, 0);
  entities.policeCars.forEach((car, i) => {
    car.x = 1400;
    car.y = player.y - 240 - i * 110;
    car.angle = Math.PI / 2;
    car.mode = 'chase';
    car.speed = 420;
    initCarVelocity(car);
  });
  let time = 0;
  for (let i = 0; i < 4 / STEP; i += 1) {
    // South down Ocean Avenue at a pace the patrol cars can match, so
    // the chase stays in frame instead of falling behind.
    driveToward(player, 1400, 2600, STEP, city, entities, 430);
    time = stepWorld(world, STEP, time);
    if (i % 60 === 0) trace(world, time);
  }
  const state = baseState(world, SCREEN_PLAY, time);
  state.prompt = 'E — Get out   ·   Space — Handbrake';
  return { state };
}

// The Hot Wheels job: on foot at the marina, the Coral GT waiting under
// its marker, Mara's briefing still on screen.
function sceneMission(world) {
  const { city, entities, player, missions } = world;
  const marina = city.places.marina;
  // The Coral GT, parked bright in the lot.
  const gt = makeCar(marina.x + 60, marina.y + 20, 0, '#e07b2e', 'parked');
  gt.vx = 0;
  gt.vy = 0;
  entities.parked.push(gt);
  // Rook is already beside the GT, mid-approach: the walk from the
  // street kept snagging on the lot's buildings, so start him there.
  player.x = marina.x + 14;
  player.y = marina.y + 58;
  player.angle = 0;
  missions.index = 1;
  startMission(missions, player, entities, (n) => addWanted(player, n), SILENT);
  missions.dialogueTimer = 4.5;
  let time = 0;
  for (let i = 0; i < 0.6 / STEP; i += 1) {
    stepOnFoot(player, { x: 1, y: 0 }, false, STEP, city, entities, SILENT, () => {});
    time = stepWorld(world, STEP, time);
  }
  const state = baseState(world, SCREEN_PLAY, time);
  state.prompt = 'E — Steal the Coral GT';
  return { state };
}

export function stageShot(name, world) {
  if (name === 'drive') return sceneDrive(world);
  if (name === 'chase') return sceneChase(world);
  if (name === 'mission') return sceneMission(world);
  return sceneStart(world);
}
