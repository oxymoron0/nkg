#!/usr/bin/env node
/**
 * Pre-commit verification checklist.
 *
 * Runs every quality gate in sequence and reports a single summary at the
 * end — unlike `npm run build`, a failed gate does NOT abort subsequent
 * gates. This lets a single invocation surface every issue that needs
 * attention before the next commit.
 *
 * Usage:  npm run check
 */

import { spawn } from 'node:child_process';

/** @typedef {{ label: string, cmd: string, args: string[] }} Gate */

/** @type {Gate[]} */
const gates = [
  { label: 'lint', cmd: 'npx', args: ['eslint', '.'] },
  { label: 'format', cmd: 'npx', args: ['prettier', '--check', '.'] },
  { label: 'typecheck', cmd: 'npx', args: ['tsc', '-b', '--noEmit'] },
  { label: 'knip', cmd: 'npx', args: ['knip'] },
  { label: 'test', cmd: 'npx', args: ['vitest', 'run'] },
  { label: 'build', cmd: 'npx', args: ['vite', 'build'] },
];

/**
 * @param {Gate} gate
 * @returns {Promise<{ label: string, ok: boolean, seconds: number, output: string }>}
 */
function run(gate) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn(gate.cmd, gate.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    proc.stdout.on('data', (d) => {
      output += d.toString();
    });
    proc.stderr.on('data', (d) => {
      output += d.toString();
    });
    proc.on('close', (code) => {
      const seconds = (Date.now() - start) / 1000;
      resolve({ label: gate.label, ok: code === 0, seconds, output });
    });
    proc.on('error', (err) => {
      const seconds = (Date.now() - start) / 1000;
      resolve({ label: gate.label, ok: false, seconds, output: String(err) });
    });
  });
}

const results = [];
for (const gate of gates) {
  process.stdout.write(`→ ${gate.label}… `);
  const r = await run(gate);
  results.push(r);
  process.stdout.write(`${r.ok ? '✓' : '✗'}  (${r.seconds.toFixed(1)}s)\n`);
}

console.log('\n─────────────── Summary ───────────────');
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.label.padEnd(10)} (${r.seconds.toFixed(1)}s)`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log('\nAll 6 gates passed. Safe to commit.');
  process.exit(0);
} else {
  console.log(`\n${failed.length}/${results.length} gate(s) failed:\n`);
  for (const r of failed) {
    console.log(`── ${r.label} output ──`);
    console.log(r.output.trimEnd());
    console.log('');
  }
  console.log(`Fix the failing gate(s) above before committing.`);
  process.exit(1);
}
