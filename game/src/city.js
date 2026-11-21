// Solmarina, the city itself: a road grid, blocks of buildings, parks, a
// beach and the docks, all generated from one seed, plus the static
// picture of it painted once onto an offscreen canvas so every frame
// only copies the part the camera sees.
import { COLORS, WORLD } from './config.js';
import { mulberry32, pick, range } from './rng.js';

export const BLOCK_TYPES = {
  HOUSES: 'houses',
  SHOPS: 'shops',
  TOWERS: 'towers',
  PARK: 'park',
  LOT: 'lot',
  DOCKS: 'docks',
};

// Named places the missions and the shops point at. Positions are set
// while the blocks are laid out, so every system reads the same spots.
export const PLACES = {
  safehouse: { name: 'Rook\u2019s Garage', kind: 'safehouse' },
  hospital: { name: 'Solmarina General', kind: 'hospital' },
  gunshop: { name: 'Ironworks', kind: 'gunshop' },
  garage: { name: 'Piston & Paint', kind: 'garage' },
  bank: { name: 'Meridian Bank', kind: 'bank' },
  marina: { name: 'Marina Lot', kind: 'marina' },
  pier: { name: 'Sunset Pier', kind: 'pier' },
  docks: { name: 'The Docks', kind: 'docks' },
};

function blockBounds(col, row) {
  const x0 = WORLD.avenues[col] + WORLD.roadHalf;
  const x1 = WORLD.avenues[col + 1] - WORLD.roadHalf;
  const y0 = WORLD.streets[row] + WORLD.roadHalf;
  const y1 = WORLD.streets[row + 1] - WORLD.roadHalf;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parkedSpots = [];
  const blocks = [];
  const places = {};
  const cols = WORLD.avenues.length - 1;
  const rows = WORLD.streets.length - 1;

  // The downtown towers sit in the middle columns; the south row is the
  // industrial docks; the east column faces the beach.
  function blockType(col, row) {
    if (row === rows - 1) return BLOCK_TYPES.DOCKS;
    if (col >= 2 && col <= 4 && row >= 1 && row <= 3) return BLOCK_TYPES.TOWERS;
    const roll = rng();
    if (roll < 0.14) return BLOCK_TYPES.PARK;
    if (roll < 0.28) return BLOCK_TYPES.LOT;
    if (roll < 0.62) return BLOCK_TYPES.HOUSES;
    return BLOCK_TYPES.SHOPS;
  }

  function addBuilding(x, y, w, h, roof, kind) {
    buildings.push({ x, y, w, h, roof, kind, cx: x + w / 2, cy: y + h / 2 });
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const b = blockBounds(col, row);
      const type = blockType(col, row);
      blocks.push({ ...b, type, col, row });
      if (type === BLOCK_TYPES.PARK) {
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: range(rng, b.x0 + 30, b.x1 - 30), y: range(rng, b.y0 + 30, b.y1 - 30), r: range(rng, 12, 20) });
        }
        continue;
      }
      if (type === BLOCK_TYPES.LOT) {
        const horizontal = rng() < 0.5;
        for (let i = 0; i < 6; i += 1) {
          const px = horizontal ? b.x0 + 40 + i * 48 : b.x0 + 60 + (i % 2) * 130;
          const py = horizontal ? b.y0 + 60 + (i % 2) * 120 : b.y0 + 40 + Math.floor(i / 2) * 90;
          parkedSpots.push({ x: px, y: py, angle: horizontal ? 0 : Math.PI / 2 });
        }
        continue;
      }
      if (type === BLOCK_TYPES.DOCKS) {
        for (let i = 0; i < 3; i += 1) {
          // Warehouses must stay inside their block: an earlier build let
          // the third one jut into the avenue and stopped traffic cold.
          const wx = b.x0 + 20 + i * 110;
          const w = Math.min(range(rng, 120, 180), b.x1 - 8 - wx);
          const h = range(rng, 70, 100);
          if (w > 40) addBuilding(wx, b.y0 + 60, w, h, COLORS.warehouseRoof, 'warehouse');
        }
        continue;
      }
      if (type === BLOCK_TYPES.TOWERS) {
        const w = range(rng, 90, 130);
        const h = range(rng, 90, 130);
        addBuilding(b.x0 + (b.w - w) / 2, b.y0 + (b.h - h) / 2, w, h, pick(rng, COLORS.towerRoof), 'tower');
        for (let i = 0; i < 4; i += 1) {
          trees.push({ x: range(rng, b.x0 + 20, b.x1 - 20), y: range(rng, b.y0 + 20, b.y1 - 20), r: range(rng, 9, 14) });
        }
        continue;
      }
      // Houses and shops: two rows of small footprints with a yard gap.
      const rowsOf = 2;
      const perRow = 3;
      for (let r = 0; r < rowsOf; r += 1) {
        for (let c = 0; c < perRow; c += 1) {
          const w = range(rng, 62, 84);
          const h = range(rng, 52, 72);
          const x = b.x0 + 18 + c * ((b.w - 36) / perRow) + range(rng, 0, 12);
          const y = b.y0 + 18 + r * ((b.h - 36) / rowsOf) + range(rng, 0, 10);
          const palette = type === BLOCK_TYPES.HOUSES ? COLORS.houseRoof : COLORS.buildingRoof;
          addBuilding(x, y, w, h, pick(rng, palette), type === BLOCK_TYPES.HOUSES ? 'house' : 'shop');
        }
      }
      for (let i = 0; i < 2; i += 1) {
        trees.push({ x: range(rng, b.x0 + 20, b.x1 - 20), y: range(rng, b.y0 + 20, b.y1 - 20), r: range(rng, 9, 13) });
      }
    }
  }

  // Named places, pinned to fixed blocks so missions always find them.
  function placeAt(kind, col, row, dx, dy) {
    const b = blockBounds(col, row);
    places[kind] = { ...PLACES[kind], x: b.x0 + (dx ?? b.w / 2), y: b.y0 + (dy ?? b.h / 2), col, row };
  }
  placeAt('safehouse', 0, 0);
  placeAt('hospital', 1, 2);
  placeAt('gunshop', 5, 1);
  placeAt('garage', 3, 4);
  placeAt('bank', 3, 2);
  placeAt('marina', 7, 4);
  placeAt('pier', 7, 0);
  placeAt('docks', 4, 5);
  // The pier juts onto the beach at the east edge.
  places.pier.x = WORLD.beachStart + 20;
  places.pier.y = WORLD.streets[0] + 120;
  places.marina.x = WORLD.avenues[7] + 90;
  places.marina.y = WORLD.streets[4] + 150;

  // The lighthouse on the beach by the pier — a landmark you can steer
  // by, and a solid building: the player and cars collide with it like
  // any other structure.
  addBuilding(WORLD.beachStart + 18, places.pier.y - 170, 46, 46, '#e8e8e8', 'lighthouse');

  // A few parked cars on ordinary streets too, so a car is never far.
  for (let i = 0; i < 10; i += 1) {
    const avenue = pick(rng, WORLD.avenues);
    const street = pick(rng, WORLD.streets);
    const along = rng() < 0.5;
    parkedSpots.push({
      x: along ? range(rng, avenue - 300, avenue + 300) : avenue + (rng() < 0.5 ? -46 : 46),
      y: along ? street + (rng() < 0.5 ? -46 : 46) : range(rng, street - 300, street + 300),
      angle: along ? 0 : Math.PI / 2,
    });
  }

  // The road graph: intersections are the nodes, adjacent ones the edges.
  const nodes = [];
  const nodeIndex = new Map();
  WORLD.streets.forEach((y, row) => {
    WORLD.avenues.forEach((x, col) => {
      nodeIndex.set(`${col},${row}`, nodes.length);
      nodes.push({ x, y, col, row });
    });
  });
  const edges = [];
  nodes.forEach((node, i) => {
    if (node.col + 1 < WORLD.avenues.length) edges.push([i, nodeIndex.get(`${node.col + 1},${node.row}`)]);
    if (node.row + 1 < WORLD.streets.length) edges.push([i, nodeIndex.get(`${node.col},${node.row + 1}`)]);
  });

  return { seed, buildings, trees, parkedSpots, blocks, places, nodes, edges };
}

// Circle against the city's building rectangles: push the circle out.
export function collideBuildings(city, x, y, radius) {
  let nx = x;
  let ny = y;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        ny = cy + (dy / d) * radius;
      } else {
        // Dead centre inside the rect: push out along the smallest axis.
        const left = nx - b.x;
        const right = b.x + b.w - nx;
        const top = ny - b.y;
        const bottom = b.y + b.h - ny;
        const m = Math.min(left, right, top, bottom);
        if (m === left) nx = b.x - radius;
        else if (m === right) nx = b.x + b.w + radius;
        else if (m === top) ny = b.y - radius;
        else ny = b.y + b.h + radius;
      }
    }
  }
  return { x: nx, y: ny };
}

export function onRoad(x, y) {
  const nearAvenue = WORLD.avenues.some((ax) => Math.abs(x - ax) <= WORLD.roadHalf + 8);
  const nearStreet = WORLD.streets.some((sy) => Math.abs(y - sy) <= WORLD.roadHalf + 8);
  return nearAvenue || nearStreet;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  WORLD.avenues.forEach((ax) => {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y }; }
  });
  WORLD.streets.forEach((sy) => {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x, y: sy }; }
  });
  return best;
}

// Paint the whole static city once. The frame loop then blits the region
// under the camera instead of redrawing thousands of shapes per frame.
export function paintCityBase(city) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;
  const g = canvas.getContext('2d');

  g.fillStyle = COLORS.grass;
  g.fillRect(0, 0, WORLD.width, WORLD.height);
  // Mow stripes on the grass so the ground is not one flat colour.
  g.fillStyle = COLORS.grassDark;
  for (let y = 0; y < WORLD.height; y += 160) g.fillRect(0, y, WORLD.width, 80);

  // The sea and the beach along the east edge.
  g.fillStyle = COLORS.beach;
  g.fillRect(WORLD.beachStart, 0, WORLD.width - WORLD.beachStart, WORLD.height);
  g.fillStyle = COLORS.sea;
  g.fillRect(WORLD.seaStart, 0, WORLD.width - WORLD.seaStart, WORLD.height);
  g.fillStyle = COLORS.seaDeep;
  for (let y = 40; y < WORLD.height; y += 130) {
    g.beginPath();
    g.moveTo(WORLD.seaStart + 8, y);
    g.quadraticCurveTo(WORLD.seaStart + 40, y + 14, WORLD.seaStart + 70, y);
    g.quadraticCurveTo(WORLD.seaStart + 40, y + 28, WORLD.seaStart + 8, y + 42);
    g.fill();
  }

  // Parks get a deeper green bed.
  city.blocks.forEach((b) => {
    if (b.type === BLOCK_TYPES.PARK) {
      g.fillStyle = COLORS.park;
      g.fillRect(b.x0, b.y0, b.w, b.h);
    }
    if (b.type === BLOCK_TYPES.LOT || b.type === BLOCK_TYPES.DOCKS) {
      g.fillStyle = '#4a4d52';
      g.fillRect(b.x0, b.y0, b.w, b.h);
    }
  });

  // Sidewalks: a pale border around every block.
  g.fillStyle = COLORS.sidewalk;
  city.blocks.forEach((b) => {
    g.fillRect(b.x0 - 8, b.y0 - 8, b.w + 16, b.h + 16);
  });

  // Roads: asphalt strips with a centre dash.
  g.fillStyle = COLORS.road;
  WORLD.avenues.forEach((x) => g.fillRect(x - WORLD.roadHalf, 0, WORLD.roadHalf * 2, WORLD.height));
  WORLD.streets.forEach((y) => g.fillRect(0, y - WORLD.roadHalf, WORLD.width, WORLD.roadHalf * 2));
  g.strokeStyle = COLORS.lane;
  g.lineWidth = 3;
  g.setLineDash([26, 30]);
  WORLD.avenues.forEach((x) => {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, WORLD.height);
    g.stroke();
  });
  WORLD.streets.forEach((y) => {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(WORLD.width, y);
    g.stroke();
  });
  g.setLineDash([]);
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240, 240, 230, 0.75)';
  city.nodes.forEach((n) => {
    for (let i = -2; i <= 2; i += 1) {
      g.fillRect(n.x - 26 + i * 11, n.y - WORLD.roadHalf - 4, 6, 10);
      g.fillRect(n.x - 26 + i * 11, n.y + WORLD.roadHalf - 6, 6, 10);
      g.fillRect(n.x - WORLD.roadHalf - 4, n.y - 26 + i * 11, 10, 6);
      g.fillRect(n.x + WORLD.roadHalf - 6, n.y - 26 + i * 11, 10, 6);
    }
  });

  // Parking-lot stall lines.
  g.strokeStyle = 'rgba(240,240,230,0.6)';
  g.lineWidth = 2;
  city.blocks.forEach((b) => {
    if (b.type !== BLOCK_TYPES.LOT) return;
    for (let x = b.x0 + 40; x < b.x1 - 20; x += 48) {
      g.beginPath();
      g.moveTo(x, b.y0 + 40);
      g.lineTo(x, b.y0 + 100);
      g.stroke();
    }
  });

  // Buildings: a soft shadow, then the roof with a rim and a skylight.
  city.buildings.forEach((b) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    g.fillStyle = b.roof;
    g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(b.x + 8, b.y + 8, Math.min(26, b.w - 16), Math.min(18, b.h - 16));
    if (b.kind === 'tower') {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 14, 28, 28);
    }
  });

  // Trees: a shadowed canopy with a lighter crown.
  city.trees.forEach((t) => {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4e7d3a';
    g.beginPath();
    g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6da34d';
    g.beginPath();
    g.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, Math.PI * 2);
    g.fill();
  });

  // The pier deck: wooden planks running from the beach into the sea at
  // Sunset Pier, with a striped lighthouse standing beside it.
  const pier = city.places.pier;
  g.fillStyle = '#8a6b45';
  g.fillRect(WORLD.beachStart - 6, pier.y - 16, WORLD.seaStart + 90 - (WORLD.beachStart - 6), 32);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.5;
  for (let x = WORLD.beachStart; x < WORLD.seaStart + 80; x += 14) {
    g.beginPath();
    g.moveTo(x, pier.y - 16);
    g.lineTo(x, pier.y + 16);
    g.stroke();
  }
  const light = city.buildings.find((b) => b.kind === 'lighthouse');
  if (light) {
    // Red bands over the white tower, a gallery, and the lamp itself.
    g.fillStyle = '#c94f3d';
    g.fillRect(light.x, light.y + 12, light.w, 9);
    g.fillRect(light.x, light.y + 28, light.w, 9);
    g.fillStyle = '#2e3238';
    g.fillRect(light.x - 3, light.y - 6, light.w + 6, 8);
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(light.cx, light.y - 2, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,233,168,0.18)';
    g.beginPath();
    g.moveTo(light.cx, light.y - 2);
    g.lineTo(WORLD.width, light.y - 60);
    g.lineTo(WORLD.width, light.y + 56);
    g.closePath();
    g.fill();
  }

  // A fountain in a park block that holds no named place: a stone rim
  // around blue water.
  const park = city.blocks.find((b) => b.type === BLOCK_TYPES.PARK
    && !Object.values(city.places).some((p) => p.col === b.col && p.row === b.row));
  if (park) {
    const fx = park.x0 + park.w / 2;
    const fy = park.y0 + park.h / 2;
    g.fillStyle = '#9a8f7a';
    g.beginPath();
    g.arc(fx, fy, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2e7fb4';
    g.beginPath();
    g.arc(fx, fy, 27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.arc(fx - 8, fy - 8, 6, 0, Math.PI * 2);
    g.fill();
  }

  return canvas;
}
