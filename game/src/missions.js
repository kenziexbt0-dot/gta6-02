// The story: seven jobs for Mara Voss, Solmarina's fixer, told through
// briefings and objectives. Each mission is a list of steps; a step
// completes when the player reaches its marker, holds out its timer, or
// clears its targets, and the next step starts with a fresh objective.
// A 'timed' step is a goto with a countdown: arrive before it hits zero
// or the job fails.
import { MISSIONS } from './config.js';

function marker(x, y, label) {
  return { x, y, label };
}

export const MISSION_DEFS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    reward: 400,
    briefing: 'Mara: Rook, you drive? Good. My associate is waiting at the pier. Pick him up and bring him to the safehouse. No trouble, no cops.',
    steps: [
      { type: 'goto', place: 'pier', label: 'Pick up the associate at Sunset Pier' },
      { type: 'goto', place: 'safehouse', label: 'Drive the associate to the garage', deliver: true },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 650,
    briefing: 'Mara: A Coral GT is sitting in the marina lot, keys in it, owner on a yacht. Bring it to Piston & Paint. The owner will notice. Drive fast.',
    steps: [
      { type: 'steal', place: 'marina', label: 'Steal the Coral GT from the marina lot' },
      { type: 'goto', place: 'garage', label: 'Deliver the Coral GT to Piston & Paint', needCar: true },
    ],
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    reward: 800,
    briefing: 'Mara: The docks job went loud. Cops are already rolling. Lose them — stay out of sight for 30 seconds and they will call off the chase.',
    steps: [
      { type: 'escape', seconds: 30, label: 'Lose the police — stay clean for 30 seconds', wanted: 3 },
    ],
  },
  {
    id: 'street-sweep',
    title: 'Street Sweep',
    reward: 900,
    briefing: 'Mara: The Vipers are muscling in on my docks. Clear them out — fists or iron, your call. Bring a pistol if you have one; Ironworks sells them.',
    steps: [
      { type: 'combat', place: 'docks', count: 5, label: 'Clear the Vipers from the docks (5)', spawn: 'gang' },
    ],
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    reward: 1500,
    briefing: 'Mara: Meridian Bank, noon, one crew, one vault. Pick up the crew at the hospital car park, hit the bank, then get us all to the garage. This is the one, Rook.',
    steps: [
      { type: 'goto', place: 'hospital', label: 'Pick up the crew at Solmarina General' },
      { type: 'goto', place: 'bank', label: 'Reach Meridian Bank', wanted: 2 },
      { type: 'holdout', seconds: 25, place: 'bank', label: 'Hold the bank for 25 seconds', wanted: 4 },
      { type: 'goto', place: 'garage', label: 'Escape to Piston & Paint with the crew', needCar: true },
    ],
  },
  {
    id: 'long-way-home',
    title: 'The Long Way Home',
    reward: 1100,
    briefing: 'Mara: A package changes hands three times tonight and I need a driver no one follows. Pier first, then the docks, then the bank. Slow is smooth, Rook — no heat on this one.',
    steps: [
      { type: 'goto', place: 'pier', label: 'Collect the package at Sunset Pier' },
      { type: 'goto', place: 'docks', label: 'Hand it off at The Docks' },
      { type: 'goto', place: 'bank', label: 'Deliver the cut to Meridian Bank' },
    ],
  },
  {
    id: 'night-shift',
    title: 'Night Shift',
    reward: 1300,
    briefing: 'Mara: Last fare of the night — a VIP at the marina who pays double if the car is at the bank before the clock runs out. 75 seconds. Don\'t stop for anyone.',
    steps: [
      { type: 'goto', place: 'marina', label: 'Pick up the VIP at the Marina Lot' },
      { type: 'timed', place: 'bank', seconds: 75, label: 'Race the VIP to Meridian Bank', needCar: true },
    ],
  },
];

export function createMissions(city) {
  return {
    index: 0,
    step: 0,
    active: false,
    done: false,
    timer: 0,
    holdout: 0,
    combatLeft: 0,
    gang: [],
    banner: null,
    bannerTimer: 0,
    dialogue: null,
    dialogueTimer: 0,
    city,
  };
}

export function currentMission(missions) {
  if (missions.index >= MISSION_DEFS.length) return null;
  return MISSION_DEFS[missions.index];
}

export function currentStep(missions) {
  const def = currentMission(missions);
  if (!def) return null;
  return def.steps[missions.step] || null;
}

function stepMarker(missions, step) {
  const place = missions.city.places[step.place];
  if (!place) return null;
  return marker(place.x, place.y, step.label);
}

export function missionMarker(missions) {
  const step = currentStep(missions);
  if (!missions.active || !step) return null;
  if (step.type === 'goto' || step.type === 'steal' || step.type === 'combat' || step.type === 'holdout' || step.type === 'timed') {
    return stepMarker(missions, step);
  }
  return null;
}

export function missionObjective(missions) {
  const def = currentMission(missions);
  const step = currentStep(missions);
  if (!def || !missions.active || !step) return null;
  let label = step.label;
  if (step.type === 'escape') label = `${step.label} — ${Math.ceil(missions.timer)}s left`;
  if (step.type === 'holdout') label = `${step.label} — ${Math.ceil(missions.holdout)}s left`;
  if (step.type === 'timed') label = `${step.label} — ${Math.ceil(missions.timer)}s left`;
  if (step.type === 'combat') label = `${step.label} — ${missions.combatLeft} left`;
  return { title: def.title, label };
}

export function startMission(missions, player, entities, addWanted, audio) {
  const def = currentMission(missions);
  if (!def || missions.active) return false;
  missions.active = true;
  missions.step = 0;
  missions.timer = 0;
  missions.holdout = 0;
  missions.combatLeft = 0;
  missions.gang = [];
  missions.dialogue = def.briefing;
  missions.dialogueTimer = MISSIONS.dialogueSeconds;
  audio.mission();
  enterStep(missions, player, entities, addWanted);
  return true;
}

function enterStep(missions, player, entities, addWanted) {
  const step = currentStep(missions);
  if (!step) return;
  if (step.wanted) addWanted(step.wanted);
  if (step.type === 'escape') missions.timer = step.seconds;
  if (step.type === 'timed') missions.timer = step.seconds;
  if (step.type === 'holdout') missions.holdout = step.seconds;
  if (step.type === 'combat') {
    missions.combatLeft = step.count;
    const place = missions.city.places[step.place];
    missions.gang = [];
    for (let i = 0; i < step.count; i += 1) {
      const a = (i / step.count) * Math.PI * 2;
      const gang = {
        x: place.x + Math.cos(a) * 90,
        y: place.y + Math.sin(a) * 90,
        angle: a,
        speed: 120,
        color: '#e8b88a',
        shirt: '#7d2e2e',
        state: 'chase',
        panic: 0,
        target: null,
        health: 2,
        gang: true,
      };
      missions.gang.push(gang);
      entities.peds.push(gang);
    }
  }
}

export function completeStep(missions, player, entities, audio, addWanted) {
  missions.step += 1;
  const def = currentMission(missions);
  if (missions.step >= def.steps.length) {
    missions.active = false;
    player.money += def.reward;
    missions.banner = `Job done — ${def.title}: +$${def.reward}`;
    missions.bannerTimer = 4;
    missions.index += 1;
    if (missions.index >= MISSION_DEFS.length) missions.done = true;
    audio.cash();
    return 'mission-done';
  }
  audio.pickup();
  enterStep(missions, player, entities, addWanted);
  return 'step-done';
}

export function failMission(missions, entities, audio) {
  // Clear the gang this job spawned, so its members do not keep chasing
  // the player after the job is already over.
  if (entities && missions.gang.length > 0) {
    missions.gang.forEach((g) => {
      const idx = entities.peds.indexOf(g);
      if (idx >= 0) entities.peds.splice(idx, 1);
    });
  }
  missions.gang = [];
  missions.combatLeft = 0;
  missions.active = false;
  missions.step = 0;
  missions.banner = 'Job failed — Mara will call again. Try the job over.';
  missions.bannerTimer = 4;
  audio.fail();
}

// Called every frame while a mission runs: advance timers, check the
// current step's completion, and chase the player with gang members.
export function updateMissions(missions, player, entities, dt, addWanted, audio) {
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  if (missions.dialogueTimer > 0) missions.dialogueTimer -= dt;
  if (!missions.active) return null;
  const step = currentStep(missions);
  if (!step) return null;

  if (step.type === 'goto' || step.type === 'steal') {
    const place = missions.city.places[step.place];
    const d = Math.hypot(player.x - place.x, player.y - place.y);
    if (d < MISSIONS.arriveRadius) {
      if (step.needCar && !player.car) return null;
      if (step.type === 'steal' && !player.car) return null;
      return completeStep(missions, player, entities, audio, addWanted);
    }
    return null;
  }
  if (step.type === 'timed') {
    // A goto against the clock: arrive before the timer dies, in a car
    // when the step says so; the job fails the moment time runs out.
    const place = missions.city.places[step.place];
    const d = Math.hypot(player.x - place.x, player.y - place.y);
    if (d < MISSIONS.arriveRadius) {
      if (step.needCar && !player.car) return null;
      return completeStep(missions, player, entities, audio, addWanted);
    }
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failMission(missions, entities, audio);
      return 'mission-failed';
    }
    return null;
  }
  if (step.type === 'escape') {
    // The clock only runs while the player is clean; getting spotted
    // resets it, so the player must shake the heat first, then hide.
    if (player.wanted > 0) missions.timer = step.seconds;
    else {
      missions.timer -= dt;
      if (missions.timer <= 0) return completeStep(missions, player, entities, audio, addWanted);
    }
    return null;
  }
  if (step.type === 'holdout') {
    const place = missions.city.places[step.place];
    const d = Math.hypot(player.x - place.x, player.y - place.y);
    if (d < 160) {
      missions.holdout -= dt;
      if (missions.holdout <= 0) return completeStep(missions, player, entities, audio, addWanted);
    }
    return null;
  }
  if (step.type === 'combat') {
    // Gang members left standing chase the player; the punch/shoot code
    // reports each one it drops through reportGangDown.
    missions.gang.forEach((g) => {
      if (g.health <= 0) return;
      const d = Math.hypot(player.x - g.x, player.y - g.y);
      if (d < 420) {
        g.angle = Math.atan2(player.y - g.y, player.x - g.x);
        g.x += Math.cos(g.angle) * g.speed * dt;
        g.y += Math.sin(g.angle) * g.speed * dt;
        if (d < 26 && player.invulnerable <= 0) {
          player.health -= 6;
          player.invulnerable = 0.5;
          audio.punch();
        }
      }
    });
    if (missions.combatLeft <= 0) return completeStep(missions, player, entities, audio, addWanted);
    return null;
  }
  return null;
}

// The combat code calls this when a gang member goes down.
export function reportGangDown(missions, gang) {
  if (!missions.active) return;
  const step = currentStep(missions);
  if (!step || step.type !== 'combat') return;
  if (gang.health > 0) return;
  const idx = missions.gang.indexOf(gang);
  if (idx >= 0) {
    missions.gang.splice(idx, 1);
    missions.combatLeft = Math.max(0, missions.combatLeft - 1);
  }
}
