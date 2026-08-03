import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

import mo from 'motoko';

const projectRoot = resolve(import.meta.dirname, '..');
const backendRoot = join(projectRoot, 'src', 'backend');
const testRoot = join(projectRoot, 'test');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

await mo.installPackages({
  core: 'caffeinelabs/motoko-core/v2.6.1/src',
});

const motokoFiles = [...walk(backendRoot), ...walk(testRoot)].filter(file => file.endsWith('.mo'));
for (const absolute of motokoFiles) {
  const virtualPath = relative(projectRoot, absolute).replaceAll('\\', '/');
  mo.write(virtualPath, readFileSync(absolute, 'utf8'));
}

mo.setExtraFlags([
  '--default-persistent-actors',
  '-W=M0223,M0236,M0237',
]);

const entrypoint = 'src/backend/main.mo';
const testEntrypoint = 'test/backend.test.mo';
const diagnostics = [...mo.check(entrypoint), ...mo.check(testEntrypoint)];

for (const diagnostic of diagnostics) {
  const line = diagnostic.range.start.line + 1;
  const column = diagnostic.range.start.character + 1;
  console.error(`${diagnostic.source}:${line}:${column} ${diagnostic.code} ${diagnostic.message}`);
}

try {
  const candid = mo.candid(entrypoint);
  mo.wasm(entrypoint, 'ic');
  const test = mo.run(testEntrypoint);
  if (test.result.error) {
    throw new Error(test.result.error.message ?? test.stderr ?? 'Motoko tests failed.');
  }

  console.log(`Motoko check passed (${mo.version}).`);
  console.log('Motoko unit tests passed.');
  if (process.argv.includes('--candid')) {
    console.log('\n--- CANDID ---');
    console.log(candid);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
