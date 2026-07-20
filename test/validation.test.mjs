// Description: Offline tests for schema validation of the configuration file

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateConfigResult, normalizeNotionId } from '../js/utils.js';

// A minimal valid config; helpers return mutated copies for the reject cases
const base = () => ({
	$schema: 'config.schema.json',
	notionIntegrationKey: 'secret_key',
	notionDatabaseId: 'd35461658c304a3e9b4fef1faf895b31',
	inputFile: 'input.json',
	propertyMappings: [
		{ jsonKey: 'name', notionPropertyName: 'Name', notionPropertyType: 'title' }
	]
});
const withoutKey = (key) => { const c = base(); delete c[key]; return c; };
const accepts = (config) => validateConfigResult(config).errors.length === 0;

describe('config schema validation', () => {
	it('accepts a minimal valid config', () => {
		assert.ok(accepts(base()));
	});

	it('accepts optional blocks (skipExisting, extraProperties, missingInInputPolicy)', () => {
		const config = base();
		config.skipExisting = { enabled: true, jsonKey: 'id', notionProperty: 'ItemId', propertyType: 'rich_text' };
		config.extraProperties = [{ notionPropertyName: 'Imported by', propertyValue: 'x', notionPropertyType: 'rich_text' }];
		config.missingInInputPolicy = { policy: 'noAction', jsonKey: 'id', notionProperty: 'ItemId', propertyType: 'rich_text' };
		assert.ok(accepts(config));
	});

	it('accepts a nestedObjectPolicy with a priority list', () => {
		const config = base();
		config.propertyMappings[0].nestedObjectPolicy = { policy: 'usePriorityList', priorityList: ['a', 'b'] };
		assert.ok(accepts(config));
	});

	it('accepts a config without notionIntegrationKey (provided via env var or prompt at runtime)', () => {
		assert.ok(accepts(withoutKey('notionIntegrationKey')));
	});

	for (const key of ['notionDatabaseId', 'inputFile', 'propertyMappings']) {
		it(`rejects a config missing the required "${key}"`, () => {
			assert.ok(!accepts(withoutKey(key)));
		});
	}

	it('rejects an unknown top-level key (additionalProperties: false)', () => {
		const config = base();
		config.bogusKey = true;
		assert.ok(!accepts(config));
	});

	it('rejects an empty propertyMappings array (minItems)', () => {
		const config = base();
		config.propertyMappings = [];
		assert.ok(!accepts(config));
	});

	it('rejects an invalid notionPropertyType', () => {
		const config = base();
		config.propertyMappings[0].notionPropertyType = 'not_a_type';
		assert.ok(!accepts(config));
	});

	it('rejects an inputFile that is not a .json path', () => {
		const config = base();
		config.inputFile = 'input.txt';
		assert.ok(!accepts(config));
	});

	it('rejects a notionDatabaseId that is not a valid Notion ID', () => {
		const config = base();
		config.notionDatabaseId = 'fd';
		assert.ok(!accepts(config));
	});

	it('accepts a dashed-UUID notionDatabaseId', () => {
		const config = base();
		config.notionDatabaseId = 'd3546165-8c30-4a3e-9b4f-ef1faf895b31';
		assert.ok(accepts(config));
	});

	it('rejects a usePriorityList nestedObjectPolicy without a priorityList (if/then)', () => {
		const config = base();
		config.propertyMappings[0].nestedObjectPolicy = { policy: 'usePriorityList' };
		assert.ok(!accepts(config));
	});
});

describe('normalizeNotionId', () => {
	const RAW = 'd35461658c304a3e9b4fef1faf895b31';

	it('accepts a bare 32-character hex ID', () => {
		assert.equal(normalizeNotionId(RAW), RAW);
	});

	it('accepts and normalizes a dashed UUID to the 32-character form', () => {
		assert.equal(normalizeNotionId('d3546165-8c30-4a3e-9b4f-ef1faf895b31'), RAW);
	});

	it('extracts the ID from a pasted database URL with a title and query string', () => {
		assert.equal(normalizeNotionId(`https://www.notion.so/myworkspace/My-Database-${RAW}?v=abc123`), RAW);
	});

	it('lowercases an uppercase ID', () => {
		assert.equal(normalizeNotionId(RAW.toUpperCase()), RAW);
	});

	it('rejects too-short, empty or non-hex input', () => {
		assert.equal(normalizeNotionId('fd'), null);
		assert.equal(normalizeNotionId(''), null);
		assert.equal(normalizeNotionId('not-a-valid-id'), null);
		assert.equal(normalizeNotionId('g'.repeat(32)), null);
	});
});
