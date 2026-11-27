import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const defaultSource = 'http://localhost:8080/v3/api-docs';
const usage = 'Usage: npm run api:generate -- [--check] [file.json | http(s)://host/v3/api-docs]';

function parseArgs(args) {
  let check = false;
  let source;
  for (const arg of args) {
    if (arg === '--check') check = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}\n${usage}`);
    else if (source !== undefined) throw new Error(`Expected a single schema source.\n${usage}`);
    else source = arg;
  }
  return { check, source: source ?? defaultSource };
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`OpenAPI source returned HTTP ${response.status}.`);
    return response.text();
  }
  return readFile(source.startsWith('file:') ? fileURLToPath(source) : resolve(source), 'utf8');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function validateRefs(value) {
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value && (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/'))) {
    throw new Error('External or invalid $ref is unsupported; export a self-contained OpenAPI document.');
  }
  for (const child of Object.values(value)) validateRefs(child);
}

async function readExisting(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function main() {
  if (process.argv.slice(2).includes('--help')) {
    console.log(`${usage}\nDefault source: ${defaultSource}\nOutputs are relative to the current working directory.`);
    return;
  }
  const { source, check } = parseArgs(process.argv.slice(2));
  const document = JSON.parse(await readSource(source));
  if (!document || typeof document !== 'object' || !/^3\.(0|1)\./.test(document.openapi)
      || !document.info || !document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) {
    throw new Error('Expected an OpenAPI 3.0/3.1 JSON document with info and paths.');
  }
  validateRefs(document);
  const snapshot = `${JSON.stringify(canonicalize(document), null, 2)}\n`;
  // Generate from the exact snapshot bytes, independent of source location/key order.
  const declarations = COMMENT_HEADER + astToString(await openapiTS(snapshot, { alphabetize: true, silent: true }));
  const outputs = [
    ['openapi/slotwise.json', snapshot],
    ['src/api/schema.d.ts', declarations],
  ];
  const stale = [];
  for (const [path, contents] of outputs) {
    if (await readExisting(path) !== contents) stale.push([path, contents]);
  }
  if (check && stale.length) {
    throw new Error(`Stale API output: ${stale.map(([path]) => path).join(', ')}. Run api:generate with the same source.`);
  }
  if (!check) {
    for (const [path, contents] of stale) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
  }
  console.log(check ? 'API snapshot and declarations are current.' : 'API snapshot and declarations generated.');
}

main().catch((error) => {
  console.error(`API generation failed: ${error.message}`);
  process.exitCode = 1;
});
