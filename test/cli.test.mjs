// Description: Subprocess tests for the CLI config-loading guards (no network, no credentials)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'cli.js');

const validConfig = {
	$schema: 'config.schema.json',
	notionIntegrationKey: 'secret_key',
	notionDatabaseId: 'db-id',
	inputFile: 'input.json',
	propertyMappings: [{ jsonKey: 'name', notionPropertyName: 'Name', notionPropertyType: 'title' }]
};

// Run the CLI in a throwaway working directory, optionally seeding files first
function runCli(args, files = {}) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'jtn-cli-'));
	try {
		for (const [name, contents] of Object.entries(files)) {
			fs.writeFileSync(path.join(cwd, name), contents);
		}
		const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
		return { code: result.status, out: (result.stdout ?? '') + (result.stderr ?? '') };
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
}

describe('CLI configuration guards', () => {
	it('exits with a friendly message when no config file is found', () => {
		const { code, out } = runCli([]);
		assert.equal(code, 1);
		assert.match(out, /no "config\.json" found/);
	});

	it('reports a malformed config file as invalid JSON', () => {
		const { code, out } = runCli([], { 'config.json': '{ not valid json ' });
		assert.equal(code, 1);
		assert.match(out, /Error parsing configuration file/);
	});

	it('rejects an unknown top-level config key', () => {
		const config = { ...validConfig, bogusKey: true };
		const { code, out } = runCli([], { 'config.json': JSON.stringify(config) });
		assert.equal(code, 1);
		assert.match(out, /Error validating configuration file/);
	});

	it('strips a UTF-8 BOM before parsing the config', () => {
		// A BOM-prefixed valid config must parse and validate, then stop at the missing input file
		const { code, out } = runCli([], { 'config.json': '\uFEFF' + JSON.stringify(validConfig) });
		assert.equal(code, 1);
		assert.match(out, /Input file does not exist/);
	});

	it('reports a missing input file after a valid config', () => {
		const { code, out } = runCli([], { 'config.json': JSON.stringify(validConfig) });
		assert.equal(code, 1);
		assert.match(out, /Input file does not exist/);
	});

	it('errors when --config points at a nonexistent file', () => {
		const { code, out } = runCli(['--config', 'nope.json']);
		assert.equal(code, 1);
		assert.match(out, /no configuration file found/);
	});
});
