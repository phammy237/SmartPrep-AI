#!/usr/bin/env node
/**
 * Regenerates .expo/types/router.d.ts (Expo Router's typed-routes output).
 *
 * That file is gitignored, machine-generated state - it must never be
 * hand-edited. It is ALSO only ever (re)written by the Metro *dev server*
 * (`expo start`'s MetroBundlerDevServer calls startTypescriptTypeGenerationAsync
 * on boot) - `expo export` never triggers it, at least as of the expo-router/
 * @expo-cli versions this project pins. Route discovery for typed routes is
 * pure filesystem scanning of app/, so this does not need a working Supabase
 * connection or any other runtime env var - it works even with no .env.
 *
 * This boots the dev server just long enough for it to write/update that
 * file, then kills it and exits 0. Run this (or `npm run typecheck`) before
 * `tsc --noEmit` whenever a route has been added/removed/renamed.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const routerTypesPath = path.join(projectRoot, '.expo', 'types', 'router.d.ts');
const TIMEOUT_MS = 60000;
const POLL_MS = 500;

const before = fs.existsSync(routerTypesPath) ? fs.statSync(routerTypesPath).mtimeMs : 0;

// A single command string (not an argv array) with shell: true resolves the
// npx.cmd shim on Windows and plain npx elsewhere without Node's shell-arg
// escaping warning - there is no untrusted input here, only fixed literals.
// CI=1 makes the Expo CLI skip interactive prompts.
const child = spawn('npx expo start --web', {
  cwd: projectRoot,
  env: { ...process.env, CI: '1' },
  stdio: 'ignore',
  shell: true,
});

let settled = false;

function finish(code) {
  if (settled) return;
  settled = true;
  clearInterval(poll);
  clearTimeout(timeout);
  if (process.platform === 'win32') {
    // child.kill() alone does not reach the grandchild Metro process npx
    // spawns on Windows - taskkill /T kills the whole tree.
    spawn(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore', shell: true });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  process.exitCode = code;
}

const poll = setInterval(() => {
  if (fs.existsSync(routerTypesPath) && fs.statSync(routerTypesPath).mtimeMs > before) {
    console.log(`Route types regenerated: ${routerTypesPath}`);
    finish(0);
  }
}, POLL_MS);

const timeout = setTimeout(() => {
  console.error('Timed out waiting for Expo Router to regenerate route types.');
  finish(1);
}, TIMEOUT_MS);

child.on('exit', (code) => {
  if (!settled) {
    console.error(`expo start exited before route types were regenerated (code ${code}).`);
    finish(1);
  }
});
