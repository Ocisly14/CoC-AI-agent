// Render the editable design SVGs; ART_NODE_DEPS optionally selects bundled sharp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require(process.env.ART_NODE_DEPS ? path.join(process.env.ART_NODE_DEPS, 'sharp') : 'sharp');
for (const name of fs.readdirSync(path.join(root, 'ui')).filter(n => n.endsWith('.svg'))) {
  const out = name === '02-ui-board.svg' ? 'boards/02-ui.png' : 'qa/' + name.replace('.svg', '.png');
  await sharp(fs.readFileSync(path.join(root, 'ui', name))).png().toFile(path.join(root, out));
  console.log(out);
}
