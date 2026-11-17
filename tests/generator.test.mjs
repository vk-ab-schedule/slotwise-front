import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access, readFile, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture, generate, readDeclarations, workspace} from './helpers.mjs';

test('generates only TypeScript declarations from an OpenAPI file', async (t) => {
    const cwd = await workspace(t);
    const result = await generate(cwd, fixture);
    assert.equal(result.code, 0, result.stderr);
    const types = await readDeclarations(cwd);
    await assert.rejects(access(join(cwd, 'openapi', 'slotwise.json')), {code: 'ENOENT'});
    assert.match(types, /export interface paths/);
    assert.match(types, /name: string;/);
    assert.match(types, /kind: "ROOM" \| "GROUP"/);
    assert.match(types, /note\?: string \| null/);
});

test('canonicalizes key order, reproduces bytes, and leaves unchanged files untouched', async (t) => {
    const cwd = await workspace(t);
    assert.equal((await generate(cwd, fixture)).code, 0);
    const before = await readDeclarations(cwd);
    const originalTime = (await stat(join(cwd, 'src/api/schema.d.ts'))).mtimeMs;
    const reverseKeys = (value) => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;
    const reordered = join(cwd, 'reordered.json');
    await writeFile(reordered, JSON.stringify(reverseKeys(JSON.parse(await readFile(fixture, 'utf8')))));
    const checked = await generate(cwd, '--check', reordered);
    assert.equal(checked.code, 0, checked.stderr);
    assert.equal((await generate(cwd, reordered)).code, 0);
    assert.equal(await readDeclarations(cwd), before);
    assert.equal((await stat(join(cwd, 'src/api/schema.d.ts'))).mtimeMs, originalTime);
});

test('--check reports missing declarations without creating them', async (t) => {
    const cwd = await workspace(t);
    const result = await generate(cwd, fixture, '--check');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /src\/api\/schema.d.ts/);
    await assert.rejects(access(join(cwd, 'openapi')));
    await assert.rejects(access(join(cwd, 'src')));
});

test('--check detects an updated schema without rewriting; generation repairs it', async (t) => {
    const cwd = await workspace(t);
    assert.equal((await generate(cwd, fixture)).code, 0);
    const before = await readDeclarations(cwd);
    const changed = JSON.parse(await readFile(fixture, 'utf8'));
    changed.components.schemas.Widget.properties.capacity = {type: 'integer'};
    const source = join(cwd, 'changed.json');
    await writeFile(source, JSON.stringify(changed));
    const result = await generate(cwd, '--check', source);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /[Ss]tale/);
    assert.equal(await readDeclarations(cwd), before);
    assert.equal((await generate(cwd, source)).code, 0);
    assert.match(await readDeclarations(cwd), /capacity\?: number/);
    assert.equal((await generate(cwd, source, '--check')).code, 0);
});

test('--check catches edited declarations even when the source is unchanged', async (t) => {
    const cwd = await workspace(t);
    assert.equal((await generate(cwd, fixture)).code, 0);
    await writeFile(join(cwd, 'src/api/schema.d.ts'), '// stale\n');
    const result = await generate(cwd, fixture, '--check');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /src\/api\/schema.d.ts/);
    assert.equal((await readFile(join(cwd, 'src/api/schema.d.ts'), 'utf8')), '// stale\n');
});

test('rejects malformed JSON, invalid OpenAPI and broken refs before touching outputs', async (t) => {
    const cwd = await workspace(t);
    assert.equal((await generate(cwd, fixture)).code, 0);
    const before = await readDeclarations(cwd);
    const brokenRef = JSON.parse(await readFile(fixture, 'utf8'));
    brokenRef.paths['/test/widgets/{id}'].get.responses['200'].content['application/json'].schema.$ref = '#/components/schemas/Missing';
    for (const source of ['{broken', '{}', 'null', '{"openapi":"2.0","paths":{}}', JSON.stringify(brokenRef)]) {
        const path = join(cwd, 'invalid.json');
        await writeFile(path, source);
        const result = await generate(cwd, path);
        assert.equal(result.code, 1, source);
        assert.ok(result.stderr.trim());
        assert.equal(await readDeclarations(cwd), before);
    }
});

test('loads HTTP JSON and fails on HTTP errors without overwriting outputs', async (t) => {
    const cwd = await workspace(t);
    const body = await readFile(fixture, 'utf8');
    const server = createServer((request, response) => {
        response.writeHead(request.url === '/schema' ? 200 : 503, {'Content-Type': 'application/json'});
        response.end(body);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const result = await generate(cwd, `${origin}/schema`);
    assert.equal(result.code, 0, result.stderr);
    const before = await readDeclarations(cwd);
    assert.equal((await generate(cwd, `${origin}/schema`, '--check')).code, 0);
    const failed = await generate(cwd, `${origin}/unavailable`);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /503/);
    assert.equal(await readDeclarations(cwd), before);
});

test('rejects missing files and unknown options with useful diagnostics', async (t) => {
    const cwd = await workspace(t);
    assert.match((await generate(cwd, 'absent.json')).stderr, /absent.json/);
    const result = await generate(cwd, '--chek');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /[Uu]nknown.*--chek/);
});

test('accepts file URLs as schema sources', async (t) => {
    const cwd = await workspace(t);
    const result = await generate(cwd, pathToFileURL(fixture).href);
    assert.equal(result.code, 0, result.stderr);
    assert.equal((await generate(cwd, fixture, '--check')).code, 0);
});

test('rejects external refs so the input fully determines generated declarations', async (t) => {
    const cwd = await workspace(t);
    const schema = JSON.parse(await readFile(fixture, 'utf8'));
    await writeFile(join(cwd, 'external.json'), JSON.stringify(schema.components.schemas.Widget));
    schema.paths['/test/widgets/{id}'].get.responses['200'].content['application/json'].schema.$ref = join(cwd, 'external.json');
    const source = join(cwd, 'schema.json');
    await writeFile(source, JSON.stringify(schema));
    const result = await generate(cwd, source);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /[Ee]xternal.*\$ref/);
    await assert.rejects(access(join(cwd, 'src')));
});
