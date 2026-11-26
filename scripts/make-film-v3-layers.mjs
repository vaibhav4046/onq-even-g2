// Renders every SVG sprite/plate of film v3 to transparent PNG with Playwright/Chromium.
// Output: media/film-v3/work/layers/*.png + manifest.json. Cached by a hash of the art sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const scenes = path.join(root, 'media', 'film-v3', 'scenes');
const out = path.join(root, 'media', 'film-v3', 'work', 'layers');
fs.mkdirSync(out, { recursive: true });

const files = fs.readdirSync(scenes).filter((f) => f.endsWith('.js')).sort();
const hash = crypto.createHash('sha1');
for (const f of files) hash.update(fs.readFileSync(path.join(scenes, f)));
hash.update(fs.readFileSync(fileURLToPath(import.meta.url)));
const digest = hash.digest('hex');
const stamp = path.join(out, '.hash');
if (!process.argv.includes('--force') && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === digest) {
  console.log('[layers] up to date'); process.exit(0);
}

const imp = (f) => import(pathToFileURL(path.join(scenes, f)).href);
const { head } = await imp('char.js');
const { standing, handReach } = await imp('body.js');
const { bedroom } = await imp('bg-bedroom.js');
const { street } = await imp('bg-street.js');
const { desk } = await imp('bg-desk.js');
const { balcony } = await imp('bg-balcony.js');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });

async function shot(name, svg, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(out, name + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}

const manifest = { head: { w: 520, h: 640, ax: 262, ay: 502, lens: [324, 344] }, plates: {} };
// bodies / props
const body = standing({});
await shot('body', body.svg, body.w, body.h);
manifest.body = { w: body.w, h: body.h, ax: body.ax, ay: body.ay };
for (const gl of [false, true]) { const hr = handReach({ glasses: gl }); await shot(gl ? 'hand_g2' : 'hand', hr.svg, hr.w, hr.h); manifest.hand = { w: hr.w, h: hr.h }; }

// plates
const plate = async (name, svg, w, h = 1296) => { await shot(name, svg, w, h); manifest.plates[name] = [w, h]; };
const bed = bedroom({ g2: true }), bed2 = bedroom({ g2: false });
await plate('bedroom_back', bed.back, 2304); await plate('bedroom_mid', bed.mid, 2304); await plate('bedroom_mid_noG2', bed2.mid, 2304);
await plate('bedroom_front', bed.front, 2304); await plate('bedroom_fx', bed.fx, 2304);
const st = street();
await plate('street_far', st.far, st.sizes.far); await plate('street_mid', st.mid, st.sizes.mid); await plate('street_near', st.near, st.sizes.near); await plate('street_fg', st.fg, st.sizes.fg);
const dk = desk();
await plate('desk_back', dk.back, 2304); await plate('desk_front', dk.front, 2304); await plate('desk_fx', dk.fx, 2304);
const bl = balcony();
await plate('balcony_back', bl.back, 2304); await plate('balcony_mid', bl.mid, 2304); await plate('balcony_front', bl.front, 2304); await plate('balcony_fx', bl.fx, 2304);

// head variants: expr x eyes(o|b) x mouth(c|o) x glasses(0|1) x look(-1|0|1)
let n = 0;
const R = '#ffe9cf';
for (const expr of ['neutral', 'smile', 'focused', 'surprised', 'sleep']) {
  for (const blink of [false, true]) for (const talk of [false, true]) for (const g of [false, true]) for (const look of [-1, 0, 1]) {
    if (expr === 'sleep' && !blink) continue;
    const key = `h_${expr}_${blink ? 'b' : 'o'}_${talk ? 'o' : 'c'}_g${g ? 1 : 0}_l${look}`;
    await shot(key, head({ expr, blink, talk, glasses: g, look, rim: R, id: 'h' }), 520, 640); n++;
  }
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(stamp, digest);
await browser.close();
console.log(`[layers] rendered ${n} heads + ${Object.keys(manifest.plates).length} plates`);
