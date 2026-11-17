import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import openapiTS, {astToString, COMMENT_HEADER} from 'openapi-typescript';

const defaultSource = 'http://localhost:8080/v3/api-docs';
const outputPath = 'src/api/schema.d.ts';
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
    return {check, source: source ?? defaultSource};
}

async function readSource(source) {
    if (/^https?:\/\//i.test(source)) {
        const response = await fetch(source, {signal: AbortSignal.timeout(15_000)});
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
        console.log(`${usage}\nDefault source: ${defaultSource}\nOutput: ${outputPath} (relative to the current working directory).`);
        return;
    }
    const {source, check} = parseArgs(process.argv.slice(2));
    const document = JSON.parse(await readSource(source));
    if (!document || typeof document !== 'object' || !/^3\.(0|1)\./.test(document.openapi)
        || !document.info || !document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) {
        throw new Error('Expected an OpenAPI 3.0/3.1 JSON document with info and paths.');
    }
    validateRefs(document);
    const schema = `${JSON.stringify(canonicalize(document), null, 2)}\n`;
    const declarations = COMMENT_HEADER + astToString(await openapiTS(schema, {alphabetize: true, silent: true}));
    const stale = await readExisting(outputPath) !== declarations;
    if (check && stale) {
        throw new Error(`Stale API output: ${outputPath}. Run api:generate with the same source.`);
    }
    if (!check && stale) {
        await mkdir(dirname(outputPath), {recursive: true});
        await writeFile(outputPath, declarations);
    }
    console.log(check ? 'API declarations are current.' : 'API declarations generated.');
}

main().catch((error) => {
    console.error(`API generation failed: ${error.message}`);
    process.exitCode = 1;
});
