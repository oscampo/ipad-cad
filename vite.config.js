import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Identificador de la compilacion: el commit corto desde el que se genera (con «+» si hay cambios sin commitear). Se ve junto a la
// version, abajo a la izquierda del dibujo, para saber exactamente que compilacion corre cada dispositivo.
const git = (cmd) => execSync(cmd, { cwd: new URL('.', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); // en la carpeta del proyecto, no en la de quien lanza vite
let build = 'dev';
try { build = git('git rev-parse --short HEAD') + (git('git status --porcelain') ? '+' : ''); } catch { /* sin git: queda «dev» */ }

export default defineConfig({ base: './', build: { target: 'es2022' }, define: { __BUILD__: JSON.stringify(build) } });
