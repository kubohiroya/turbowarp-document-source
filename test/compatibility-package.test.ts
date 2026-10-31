import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

test('packed legacy APIs resolve to one packed canonical implementation', async () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'document-source-compat-'));
    try {
        const pack = (cwd: string) => {
            const result = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary, '--cache', path.join(temporary, 'cache')], {cwd, encoding: 'utf8'}));
            return path.join(temporary, result[0].filename);
        };
        const canonicalArchive = pack(root);
        const facadeArchive = pack(path.join(root, 'compat/embedded-yaml'));
        const scope = path.join(temporary, 'node_modules/@kubohiroya');
        const canonical = path.join(scope, 'turbowarp-document-source');
        const facade = path.join(scope, 'turbowarp-embedded-yaml');
        await fs.mkdir(canonical, {recursive: true});
        await fs.mkdir(facade, {recursive: true});
        for (const [archive, destination] of [[canonicalArchive, canonical], [facadeArchive, facade]]) {
            execFileSync('tar', ['-xzf', archive, '--strip-components', '1', '-C', destination]);
        }
        for (const name of ['turbowarp-document-data', 'turbowarp-yaml-json']) {
            const dependency = await fs.realpath(path.join(root, 'node_modules/@kubohiroya', name));
            await fs.symlink(dependency, path.join(scope, name));
        }
        const previous = await import(pathToFileURL(path.join(facade, 'dist/index.js')).href);
        const current = await import(pathToFileURL(path.join(canonical, 'dist/index.js')).href);
        assert.equal(previous.createEmbeddedYamlHatDefinition, current.createEmbeddedYamlHatDefinition);
        assert.equal(previous.readReference, current.readReference);
        const vm = {};
        assert.equal(previous.getProviderRegistry(vm), current.getProviderRegistry(vm));
        previous.getProviderRegistry(vm).dispose();
        const manifest: {exports: Record<string, string | {import: string}>} = JSON.parse(await fs.readFile(path.join(facade, 'package.json'), 'utf8'));
        for (const [subpath, entry] of Object.entries(manifest.exports)) {
            if (subpath === '.' || typeof entry !== 'object') continue;
            const oldModule = await import(pathToFileURL(path.join(facade, entry.import)).href);
            const currentManifest = JSON.parse(await fs.readFile(path.join(canonical, 'package.json'), 'utf8'));
            const newModule = await import(pathToFileURL(path.join(canonical, currentManifest.exports[subpath].import)).href);
            assert.deepEqual(Object.keys(oldModule).sort(), Object.keys(newModule).sort());
            for (const name of Object.keys(oldModule)) assert.equal(oldModule[name], newModule[name], subpath + ':' + name);
        }
        assert.equal(await fs.readFile(path.join(facade, 'LICENSE'), 'utf8'), await fs.readFile(path.join(canonical, 'LICENSE'), 'utf8'));
    } finally {
        await fs.rm(temporary, {recursive: true, force: true});
    }
});
