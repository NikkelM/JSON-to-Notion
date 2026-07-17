// Description: Verifies the init wizard assembles and writes a schema-valid config (prompts mocked)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateConfigResult } from '../js/utils.js';

test('the wizard writes a schema-valid configuration file', async (t) => {
	// Mock @inquirer/prompts so the wizard runs without a TTY, answering by prompt message
	t.mock.module('@inquirer/prompts', {
		namedExports: {
			input: async ({ message }) => {
				if (message.includes('database ID')) return 'database-123';
				if (message.includes('data source ID')) return '';
				if (message.includes('input file')) return 'input.json';
				if (message.includes('JSON key')) return 'name';
				if (message.includes('Notion property name')) return 'Name';
				return '';
			},
			select: async () => 'title',
			confirm: async ({ message }) => {
				if (message.includes('Write objects')) return true;
				// add another mapping / skipExisting / import now / overwrite
				return false;
			}
		}
	});

	const { runWizard } = await import('../js/wizard.js');

	const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jtn-wiz-')), 'config.json');
	await runWizard(outputPath);

	assert.ok(fs.existsSync(outputPath), 'the wizard should write the config file');
	const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

	assert.ok(!('notionIntegrationKey' in written), 'the integration key must never be written to the config file');
	assert.equal(written.notionDatabaseId, 'database-123');
	assert.ok(!('notionDataSourceId' in written), 'an empty data source ID should be omitted');
	assert.deepEqual(written.propertyMappings, [{ jsonKey: 'name', notionPropertyName: 'Name', notionPropertyType: 'title' }]);
	assert.deepEqual(written.extraProperties, []);
	assert.equal(validateConfigResult(written).errors.length, 0, 'the written config should validate against the schema');

	fs.rmSync(path.dirname(outputPath), { recursive: true, force: true });
});
