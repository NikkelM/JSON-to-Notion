// Description: Offline tests for the flag-driven config builder (js/cliConfig.js) and the CLI flag-driven path

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildConfig, parseMapping } from '../js/cliConfig.js';
import { validateConfigResult, saveConfigToFile } from '../js/utils.js';

const DB = 'd35461658c304a3e9b4fef1faf895b31';
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'cli.js');
const titleMap = { jsonKey: 'name', notionPropertyName: 'Name', notionPropertyType: 'title' };

describe('parseMapping', () => {
	it('parses jsonKey:NotionName:type', () => {
		assert.deepEqual(parseMapping('name:Name:title'), titleMap);
	});

	it('rejects a malformed mapping', () => {
		assert.throws(() => parseMapping('nope'), /expected the form/);
		assert.throws(() => parseMapping('a:B'), /expected the form/);
	});

	it('rejects an invalid property type', () => {
		assert.throws(() => parseMapping('a:B:not_a_type'), /invalid --map type/);
	});
});

describe('buildConfig', () => {
	it('builds a schema-valid config from the minimal flags', () => {
		const config = buildConfig({ databaseId: DB, map: [titleMap] });
		assert.equal(config.notionDatabaseId, DB);
		assert.equal(config.inputFile, 'input.json');
		assert.equal(config.writeErroredObjectsToFile, true);
		assert.deepEqual(config.propertyMappings, [titleMap]);
		assert.ok(!('notionIntegrationKey' in config), 'the secret must never be built into the config');
		assert.equal(validateConfigResult(config).errors.length, 0);
	});

	it('normalizes a dashed database ID', () => {
		assert.equal(buildConfig({ databaseId: 'd3546165-8c30-4a3e-9b4f-ef1faf895b31', map: [titleMap] }).notionDatabaseId, DB);
	});

	it('threads input, data source ID and --no-write-errored', () => {
		const config = buildConfig({ databaseId: DB, input: 'data.json', dataSourceId: DB, writeErrored: false, map: [titleMap] });
		assert.equal(config.inputFile, 'data.json');
		assert.equal(config.notionDataSourceId, DB);
		assert.equal(config.writeErroredObjectsToFile, false);
	});

	it('throws without a database ID', () => {
		assert.throws(() => buildConfig({ map: [titleMap] }), /--database-id/);
	});

	it('throws without any mapping', () => {
		assert.throws(() => buildConfig({ databaseId: DB, map: [] }), /--map/);
	});

	it('throws on an invalid database ID', () => {
		assert.throws(() => buildConfig({ databaseId: 'fd', map: [titleMap] }), /not a valid Notion database ID/);
	});
});

describe('CLI flag-driven mode', () => {
	function runCli(args) {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'jtn-flags-'));
		try {
			const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NOTION_INTEGRATION_KEY: '' } });
			return { code: result.status, out: (result.stdout ?? '') + (result.stderr ?? '') };
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}

	it('runs entirely from flags with no config.json (reaching the missing input file)', () => {
		const { code, out } = runCli(['--database-id', DB, '--map', 'name:Name:title']);
		assert.equal(code, 1);
		assert.match(out, /Input file does not exist/);
	});

	it('reports an invalid mapping type provided via flags', () => {
		const { code, out } = runCli(['--database-id', DB, '--map', 'name:Name:bogus']);
		assert.notEqual(code, 0);
		assert.match(out, /invalid --map type/);
	});
});

describe('saveConfigToFile', () => {
	it('writes a validated flag-built config and strips secret fields', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jtn-save-'));
		const out = path.join(dir, 'config.json');
		try {
			const config = { ...buildConfig({ databaseId: DB, map: [titleMap] }), notionIntegrationKey: 'secret_should_not_persist' };
			await saveConfigToFile(config, out, ['notionIntegrationKey']);
			const written = JSON.parse(fs.readFileSync(out, 'utf8'));
			assert.ok(!('notionIntegrationKey' in written), 'the secret must never be written to disk');
			assert.equal(written.notionDatabaseId, DB);
			assert.equal(validateConfigResult(written).errors.length, 0);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('refuses to overwrite an existing file non-interactively', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jtn-save-'));
		const out = path.join(dir, 'config.json');
		try {
			fs.writeFileSync(out, '{"existing":true}');
			const originalIsTTY = process.stdin.isTTY;
			process.stdin.isTTY = false;
			try {
				await assert.rejects(saveConfigToFile(buildConfig({ databaseId: DB, map: [titleMap] }), out), /already exists/);
			} finally {
				process.stdin.isTTY = originalIsTTY;
			}
			assert.equal(fs.readFileSync(out, 'utf8'), '{"existing":true}', 'the existing file must be left untouched');
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
