// Solmarina's hand-in program (Node 22, standard library only): the game
// is this directory's game/ folder — plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library and no
// network request) — and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Solmarina itself is a 2D top-down open-world crime
// game: a city to walk and drive, traffic that yields and pedestrians
// that flee (and jog), cars to steal, a wanted level with police who
// keep up at full throttle, seven story jobs for Mara Voss (one against
// the clock), combat, a horn, seagulls over the beach, a HUD with a
// minimap, and a save that restores money, job, kit, health and position.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast with a clear error instead of handing in a broken game: the
// two files the browser cannot start without must be beside this file.
for (const required of ['game/index.html', 'game/src/main.js']) {
  if (!existsSync(join(here, required))) {
    throw new Error(`Solmarina is missing ${required}: refusing to hand in a broken entry`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files, in all, or a path under game/ over 1000 bytes:
// game/ counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
