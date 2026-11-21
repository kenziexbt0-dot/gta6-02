// Rook, the player: on foot or behind the wheel, the wanted level that
// follows their crimes, their health and money, and the fists and pistol
// they fight with. The world systems read this one object.
import { CAR, ECONOMY, PLAYER, POLICE, WORLD } from './config.js';
import { collideBuildings } from './city.js';
import { carsTouch, initCarVelocity, stepCar } from './entities.js';

export function createPlayer(city, places) {
  const start = places.safehouse;
  return {
    x: start.x + 60,
    y: start.y + 40,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    money: ECONOMY.startMoney,
    wanted: 0,
    quietTimer: 0,
    decayTimer: 0,
    car: null,
    weapon: 'fists',
    ammo: PLAYER.pistolAmmoStart,
    hasPistol: false,
    punchCooldown: 0,
    shootCooldown: 0,
    invulnerable: 0,
    bustProgress: 0,
    speed: 0,
    // The city itself, for collision checks when leaving a car.
    city,
    // The car the player owns (their starter car at the safehouse).
    ownedCar: null,
    repaint: '#d94f3d',
  };
}

export function addWanted(player, stars) {
  player.wanted = Math.min(POLICE.maxStars, player.wanted + stars);
  player.quietTimer = 0;
  player.decayTimer = 0;
}

export function updateWanted(player, dt, copsNear) {
  if (player.wanted === 0) return;
  if (copsNear) {
    player.quietTimer = 0;
    return;
  }
  player.quietTimer += dt;
  if (player.quietTimer > POLICE.decayQuietSeconds) {
    player.decayTimer += dt;
    if (player.decayTimer >= POLICE.decayStepSeconds) {
      player.decayTimer = 0;
      player.wanted -= 1;
    }
  }
}

// On foot: WASD moves, Shift runs, F punches, mouse aims the pistol.
export function stepOnFoot(player, axes, run, dt, city, entities, audio, onCrime) {
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const mx = axes.x;
  const my = axes.y;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    player.x += (mx / len) * speed * dt;
    player.y += (my / len) * speed * dt;
    player.angle = Math.atan2(my, mx);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  const pushed = collideBuildings(city, player.x, player.y, PLAYER.radius);
  player.x = Math.max(PLAYER.radius, Math.min(WORLD.width - PLAYER.radius, pushed.x));
  player.y = Math.max(PLAYER.radius, Math.min(WORLD.height - PLAYER.radius, pushed.y));
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.shootCooldown > 0) player.shootCooldown -= dt;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  return { moved: len > 0 };
}

export function tryPunch(player, entities, audio, onCrime, onDown) {
  if (player.punchCooldown > 0 || player.car) return false;
  player.punchCooldown = 0.45;
  audio.punch();
  // A short lunge into the punch, so fists reach a walker backing away.
  // (The next on-foot step pushes the player out of any wall it clips.)
  player.x += Math.cos(player.angle) * 10;
  player.y += Math.sin(player.angle) * 10;
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  let hit = false;
  // Peds and foot cops within the punch arc take the hit.
  const victims = entities.peds.concat(entities.footCops);
  victims.forEach((v) => {
    const d = Math.hypot(v.x - player.x, v.y - player.y);
    if (d > PLAYER.punchRange + 14) return;
    const ang = Math.atan2(v.y - player.y, v.x - player.x);
    let diff = ang - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.punchArc) return;
    hit = true;
    if (v.gang) {
      // Gang members take two punches; dropping one counts for the job.
      v.health -= 1;
      entities.addParticles(v.x, v.y, '#d94f3d', 6, 90);
      if (v.health <= 0) {
        const idx = entities.peds.indexOf(v);
        if (idx >= 0) entities.peds.splice(idx, 1);
        if (onDown) onDown(v);
      }
      onCrime(1);
      return;
    }
    if (v.state !== undefined) {
      v.state = 'flee';
      v.panic = 1.5;
      v.x += Math.cos(ang) * 26;
      v.y += Math.sin(ang) * 26;
    }
    if (v.bustTimer !== undefined) {
      // Hitting a cop is a bigger crime than shoving a pedestrian.
      onCrime(2);
      entities.addParticles(v.x, v.y, '#e8c33f', 6, 90);
    } else {
      onCrime(1);
      entities.addParticles(v.x, v.y, '#e8e8e8', 5, 70);
    }
  });
  // Punching a car door dents it and annoys its driver.
  entities.traffic.concat(entities.parked).forEach((car) => {
    if (Math.hypot(car.x - px, car.y - py) < 30) {
      hit = true;
      car.health -= PLAYER.punchDamage;
      entities.addParticles(car.x, car.y, '#e8c33f', 4, 60);
      if (car.kind === 'traffic') onCrime(1);
    }
  });
  return hit;
}

export function tryShoot(player, targetX, targetY, entities, audio, onCrime, onDown) {
  if (player.shootCooldown > 0 || player.car || !player.hasPistol || player.ammo <= 0) return false;
  player.shootCooldown = 0.32;
  player.ammo -= 1;
  audio.gunshot();
  const aim = Math.atan2(targetY - player.y, targetX - player.x);
  player.angle = aim;
  const range = PLAYER.pistolRange;
  const endX = player.x + Math.cos(aim) * range;
  const endY = player.y + Math.sin(aim) * range;
  entities.addParticles(player.x + Math.cos(aim) * 20, player.y + Math.sin(aim) * 20, '#ffd76a', 4, 120);
  let hit = false;
  entities.peds.concat(entities.footCops).forEach((v) => {
    const d = Math.hypot(v.x - player.x, v.y - player.y);
    if (d > range) return;
    const ang = Math.atan2(v.y - player.y, v.x - player.x);
    let diff = ang - aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.09) return;
    hit = true;
    if (v.gang) {
      v.health -= 2;
      entities.addParticles(v.x, v.y, '#d94f3d', 8, 110);
      if (v.health <= 0) {
        const idx = entities.peds.indexOf(v);
        if (idx >= 0) entities.peds.splice(idx, 1);
        if (onDown) onDown(v);
      }
      onCrime(1);
      return;
    }
    v.state = 'flee';
    v.panic = 2;
    entities.addParticles(v.x, v.y, '#d94f3d', 8, 110);
    onCrime(v.bustTimer !== undefined ? 2 : 1);
  });
  entities.traffic.concat(entities.policeCars).forEach((car) => {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d > range) return;
    const ang = Math.atan2(car.y - player.y, car.x - player.x);
    let diff = ang - aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.12) return;
    hit = true;
    car.health -= PLAYER.pistolDamage;
    entities.addParticles(car.x, car.y, '#e8c33f', 6, 100);
    if (car.kind === 'police') onCrime(2);
  });
  return hit;
}

// Entering a car: parked cars are free, traffic cars are a crime (the
// driver bails and runs), police cars cannot be stolen.
export function tryEnterCar(player, entities, audio, onCrime) {
  if (player.car) {
    // Getting out: step clear of the door, then out of any wall the
    // door opens into, so the player never spawns inside a building.
    const car = player.car;
    player.car = null;
    const out = collideBuildings(player.city, car.x + Math.cos(car.angle + Math.PI / 2) * 34, car.y + Math.sin(car.angle + Math.PI / 2) * 34, PLAYER.radius);
    player.x = out.x;
    player.y = out.y;
    player.angle = car.angle;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    return 'exit';
  }
  const near = entities.parked.concat(entities.traffic).filter((car) => {
    if (car.kind === 'police') return false;
    return Math.hypot(car.x - player.x, car.y - player.y) < CAR.enterRange;
  });
  if (near.length === 0) return null;
  near.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
  const car = near[0];
  if (car.kind === 'traffic') {
    onCrime(1);
    audio.horn();
    // The driver flees on foot.
    entities.peds.push({
      x: car.x - Math.cos(car.angle) * 30, y: car.y - Math.sin(car.angle) * 30,
      angle: car.angle + Math.PI, speed: PEDS_FLEE, color: '#e8b88a',
      shirt: '#3d7dd9', state: 'flee', panic: 2.5, target: null,
    });
    const idx = entities.traffic.indexOf(car);
    if (idx >= 0) entities.traffic.splice(idx, 1);
  } else {
    const idx = entities.parked.indexOf(car);
    if (idx >= 0) entities.parked.splice(idx, 1);
  }
  car.kind = 'player';
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  initCarVelocity(car);
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  return 'enter';
}

const PEDS_FLEE = 150;

// Driving: W/S throttle, A/D steer, Space handbrake. Collisions with
// traffic dent both cars; running over a pedestrian is a crime.
export function stepDriving(player, axes, brake, dt, city, entities, audio, onCrime, onCrash) {
  const car = player.car;
  if (!car) return;
  const throttle = -axes.y;
  const steer = axes.x;
  const moved = stepCar(car, throttle, steer, brake, dt, city);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  // Handbrake at speed: tyre smoke and a skid note, throttled so the
  // sound does not retrigger every frame of one long slide.
  if (brake && car.speed > 200) {
    car.skidTimer = (car.skidTimer ?? 0) - dt;
    if (car.skidTimer <= 0) {
      audio.skid();
      car.skidTimer = 0.4;
    }
    entities.addParticles(car.x - Math.cos(car.angle) * 26, car.y - Math.sin(car.angle) * 26, '#c9c9c9', 2, 60);
  }
  // Bumping traffic: both cars take damage, the other driver honks.
  entities.traffic.forEach((other) => {
    if (carsTouch(car, other)) {
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 60 && player.invulnerable <= 0) {
        player.invulnerable = 0.4;
        car.health -= impact * 0.03;
        other.health -= impact * 0.03;
        other.speed = Math.max(0, other.speed - impact * 0.3);
        audio.crash();
        onCrash(car.x, car.y);
        if (impact > 200) onCrime(1);
      }
    }
  });
  // Running down a pedestrian is the fastest way to earn stars — but
  // one body under the wheels counts once, not once per frame, so the
  // cooldown on the pedestrian (see entities.js) gates the crime.
  entities.peds.forEach((ped) => {
    if (ped.justHit > 0) return;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && car.speed > 60) {
      ped.justHit = 1.5;
      ped.state = 'flee';
      ped.panic = 2;
      ped.x += Math.cos(car.angle) * 40;
      ped.y += Math.sin(car.angle) * 40;
      entities.addParticles(ped.x, ped.y, '#e8e8e8', 6, 90);
      onCrime(1);
      audio.crash();
    }
  });
  // A wrecked car strands the player.
  if (car.health <= 0) {
    entities.addParticles(car.x, car.y, '#3b4048', 16, 160);
    audio.crash();
    player.car = null;
    player.x = car.x + 40;
    player.y = car.y + 40;
    player.health = Math.max(20, player.health - 15);
  }
}

export function damagePlayer(player, amount) {
  if (player.invulnerable > 0) return;
  player.health -= amount;
  player.invulnerable = 0.5;
}
