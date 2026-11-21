// Boot and the one loop: input every frame, the world in fixed 1/60 s
// steps, the renderer painting what is there. Screens: title, play,
// paused, busted, wasted. Saving is localStorage (money, job, kit,
// health and position, restored on reload), shops are E near a named
// place, jobs start with J, H honks the horn.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import { ECONOMY, PLAYER, SAVE_KEY, VIEW, WORLD } from './config.js';
import { buildCity, collideBuildings, paintCityBase } from './city.js';
import { createEntities } from './entities.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_JOB, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { addWanted, createPlayer, damagePlayer, stepDriving, stepOnFoot, tryEnterCar, tryPunch, tryShoot, updateWanted } from './player.js';
import { createMissions, currentMission, currentStep, failMission, reportGangDown, startMission, updateMissions } from './missions.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = buildCity(seed);
const cityBase = paintCityBase(city);
const entities = createEntities(city, seed);
const player = createPlayer(city, city.places);
const missions = createMissions(city);
const audio = createAudio();
const renderer = createRenderer(canvas, cityBase);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The save is the player's whole standing: money, job, kit, health,
// and where they were standing. Positions are validated on load, so a
// hand-edited or truncated save can never drop Rook inside a wall or
// off the map — bad numbers fall back to the safehouse.
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: player.money,
      missionIndex: missions.index,
      hasPistol: player.hasPistol,
      ammo: player.ammo,
      health: player.health,
      x: player.x,
      y: player.y,
      angle: player.angle,
    }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

function applySave(save) {
  if (!save) return;
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  player.money = num(save.money, player.money);
  missions.index = num(save.missionIndex, 0);
  player.hasPistol = !!save.hasPistol;
  player.ammo = num(save.ammo, player.ammo);
  player.health = num(save.health, player.health);
  // v1 saves carry no position: those players keep the safehouse start.
  if (typeof save.x === 'number' && typeof save.y === 'number') {
    player.x = Math.max(PLAYER.radius, Math.min(WORLD.width - PLAYER.radius, num(save.x, player.x)));
    player.y = Math.max(PLAYER.radius, Math.min(WORLD.height - PLAYER.radius, num(save.y, player.y)));
    player.angle = num(save.angle, player.angle);
    const pushed = collideBuildings(city, player.x, player.y, PLAYER.radius);
    player.x = pushed.x;
    player.y = pushed.y;
  }
}

function camera() {
  const cx = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, player.x));
  const cy = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, player.y));
  return { x: cx - VIEW.width / 2, y: cy - VIEW.height / 2 };
}

// The nearest named place, for shop prompts and E interactions.
function nearestPlace(maxD) {
  let best = null;
  let bestD = maxD;
  Object.values(city.places).forEach((place) => {
    const d = Math.hypot(player.x - place.x, player.y - place.y);
    if (d < bestD) { bestD = d; best = place; }
  });
  return best;
}

function nearestCar(maxD) {
  let best = null;
  let bestD = maxD;
  entities.parked.concat(entities.traffic).forEach((car) => {
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    if (d < bestD) { bestD = d; best = car; }
  });
  return best;
}

function runShot(name) {
  const scene = stageShot(name, { city, entities, player, missions, audio });
  // Shot-mode diagnostics: the final state and a 1 Hz trace of the
  // player's car, so a scene that ends wrong can be diagnosed.
  window.__shotDebug = {
    x: Math.round(player.x), y: Math.round(player.y),
    speed: Math.round(player.speed), angle: +player.angle.toFixed(2),
    wanted: player.wanted, car: !!player.car,
    carHealth: player.car ? Math.round(player.car.health) : null,
    nearestCop: entities.policeCars.length > 0
      ? Math.round(Math.min(...entities.policeCars.map((c) => Math.hypot(c.x - player.x, c.y - player.y))))
      : null,
    trace: window.__shotTrace || [],
  };
  let painted = 0;
  function paint() {
    renderer.draw(scene.state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const save = readSave();
  applySave(save);
  let screen = SCREEN_TITLE;
  let fee = 0;
  let time = 0;
  let accumulator = 0;
  let last = performance.now();
  let prompt = null;

  function announce(message) {
    status.textContent = message;
  }

  function onCrime(stars) {
    addWanted(player, stars);
  }

  function onBusted() {
    if (screen !== SCREEN_PLAY) return;
    fee = Math.min(player.money, ECONOMY.hospitalFee);
    player.money -= fee;
    player.wanted = 0;
    player.bustProgress = 0;
    entities.footCops.length = 0;
    entities.policeCars.forEach((c) => { c.mode = 'patrol'; });
    if (player.car) {
      player.car.health = 40;
      player.car = null;
    }
    player.health = 100;
    player.x = city.places.hospital.x + 60;
    player.y = city.places.hospital.y + 40;
    if (missions.active) failMission(missions, entities, audio);
    audio.busted();
    writeSave();
    screen = SCREEN_BUSTED;
    announce(`Busted. Fine $${fee}.`);
  }

  function onWasted() {
    if (screen !== SCREEN_PLAY) return;
    fee = Math.min(player.money, ECONOMY.hospitalFee);
    player.money -= fee;
    player.wanted = 0;
    entities.footCops.length = 0;
    if (player.car) player.car = null;
    player.health = 100;
    player.x = city.places.hospital.x + 60;
    player.y = city.places.hospital.y + 40;
    if (missions.active) failMission(missions, entities, audio);
    audio.fail();
    writeSave();
    screen = SCREEN_WASTED;
    announce(`Wasted. Hospital bill $${fee}.`);
  }

  function startGame() {
    screen = SCREEN_PLAY;
    announce('Playing. WASD to move, E to enter a car, J for a job.');
  }

  function useShop(place) {
    if (!place) return;
    if (place.kind === 'gunshop') {
      if (!player.hasPistol) {
        if (player.money >= ECONOMY.pistolPrice) {
          player.money -= ECONOMY.pistolPrice;
          player.hasPistol = true;
          player.ammo = 24;
          audio.cash();
          missions.banner = 'Bought a pistol — aim with the mouse, click to shoot.';
          missions.bannerTimer = 3;
        } else {
          missions.banner = `Pistol costs $${ECONOMY.pistolPrice} — you have $${player.money}.`;
          missions.bannerTimer = 3;
        }
      } else if (player.money >= ECONOMY.ammoPrice) {
        player.money -= ECONOMY.ammoPrice;
        player.ammo += ECONOMY.ammoAmount;
        audio.cash();
        missions.banner = `Bought ${ECONOMY.ammoAmount} rounds.`;
        missions.bannerTimer = 3;
      } else {
        missions.banner = `Ammo costs $${ECONOMY.ammoPrice}.`;
        missions.bannerTimer = 3;
      }
    } else if (place.kind === 'garage') {
      if (player.car) {
        if (player.money >= ECONOMY.repairPrice) {
          player.money -= ECONOMY.repairPrice;
          player.car.health = 100;
          audio.cash();
          missions.banner = 'Car repaired and repainted.';
          missions.bannerTimer = 3;
        } else {
          missions.banner = `Repair costs $${ECONOMY.repairPrice}.`;
          missions.bannerTimer = 3;
        }
      } else {
        missions.banner = 'Bring a car here to repair it.';
        missions.bannerTimer = 3;
      }
    } else if (place.kind === 'hospital') {
      if (player.money >= ECONOMY.medkitPrice) {
        player.money -= ECONOMY.medkitPrice;
        player.health = 100;
        audio.cash();
        missions.banner = 'Patched up — full health.';
        missions.bannerTimer = 3;
      } else {
        missions.banner = `Treatment costs $${ECONOMY.medkitPrice}.`;
        missions.bannerTimer = 3;
      }
    } else if (place.kind === 'safehouse') {
      player.health = 100;
      writeSave();
      audio.mission();
      missions.banner = 'Progress saved at the garage.';
      missions.bannerTimer = 3;
    }
  }

  function shopPrompt(place) {
    if (!place) return null;
    if (place.kind === 'gunshop') return player.hasPistol ? `E — Buy ammo $${ECONOMY.ammoPrice}` : `E — Buy pistol $${ECONOMY.pistolPrice}`;
    if (place.kind === 'garage') return `E — Repair car $${ECONOMY.repairPrice}`;
    if (place.kind === 'hospital') return `E — Treatment $${ECONOMY.medkitPrice}`;
    if (place.kind === 'safehouse') return 'E — Rest & save';
    return null;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      return;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // SCREEN_PLAY.
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
      return;
    }
    if (actions & ACTION_HORN) {
      if (player.car) audio.horn();
      return;
    }
    if (actions & ACTION_JOB) {
      if (!missions.active && currentMission(missions)) {
        startMission(missions, player, entities, (n) => addWanted(player, n), audio);
      }
      return;
    }
    if (actions & ACTION_ENTER) {
      if (!player.car) {
        const place = nearestPlace(90);
        if (place && shopPrompt(place)) {
          useShop(place);
          return;
        }
      }
      const result = tryEnterCar(player, entities, audio, onCrime);
      if (result === 'enter' || result === 'exit') audio.door();
      if (result === 'enter') {
        audio.pickup();
        // Stealing the job car is the crime, not taking the job.
        const step = currentStep(missions);
        if (missions.active && step && step.type === 'steal') addWanted(player, 2);
      }
      return;
    }
    if (actions & ACTION_PUNCH) {
      tryPunch(player, entities, audio, onCrime, (gang) => reportGangDown(missions, gang));
    }
  }

  function step() {
    time += STEP;
    const axes = input.axes();
    const mouse = input.mouse();
    const cam = camera();
    if (mouse.down && !player.car && player.hasPistol && screen === SCREEN_PLAY) {
      const wx = mouse.x + cam.x;
      const wy = mouse.y + cam.y;
      tryShoot(player, wx, wy, entities, audio, onCrime, (gang) => reportGangDown(missions, gang));
    }
    const danger = player.car && player.car.speed > 200
      ? { x: player.x, y: player.y }
      : null;
    entities.updateTraffic(STEP, player);
    entities.updatePeds(STEP, danger);
    entities.updateBirds(STEP);
    entities.updateParticles(STEP);
    // Police watch: any cop within 500 px keeps the heat on.
    const copsNear = entities.policeCars.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 500)
      || entities.footCops.length > 0;
    updateWanted(player, STEP, copsNear);
    // Bust progress: a cop touching the player on foot fills it.
    player.bustProgress = 0;
    entities.updatePolice(STEP, player, player.wanted, () => {
      player.bustProgress += STEP;
      if (player.bustProgress >= 1.6) onBusted();
    });
    if (player.car) {
      stepDriving(player, axes, input.brake(), STEP, city, entities, audio, onCrime, (x, y) => {
        entities.addParticles(x, y, '#c9c9c9', 8, 120);
      });
    } else {
      stepOnFoot(player, axes, input.run(), STEP, city, entities, audio, onCrime);
    }
    const missionEvent = updateMissions(missions, player, entities, STEP, (n) => addWanted(player, n), audio);
    if (missionEvent === 'mission-done') writeSave();
    if (player.health <= 0) onWasted();
    // Context prompt for the HUD.
    prompt = null;
    if (!player.car) {
      const place = nearestPlace(90);
      if (place && shopPrompt(place)) prompt = shopPrompt(place);
      else if (nearestCar(46)) prompt = 'E — Get in the car';
    } else {
      prompt = 'E — Get out   ·   Space — Handbrake';
    }
    const speed = player.car ? player.car.speed : 0;
    // The siren fades with the nearest patrol car, so the chase sounds
    // as close — or as far — as it is.
    const nearestCop = entities.policeCars.length > 0
      ? Math.min(...entities.policeCars.map((c) => Math.hypot(c.x - player.x, c.y - player.y)))
      : undefined;
    audio.update(STEP, speed, player.wanted, nearestCop);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += dt;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      if (screen === SCREEN_TITLE) time += dt;
    }
    renderer.draw({
      screen,
      time,
      player,
      entities,
      missions,
      city,
      prompt,
      fee,
      hasSave: !!save,
    });
    // Live state for play-testing and debugging (read-only).
    window.__solmarina = {
      screen,
      x: Math.round(player.x), y: Math.round(player.y),
      angle: +player.angle.toFixed(2),
      speed: Math.round(player.speed),
      wanted: player.wanted, money: player.money, health: Math.round(player.health),
      inCar: !!player.car, carHealth: player.car ? Math.round(player.car.health) : null,
      missionIndex: missions.index, missionActive: missions.active,
      missionStep: missions.step,
      saveLoaded: !!save,
      // Distance to the nearest police car, for chase tuning checks.
      nearestCop: entities.policeCars.length > 0
        ? Math.round(Math.min(...entities.policeCars.map((c) => Math.hypot(c.x - player.x, c.y - player.y))))
        : null,
      birds: entities.birds.length,
      nearestCar: (() => {
        const c = nearestCar(2000);
        return c ? { x: Math.round(c.x), y: Math.round(c.y), d: Math.round(Math.hypot(c.x - player.x, c.y - player.y)), kind: c.kind } : null;
      })(),
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmarina. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
