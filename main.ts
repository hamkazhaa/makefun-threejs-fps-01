// Harbour Line — entry point for the threejs-fps-01 bounty.
//
// Runs on Node 22 with the standard library only. The game itself is the
// plain static files in game/ beside this file: the browser loads them as
// ES modules and resolves three.js through the import map in
// game/index.html. This program has a single responsibility: assemble the
// submission directory. It copies game/ and screenshots/ into the output
// directory ("/output" inside the grader, or MAKEFUN_OUTPUT_DIR elsewhere)
// and writes /output/dossier.json, the summary the judge reads, via the
// vendored make.fun library in vendor/makefun-threejs.ts.
//
// To see the game, run `node serve.ts` and open http://localhost:8080.
// To build a submission directory by hand:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Where the game lives, and where the submission goes. The grader uses
// /output; anywhere else, MAKEFUN_OUTPUT_DIR overrides it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one tree from the repo into the output directory.
function copyTree(from, to) {
  cpSync(join(repoRoot, from), join(outputDir, to), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree('game', 'game');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree('screenshots', 'screenshots');
}

// The scorer's caps, from reference/gate.json. Of these, only
// text_max_bytes can change the dossier's bytes. The rest simply refuse an
// entry the scorer would refuse anyway:
//   - more than 4 screenshots, or one larger than 256 KiB;
//   - more than 993 files under game/, or 48 MiB of game files in total.
// game/ counts against /output's own 1000-entry ceiling alongside
// screenshots/ and dossier.json, so the copy above has to leave them room.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const dossier = buildDossier(outputDir, caps);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
