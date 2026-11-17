import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const generator = join(root, 'scripts/generate-api.mjs');
export const fixture = join(root, 'tests/fixtures/openapi.json');

export async function workspace(t) {
    const parent = join(root, '.test-tmp');
    await mkdir(parent, {recursive: true});
    const cwd = await mkdtemp(join(parent, 'api-'));
    t.after(() => rm(cwd, {recursive: true, force: true}));
    return cwd;
}

export function run(args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {cwd, env: process.env});
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', (data) => {
            stdout += data;
        });
        child.stderr.setEncoding('utf8').on('data', (data) => {
            stderr += data;
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({code, stdout, stderr}));
    });
}

export function generate(cwd, ...args) {
    return run([generator, ...args], cwd);
}

export function readDeclarations(cwd) {
    return readFile(join(cwd, 'src/api/schema.d.ts'), 'utf8');
}
