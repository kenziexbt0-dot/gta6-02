// The moving population: traffic cars that follow the road graph,
// pedestrians on the sidewalks, parked cars to steal, and the police
// that patrol until the wanted level calls them in. One file owns every
// vehicle and walker so the player, the missions and the renderer all
// read the same bodies.
import { BIRDS, CAR, PEDS, POLICE, TRAFFIC, WORLD } from './config.js';
import { collideBuildings, nearestRoadPoint, onRoad } from './city.js';
import { chance, pick, range } from './rng.js';

export const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c33f', '#e8e8e8', '#2e2e34', '#5fb84f', '#c97fb8', '#e07b2e', '#7fb8c9'];
export const POLICE_COLOR = '#1e3a5f';
export const PED_COLORS = ['#e8b88a', '#c98a6b', '#8a6b4f', '#e8d0a8'];

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function makeCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0, color, kind: kind || 'traffic',
    health: CAR.health, width: CAR.width, length: CAR.length,
    // Road-graph travel for traffic: node indices and progress 0..1.
    from: -1, to: -1, t: 0, cruise: range(Math.random, 0, 0) || 150,
    driver: null, brakeLight: false, skid: 0,
  };
}

// Arcade car physics shared by the player's car and police chasers:
// throttle -1..1, steer -1..1, handbrake bool. speedCap overrides the
// forward top speed (police chasers pass their pursuit cap here, so a
// getaway at full throttle can still be caught). Returns the distance moved.
export function stepCar(car, throttle, steer, handbrake, dt, city, speedCap) {
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const speedAlong = car.vx * forwardX + car.vy * forwardY;
  const speedSide = car.vx * -forwardY + car.vy * forwardX;
  const fwdCap = speedCap ?? CAR.maxSpeed;
  const maxFwd = throttle >= 0 ? fwdCap : CAR.maxReverse;
  let accel = 0;
  if (throttle > 0) accel = CAR.accel * throttle;
  else if (throttle < 0) accel = (speedAlong > 10 ? -CAR.brake : -CAR.reverseAccel);
  const newAlong = Math.max(-CAR.maxReverse, Math.min(fwdCap, speedAlong + accel * dt));
  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  const newSide = speedSide * Math.max(0, 1 - grip * dt);
  const steerEffect = CAR.steerRate * steer * Math.min(1, Math.abs(newAlong) / 140) * (newAlong >= 0 ? 1 : -1);
  car.angle += steerEffect * dt * (handbrake ? 1.5 : 1);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.vx = fx * newAlong + -fy * newSide;
  car.vy = fy * newAlong + fx * newSide;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.abs(newAlong);
  car.skid = handbrake && Math.abs(newAlong) > 120 ? 1 : 0;
  // Stay inside the world and out of buildings.
  car.x = Math.max(20, Math.min(WORLD.width - 20, car.x));
  car.y = Math.max(20, Math.min(WORLD.height - 20, car.y));
  const pushed = collideBuildings(city, car.x, car.y, 20);
  if (pushed.x !== car.x || pushed.y !== car.y) {
    car.x = pushed.x;
    car.y = pushed.y;
    car.vx *= 0.4;
    car.vy *= 0.4;
  }
  return Math.abs(car.vx * dt) + Math.abs(car.vy * dt);
}

export function initCarVelocity(car) {
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
}

function randomEdge(city, rng, fromNode) {
  const node = city.nodes[fromNode];
  const options = [];
  city.edges.forEach(([a, b]) => {
    if (a === fromNode) options.push(b);
    else if (b === fromNode) options.push(a);
  });
  if (options.length === 0) return fromNode;
  return pick(rng, options);
}

export function createEntities(city, seed) {
  const rng = (() => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const traffic = [];
  const peds = [];
  const parked = [];
  const policeCars = [];
  const footCops = [];
  const particles = [];

  function spawnTrafficCar(nearX, nearY) {
    for (let tries = 0; tries < 12; tries += 1) {
      const from = Math.floor(rng() * city.nodes.length);
      const to = randomEdge(city, rng, from);
      if (from === to) continue;
      const a = city.nodes[from];
      const b = city.nodes[to];
      const t = rng();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (nearX !== undefined && dist(x, y, nearX, nearY) < TRAFFIC.spawnSafeRadius) continue;
      const car = makeCar(x, y, Math.atan2(b.y - a.y, b.x - a.x), pick(rng, CAR_COLORS), 'traffic');
      car.from = from;
      car.to = to;
      car.t = t;
      car.cruise = range(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax);
      car.vx = 0;
      car.vy = 0;
      initCarVelocity(car);
      return car;
    }
    return null;
  }

  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = spawnTrafficCar();
    if (car) traffic.push(car);
  }

  city.parkedSpots.forEach((spot) => {
    const car = makeCar(spot.x, spot.y, spot.angle, pick(rng, CAR_COLORS), 'parked');
    car.vx = 0;
    car.vy = 0;
    parked.push(car);
  });

  for (let i = 0; i < PEDS.count; i += 1) {
    const node = city.nodes[Math.floor(rng() * city.nodes.length)];
    const jogger = chance(rng, PEDS.joggerChance);
    peds.push({
      x: node.x + range(rng, -30, 30),
      y: node.y + range(rng, -30, 30),
      angle: rng() * Math.PI * 2,
      speed: jogger ? range(rng, PEDS.jogMin, PEDS.jogMax) : range(rng, PEDS.walkMin, PEDS.walkMax),
      jogger,
      color: pick(rng, PED_COLORS),
      shirt: pick(rng, ['#d94f3d', '#3d7dd9', '#e8c33f', '#5fb84f', '#e8e8e8', '#8a6f9e']),
      state: 'walk',
      target: null,
      panic: 0,
      // A short cooldown after being clipped by a car, so one pedestrian
      // cannot stack a star per frame while the car sits on them.
      justHit: 0,
    });
  }

  // Seagulls circling over the beach and the pier.
  const birds = [];
  for (let i = 0; i < BIRDS.count; i += 1) {
    const cx = range(rng, WORLD.beachStart - 120, WORLD.width - 60);
    const cy = range(rng, 120, WORLD.height - 120);
    birds.push({
      cx, cy,
      radius: range(rng, 50, 150),
      angle: rng() * Math.PI * 2,
      turn: range(rng, 0.25, 0.6) * (rng() < 0.5 ? 1 : -1),
      heading: 0,
      flap: rng() * Math.PI * 2,
      x: cx, y: cy,
    });
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = range(Math.random, speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(Math.random, 0.25, 0.6), max: 0.6, color, r: range(Math.random, 2, 4) });
    }
  }

  function carAhead(car, list, maxD) {
    let nearest = null;
    let nearestD = maxD;
    list.forEach((other) => {
      if (other === car) return;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < nearestD) {
        // Only cars roughly in front of us.
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const dot = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        if (dot > 0) { nearest = other; nearestD = d; }
      }
    });
    return nearest;
  }

  function pushCarsApart(list) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const d = dist(a.x, a.y, b.x, b.y);
        const min = 30;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  return {
    traffic, peds, parked, policeCars, footCops, particles, birds,
    spawnTrafficCar,
    addParticles,
    dist,

    updateBirds(dt) {
      birds.forEach((b) => {
        b.angle += b.turn * dt;
        b.flap += dt * 9;
        const nx = b.cx + Math.cos(b.angle) * b.radius;
        const ny = b.cy + Math.sin(b.angle) * b.radius * 0.6;
        b.heading = Math.atan2(ny - b.y, nx - b.x);
        b.x = nx;
        b.y = ny;
      });
    },

    updateTraffic(dt, player) {
      // Traffic yields to the player's car as well as to other cars, so
      // it queues behind you at a light instead of driving through you.
      const all = traffic.concat(policeCars.filter((c) => c.mode === 'patrol'));
      if (player.car) all.push(player.car);
      traffic.forEach((car) => {
        const a = city.nodes[car.from];
        const b = city.nodes[car.to];
        const edgeLen = Math.max(1, dist(a.x, a.y, b.x, b.y));
        const ahead = carAhead(car, all, 70);
        const target = ahead ? Math.min(car.cruise, Math.max(0, ahead.speed * 0.9)) : car.cruise;
        car.speed += (target - car.speed) * Math.min(1, dt * 2);
        car.t += (car.speed * dt) / edgeLen;
        // Right-hand lane: offset perpendicular to travel.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const px = -dy / len;
        const py = dx / len;
        car.x = a.x + dx * car.t + px * 12;
        car.y = a.y + dy * car.t + py * 12;
        car.angle = Math.atan2(dy, dx);
        if (car.t >= 1) {
          car.from = car.to;
          car.to = randomEdge(city, rng, car.from);
          car.t = 0;
        }
      });
      pushCarsApart(traffic.concat(policeCars));
    },

    updatePeds(dt, danger) {
      peds.forEach((ped) => {
        if (ped.justHit > 0) ped.justHit -= dt;
        if (danger && dist(ped.x, ped.y, danger.x, danger.y) < 260) {
          ped.state = 'flee';
          ped.panic = 1.2;
        }
        if (ped.panic > 0) {
          ped.panic -= dt;
          const away = danger ? Math.atan2(ped.y - danger.y, ped.x - danger.x) : ped.angle;
          ped.angle = away;
          ped.x += Math.cos(away) * PEDS.fleeSpeed * dt;
          ped.y += Math.sin(away) * PEDS.fleeSpeed * dt;
        } else {
          ped.state = 'walk';
          if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
            const node = city.nodes[Math.floor(rng() * city.nodes.length)];
            ped.target = { x: node.x + range(rng, -44, 44), y: node.y + range(rng, -44, 44) };
          }
          const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
          let diff = want - ped.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ped.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
          ped.x += Math.cos(ped.angle) * ped.speed * dt;
          ped.y += Math.sin(ped.angle) * ped.speed * dt;
        }
        // Peds stay out of buildings and inside the world.
        const pushed = collideBuildings(city, ped.x, ped.y, 10);
        ped.x = Math.max(14, Math.min(WORLD.width - 14, pushed.x));
        ped.y = Math.max(14, Math.min(WORLD.height - 14, pushed.y));
      });
    },

    updateParticles(dt) {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        if (p.life <= 0) particles.splice(i, 1);
      }
    },

    // Police: spawn a patrol car at a road point away from the player.
    spawnPoliceCar(playerX, playerY) {
      const point = nearestRoadPoint(playerX + range(rng, -700, 700), playerY + range(rng, -700, 700));
      const car = makeCar(point.x, point.y, rng() * Math.PI * 2, POLICE_COLOR, 'police');
      car.mode = 'patrol';
      car.vx = 0;
      car.vy = 0;
      car.cruise = POLICE.patrolSpeed;
      policeCars.push(car);
      return car;
    },

    spawnFootCop(x, y) {
      const cop = {
        x, y, angle: 0, speed: POLICE.footCopSpeed, color: '#1e3a5f', shirt: '#1e3a5f',
        state: 'chase', bustTimer: 0, target: null,
      };
      footCops.push(cop);
      return cop;
    },

    // One police car chases the player: steer toward them, ram on contact.
    // v2 pursuit: the chase cap follows the player's speed (a getaway at
    // full throttle no longer walks away), a pursuer far behind gets a
    // catch-up boost, and a chase ends the moment the heat does — v1 kept
    // ramming a clean player because a close cop never left chase mode.
    updatePolice(dt, player, wanted, onBusted) {
      const wantCount = Math.min(POLICE.maxStars, wanted);
      // Keep the right number of pursuers on the road.
      const active = policeCars.filter((c) => c.mode === 'chase').length;
      if (wantCount > active) {
        for (let i = active; i < wantCount; i += 1) this.spawnPoliceCar(player.x, player.y);
      }
      policeCars.forEach((car) => {
        if (wanted === 0) car.mode = 'patrol';
        else if (wanted > 0) car.mode = 'chase';
        if (car.mode === 'chase') {
          const want = Math.atan2(player.y - car.y, player.x - car.x);
          let diff = want - car.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const steer = Math.max(-1, Math.min(1, diff * 2.2));
          const d = dist(car.x, car.y, player.x, player.y);
          // The pursuit cap: base speed, then just past the player's
          // pace when they are flat out, plus a boost while far behind.
          const playerSpeed = player.car ? player.car.speed : 0;
          let cap = POLICE.chaseSpeed;
          if (playerSpeed > POLICE.chaseSpeed) {
            cap = Math.min(POLICE.chaseSpeedMax, playerSpeed * 1.03);
          }
          if (d > POLICE.catchUpRange) {
            cap = Math.min(POLICE.chaseSpeedMax, cap * POLICE.catchUpBoost);
          }
          stepCar(car, d > 90 ? 1 : 0.4, steer, false, dt, city, cap);
          if (car.speed > cap) {
            const s = cap / Math.max(1, Math.hypot(car.vx, car.vy));
            car.vx *= s;
            car.vy *= s;
          }
          // Ramming the player's car hurts it; touching the player on
          // foot starts the bust timer.
          if (player.car) {
            if (dist(car.x, car.y, player.car.x, player.car.y) < 34) {
              player.car.health -= POLICE.ramDamage * dt * 3;
              addParticles(car.x, car.y, '#e8c33f', 2, 60);
            }
          } else if (dist(car.x, car.y, player.x, player.y) < 30) {
            onBusted(dt, 'car');
          }
        } else {
          // Patrol: drift along the roads like traffic.
          if (car.from < 0) {
            const point = nearestRoadPoint(car.x, car.y);
            const node = city.nodes.reduce((best, n, i) => (dist(n.x, n.y, point.x, point.y) < dist(city.nodes[best].x, city.nodes[best].y, point.x, point.y) ? i : best), 0);
            car.from = node;
            car.to = randomEdge(city, rng, node);
            car.t = 0;
          }
          const a = city.nodes[car.from];
          const b = city.nodes[car.to];
          const edgeLen = Math.max(1, dist(a.x, a.y, b.x, b.y));
          car.t += (POLICE.patrolSpeed * dt) / edgeLen;
          car.x = a.x + (b.x - a.x) * car.t;
          car.y = a.y + (b.y - a.y) * car.t;
          car.angle = Math.atan2(b.y - a.y, b.x - a.x);
          if (car.t >= 1) {
            car.from = car.to;
            car.to = randomEdge(city, rng, car.from);
            car.t = 0;
          }
        }
      });
      // Foot cops only when the player is on foot and wanted.
      if (wanted > 0 && !player.car) {
        if (footCops.length < Math.min(3, wanted)) {
          const a = rng() * Math.PI * 2;
          this.spawnFootCop(player.x + Math.cos(a) * 420, player.y + Math.sin(a) * 420);
        }
      }
      for (let i = footCops.length - 1; i >= 0; i -= 1) {
        const cop = footCops[i];
        if (wanted === 0 || player.car) {
          footCops.splice(i, 1);
          continue;
        }
        const d = dist(cop.x, cop.y, player.x, player.y);
        if (d > 700) {
          footCops.splice(i, 1);
          continue;
        }
        cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        if (d < 30) {
          cop.bustTimer += dt;
          if (cop.bustTimer >= POLICE.bustSeconds) onBusted(dt, 'foot');
        } else {
          cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
        }
      }
    },
  };
}

// The player's car and a police car touching: a cheap circle test the
// caller uses for crash damage and sound.
export function carsTouch(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < 32 * 32;
}

export { onRoad };
