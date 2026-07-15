// Description: Offline tests for schema validation of the configuration file

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateConfigResult } from '../js/utils.js';

// A minimal valid config; helpers return mutated copies for the reject cases
const base = () => ({
	$schema: 'config.schema.json',
	notionIntegrationKey: 'secret_key',
	notionDatabaseId: 'db-id',
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

	for (const key of ['notionIntegrationKey', 'notionDatabaseId', 'inputFile', 'propertyMappings']) {
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

	it('rejects a usePriorityList nestedObjectPolicy without a priorityList (if/then)', () => {
		const config = base();
		config.propertyMappings[0].nestedObjectPolicy = { policy: 'usePriorityList' };
		assert.ok(!accepts(config));
	});
});
