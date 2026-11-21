// The renderer: the camera, the world, the cars and walkers, and every
// screen — title, play with its HUD and minimap, pause, busted and
// wasted. The static city is painted once (city.js) and blitted here;
// everything that moves is drawn fresh each frame.
import { COLORS, FONT, VIEW, WORLD } from './config.js';
import { missionMarker, missionObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

function star(cx, cy, r, fill, g) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1.5;
  g.stroke();
}

function drawCar(g, car, time, isPlayer) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(-29, -12, 58, 28);
  // Body.
  g.fillStyle = car.color;
  g.beginPath();
  g.roundRect(-28, -13, 56, 26, 7);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 1.5;
  g.stroke();
  // Cabin and windshield.
  g.fillStyle = '#22282f';
  g.beginPath();
  g.roundRect(-8, -11, 20, 22, 4);
  g.fill();
  g.fillStyle = 'rgba(180,220,240,0.5)';
  g.fillRect(8, -10, 4, 20);
  // Headlights and brake lights.
  g.fillStyle = '#ffe9a8';
  g.fillRect(26, -11, 3, 5);
  g.fillRect(26, 6, 3, 5);
  g.fillStyle = car.brakeLight ? '#ff2e2e' : '#a33';
  g.fillRect(-29, -11, 3, 5);
  g.fillRect(-29, 6, 3, 5);
  if (car.kind === 'police') {
    const phase = Math.floor(time * 4) % 2 === 0;
    g.fillStyle = phase ? '#ff2e2e' : '#2e7bff';
    g.fillRect(-4, -13, 8, 4);
    g.fillStyle = phase ? '#2e7bff' : '#ff2e2e';
    g.fillRect(-4, 9, 8, 4);
    g.fillStyle = '#e8e8e8';
    g.font = 'bold 9px ' + FONT;
    g.textAlign = 'center';
    g.fillText('PD', 0, 3);
  }
  if (isPlayer) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(-28, -13, 56, 26, 7);
    g.stroke();
  }
  g.restore();
}

function drawPed(g, ped, time) {
  // Joggers bob twice as fast as walkers; a fleeing ped does not bob.
  const bob = ped.state === 'walk' ? Math.sin(time * (ped.jogger ? 20 : 10) + ped.x) * 1.5 : 0;
  g.save();
  g.translate(ped.x, ped.y + bob);
  g.rotate(ped.angle);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(0, 2, 10, 8, 0, 0, Math.PI * 2);
  g.fill();
  // Body.
  g.fillStyle = ped.shirt;
  g.beginPath();
  g.roundRect(-7, -7, 14, 14, 5);
  g.fill();
  // Head.
  g.fillStyle = ped.color;
  g.beginPath();
  g.arc(9, 0, 6, 0, Math.PI * 2);
  g.fill();
  if (ped.gang) {
    g.fillStyle = '#7d2e2e';
    g.font = 'bold 8px ' + FONT;
    g.textAlign = 'center';
    g.fillText('VIPER', -2, -12);
  }
  if (ped.bustTimer !== undefined) {
    // A foot cop: cap and badge.
    g.fillStyle = '#0f2540';
    g.beginPath();
    g.arc(9, 0, 6.5, Math.PI, 0);
    g.fill();
  }
  g.restore();
}

function drawBird(g, bird) {
  // A gull in flight: two strokes that open and close as it flaps.
  const open = 3 + Math.sin(bird.flap) * 2.5;
  g.save();
  g.translate(bird.x, bird.y);
  g.rotate(bird.heading);
  g.strokeStyle = 'rgba(30,32,38,0.75)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-7, 0);
  g.lineTo(0, -open);
  g.lineTo(7, 0);
  g.stroke();
  g.restore();
}

function drawPlayerOnFoot(g, player, time) {
  const moving = player.speed > 4;
  const bob = moving ? Math.sin(time * 12) * 1.5 : 0;
  g.save();
  g.translate(player.x, player.y + bob);
  g.rotate(player.angle);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(0, 2, 12, 10, 0, 0, Math.PI * 2);
  g.fill();
  // Teal jacket, dark jeans.
  g.fillStyle = '#1f9d8a';
  g.beginPath();
  g.roundRect(-8, -9, 16, 18, 6);
  g.fill();
  g.fillStyle = '#e8b88a';
  g.beginPath();
  g.arc(10, 0, 6.5, 0, Math.PI * 2);
  g.fill();
  // Cap.
  g.fillStyle = '#14324a';
  g.beginPath();
  g.arc(10, 0, 7, Math.PI, 0);
  g.fill();
  g.fillRect(10, -3, 7, 3);
  g.restore();
  // Punch flash.
  if (player.punchCooldown > 0.3) {
    g.save();
    g.translate(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

export function createRenderer(canvas, cityBase) {
  const g = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function camera(player) {
    const cx = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, player.x));
    const cy = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, player.y));
    return { x: cx - VIEW.width / 2, y: cy - VIEW.height / 2 };
  }

  function drawMinimap(state, cam) {
    const mw = 220;
    const mh = 165;
    const mx = VIEW.width - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    g.save();
    g.globalAlpha = 0.92;
    g.drawImage(cityBase, mx, my, mw, mh);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.lineWidth = 3;
    g.strokeRect(mx, my, mw, mh);
    const dot = (x, y, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1;
      g.stroke();
    };
    const marker = missionMarker(state.missions);
    if (marker) {
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      dot(marker.x, marker.y, '#ffd21f', pulse);
    }
    dot(state.city.places.safehouse.x, state.city.places.safehouse.y, '#3fd47e', 3.5);
    // Shops on the map, so a run for ammo or a repair needs no guessing:
    // red Ironworks, orange Piston & Paint, white Solmarina General,
    // yellow Meridian Bank.
    dot(state.city.places.gunshop.x, state.city.places.gunshop.y, '#ff5a4e', 3);
    dot(state.city.places.garage.x, state.city.places.garage.y, '#e07b2e', 3);
    dot(state.city.places.hospital.x, state.city.places.hospital.y, '#ffffff', 3);
    dot(state.city.places.bank.x, state.city.places.bank.y, '#ffd21f', 3);
    state.entities.policeCars.forEach((c) => dot(c.x, c.y, '#ff3b30', 3.5));
    state.entities.footCops.forEach((c) => dot(c.x, c.y, '#ff3b30', 3));
    // Viewport rectangle.
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    g.strokeRect(mx + cam.x * sx, my + cam.y * sy, VIEW.width * sx, VIEW.height * sy);
    // Player arrow.
    g.save();
    g.translate(mx + state.player.x * sx, my + state.player.y * sy);
    g.rotate(state.player.angle);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > maxWidth && line) {
        g.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    });
    if (line) g.fillText(line, x, cy);
  }

  function drawHud(state) {
    const p = state.player;
    // Top-left: health, money, weapon.
    g.save();
    g.fillStyle = 'rgba(10,14,20,0.72)';
    g.beginPath();
    g.roundRect(14, 14, 250, 84, 10);
    g.fill();
    g.fillStyle = '#e8e8e8';
    g.font = 'bold 15px ' + FONT;
    g.textAlign = 'left';
    g.fillText('ROOK', 28, 36);
    g.fillStyle = '#3fd47e';
    g.fillRect(28, 46, 130 * Math.max(0, p.health / 100), 12);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.strokeRect(28, 46, 130, 12);
    g.fillStyle = '#e8e8e8';
    g.font = '13px ' + FONT;
    g.fillText(`$${p.money}`, 170, 58);
    g.fillStyle = '#ffd21f';
    g.font = 'bold 15px ' + FONT;
    g.fillText(`$${p.money}`, 28, 84);
    const weapon = p.car ? 'Driving' : p.hasPistol ? `Pistol  ${p.ammo} rounds` : 'Fists';
    g.fillStyle = '#cfd6de';
    g.font = '13px ' + FONT;
    g.fillText(weapon, 120, 84);
    // Wanted stars, top centre.
    const starCount = p.wanted;
    const startX = VIEW.width / 2 - (starCount * 34) / 2;
    for (let i = 0; i < starCount; i += 1) star(startX + i * 34 + 14, 40, 13, '#ffd21f', g);
    if (p.wanted > 0) {
      // The warning throbs when the heat is on: three stars or more.
      g.save();
      g.globalAlpha = p.wanted >= 3 ? 0.65 + 0.35 * Math.sin(state.time * 6) : 1;
      g.fillStyle = '#ff5a4e';
      g.font = 'bold 13px ' + FONT;
      g.textAlign = 'center';
      g.fillText(p.wanted >= 3 ? 'WANTED — LOSE THE HEAT' : 'WANTED', VIEW.width / 2, 66);
      g.restore();
    }
    g.textAlign = 'left';
    // Speed when driving.
    if (p.car) {
      g.fillStyle = 'rgba(10,14,20,0.72)';
      g.beginPath();
      g.roundRect(VIEW.width - 264, VIEW.height - 64, 250, 50, 10);
      g.fill();
      g.fillStyle = '#e8e8e8';
      g.font = 'bold 22px ' + FONT;
      g.textAlign = 'right';
      g.fillText(`${Math.round(p.car.speed * 0.22)} mph`, VIEW.width - 30, VIEW.height - 30);
      g.font = '12px ' + FONT;
      g.fillStyle = '#cfd6de';
      g.fillText(p.car.health > 40 ? 'Engine OK' : 'ENGINE SMOKING', VIEW.width - 30, VIEW.height - 48);
      // Car health bar along the bottom of the speed box.
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(VIEW.width - 250, VIEW.height - 22, 222, 5);
      g.fillStyle = p.car.health > 40 ? '#3fd47e' : '#ff5a4e';
      g.fillRect(VIEW.width - 250, VIEW.height - 22, 222 * Math.max(0, p.car.health / 100), 5);
      g.textAlign = 'left';
    }
    // Objective, bottom-left.
    const obj = missionObjective(state.missions);
    if (obj) {
      g.fillStyle = 'rgba(10,14,20,0.72)';
      g.beginPath();
      g.roundRect(14, VIEW.height - 84, 430, 70, 10);
      g.fill();
      g.fillStyle = '#ffd21f';
      g.font = 'bold 14px ' + FONT;
      g.fillText(obj.title.toUpperCase(), 28, VIEW.height - 58);
      g.fillStyle = '#e8e8e8';
      g.font = '14px ' + FONT;
      g.fillText(obj.label, 28, VIEW.height - 34);
      // Distance to the marker, right-aligned on the title row.
      const marker = missionMarker(state.missions);
      if (marker) {
        const d = Math.hypot(marker.x - p.x, marker.y - p.y);
        g.fillStyle = '#ffd21f';
        g.font = 'bold 13px ' + FONT;
        g.textAlign = 'right';
        g.fillText(`${Math.round(d / 10)} m`, 430, VIEW.height - 58);
        g.textAlign = 'left';
      }
    } else if (!state.missions.done) {
      g.fillStyle = 'rgba(10,14,20,0.72)';
      g.beginPath();
      g.roundRect(14, VIEW.height - 84, 430, 70, 10);
      g.fill();
      g.fillStyle = '#e8e8e8';
      g.font = '14px ' + FONT;
      g.fillText('No job running — press J for the next job from Mara.', 28, VIEW.height - 46);
    }
    // Context prompt (enter car, shop) bottom centre.
    if (state.prompt) {
      g.fillStyle = 'rgba(10,14,20,0.8)';
      const w = g.measureText(state.prompt).width + 36;
      g.beginPath();
      g.roundRect(VIEW.width / 2 - w / 2, VIEW.height - 132, w, 34, 8);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 15px ' + FONT;
      g.textAlign = 'center';
      g.fillText(state.prompt, VIEW.width / 2, VIEW.height - 110);
      g.textAlign = 'left';
    }
    // Banner and dialogue.
    if (state.missions.bannerTimer > 0 && state.missions.banner) {
      g.fillStyle = 'rgba(10,14,20,0.8)';
      const w = g.measureText(state.missions.banner).width + 40;
      g.beginPath();
      g.roundRect(VIEW.width / 2 - w / 2, 96, w, 40, 10);
      g.fill();
      g.fillStyle = '#3fd47e';
      g.font = 'bold 16px ' + FONT;
      g.textAlign = 'center';
      g.fillText(state.missions.banner, VIEW.width / 2, 122);
      g.textAlign = 'left';
    }
    if (state.missions.dialogueTimer > 0 && state.missions.dialogue) {
      g.fillStyle = 'rgba(10,14,20,0.85)';
      g.beginPath();
      g.roundRect(180, VIEW.height - 190, VIEW.width - 360, 64, 10);
      g.fill();
      g.fillStyle = '#ffd21f';
      g.font = 'bold 13px ' + FONT;
      g.fillText('MARA VOSS — FIXER', 200, VIEW.height - 166);
      g.fillStyle = '#e8e8e8';
      g.font = '14px ' + FONT;
      wrapText(state.missions.dialogue, 200, VIEW.height - 146, VIEW.width - 400, 18);
    }
    // Bust progress bar.
    if (state.player.bustProgress > 0) {
      g.fillStyle = 'rgba(10,14,20,0.8)';
      g.beginPath();
      g.roundRect(VIEW.width / 2 - 130, VIEW.height / 2 - 90, 260, 30, 8);
      g.fill();
      g.fillStyle = '#ff5a4e';
      g.font = 'bold 14px ' + FONT;
      g.textAlign = 'center';
      g.fillText('BUSTED INCOMING…', VIEW.width / 2, VIEW.height / 2 - 70);
      g.textAlign = 'left';
    }
    g.restore();
  }

  function drawWorld(state) {
    const cam = camera(state.player);
    g.drawImage(cityBase, cam.x, cam.y, VIEW.width, VIEW.height, 0, 0, VIEW.width, VIEW.height);
    g.save();
    g.translate(-cam.x, -cam.y);
    // Place labels so the city reads as named places, not blank blocks.
    g.font = 'bold 13px ' + FONT;
    g.textAlign = 'center';
    Object.values(state.city.places).forEach((place) => {
      g.fillStyle = 'rgba(10,14,20,0.55)';
      const w = g.measureText(place.name).width + 16;
      g.beginPath();
      g.roundRect(place.x - w / 2, place.y - 34, w, 20, 6);
      g.fill();
      g.fillStyle = '#f2f0e6';
      g.fillText(place.name, place.x, place.y - 20);
    });
    g.textAlign = 'left';
    // Mission marker: a pulsing ring and a beam.
    const marker = missionMarker(state.missions);
    if (marker) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.12;
      g.strokeStyle = '#ffd21f';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,210,31,0.25)';
      g.beginPath();
      g.arc(marker.x, marker.y, 26 * pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,210,31,0.18)';
      g.fillRect(marker.x - 4, marker.y - 260, 8, 260);
    }
    state.entities.parked.forEach((car) => drawCar(g, car, state.time, false));
    state.entities.traffic.forEach((car) => drawCar(g, car, state.time, false));
    state.entities.policeCars.forEach((car) => drawCar(g, car, state.time, false));
    state.entities.birds.forEach((bird) => drawBird(g, bird));
    state.entities.peds.forEach((ped) => drawPed(g, ped, state.time));
    state.entities.footCops.forEach((cop) => drawPed(g, cop, state.time));
    if (state.player.car) drawCar(g, state.player.car, state.time, true);
    else drawPlayerOnFoot(g, state.player, state.time);
    // Particles.
    state.entities.particles.forEach((p) => {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;
    g.restore();
    return cam;
  }

  function overlay(title, lines, accent) {
    g.fillStyle = 'rgba(8,10,16,0.72)';
    g.fillRect(0, 0, VIEW.width, VIEW.height);
    g.textAlign = 'center';
    g.fillStyle = accent || '#ffd21f';
    g.font = 'bold 64px ' + FONT;
    g.fillText(title, VIEW.width / 2, 240);
    g.fillStyle = '#e8e8e8';
    g.font = '18px ' + FONT;
    lines.forEach((line, i) => g.fillText(line, VIEW.width / 2, 300 + i * 30));
    g.textAlign = 'left';
  }

  return {
    draw(state) {
      g.clearRect(0, 0, VIEW.width, VIEW.height);
      if (state.screen === SCREEN_TITLE) {
        // A slow pan over the city behind the title.
        const panX = (Math.sin(state.time * 0.05) * 0.5 + 0.5) * (WORLD.width - VIEW.width);
        const panY = 500 + Math.sin(state.time * 0.03) * 300;
        g.drawImage(cityBase, panX, panY, VIEW.width, VIEW.height, 0, 0, VIEW.width, VIEW.height);
        g.fillStyle = 'rgba(8,10,16,0.55)';
        g.fillRect(0, 0, VIEW.width, VIEW.height);
        g.textAlign = 'center';
        g.fillStyle = '#ffd21f';
        g.font = 'bold 84px ' + FONT;
        g.fillText('SOLMARINA', VIEW.width / 2, 250);
        g.fillStyle = '#ffffff';
        g.font = '22px ' + FONT;
        g.fillText('An open-world crime story in a city that never sleeps', VIEW.width / 2, 295);
        g.fillStyle = '#cfd6de';
        g.font = '16px ' + FONT;
        g.fillText('WASD drive & walk · E enter / exit car · F punch · Mouse aim, click shoot', VIEW.width / 2, 360);
        g.fillText('Shift run · Space handbrake · H honk · J next job · P pause · M mute', VIEW.width / 2, 388);
        g.fillText('Steal cars, lose the cops, run jobs for Mara Voss.', VIEW.width / 2, 430);
        g.fillStyle = '#ffd21f';
        g.font = 'bold 20px ' + FONT;
        g.fillText(state.hasSave ? 'Press Enter — continue your story' : 'Press Enter — start your story', VIEW.width / 2, 500);
        g.textAlign = 'left';
        return;
      }
      const cam = drawWorld(state);
      if (state.screen === SCREEN_PLAY || state.screen === SCREEN_PAUSED) {
        drawHud(state);
        drawMinimap(state, cam);
      }
      if (state.screen === SCREEN_PAUSED) {
        overlay('PAUSED', ['WASD move · E car · F punch · J job · M mute', 'Press P or Enter to keep playing'], '#e8e8e8');
      }
      if (state.screen === SCREEN_BUSTED) {
        overlay('BUSTED', [`The Solmarina PD took you in. Fine: $${state.fee || 0}.`, 'Press Enter to walk out of the station'], '#ff5a4e');
      }
      if (state.screen === SCREEN_WASTED) {
        overlay('WASTED', [`Solmarina General patched you up. Bill: $${state.fee || 0}.`, 'Press Enter to get back on the street'], '#ff5a4e');
      }
    },
  };
}
