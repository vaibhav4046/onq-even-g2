import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const manifestPath = path.join(root, 'apps', 'glasses', 'app.json');
const buildDir = path.join(root, 'apps', 'glasses', 'dist');
const outEhpk = path.join(distDir, 'onq.ehpk');

const cliBin = path.join(root, 'node_modules', '@evenrealities', 'evenhub-cli', 'main.js');
execFileSync(process.execPath, [cliBin, 'pack', manifestPath, buildDir, '-o', outEhpk, '--sdk-ver', '0.0.16'], {
  stdio: 'inherit',
});

const stat = fs.statSync(outEhpk);
console.log(`[pack] Built ${outEhpk} (${stat.size} bytes)`);
