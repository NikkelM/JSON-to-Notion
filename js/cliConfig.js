// Pure builders that turn parsed CLI options into a configuration object
// Kept separate from bin/cli.js so they can be unit tested, and they throw on invalid input so the CLI can report the error and exit

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { InvalidArgumentError } from 'commander';

import { normalizeNotionId } from './utils.js';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schema = JSON.parse(fs.readFileSync(path.join(packageDir, 'config.schema.json'), 'utf8').replace(/^\uFEFF/, ''));
export const MAPPING_TYPES = schema.properties.propertyMappings.items.properties.notionPropertyType.enum;

// Parse a single --map value of the form "jsonKey:NotionPropertyName:type"
export function parseMapping(value) {
	const first = value.indexOf(':');
	const second = value.indexOf(':', first + 1);
	if (first < 1 || second < 0) {
		throw new InvalidArgumentError(`invalid --map "${value}": expected the form jsonKey:NotionPropertyName:type.`);
	}
	const jsonKey = value.slice(0, first);
	const notionPropertyName = value.slice(first + 1, second);
	const notionPropertyType = value.slice(second + 1);
	if (!notionPropertyName) {
		throw new InvalidArgumentError(`invalid --map "${value}": the Notion property name must not be empty.`);
	}
	if (!MAPPING_TYPES.includes(notionPropertyType)) {
		throw new InvalidArgumentError(`invalid --map type "${notionPropertyType}". Valid types: ${MAPPING_TYPES.join(', ')}.`);
	}
	return { jsonKey, notionPropertyName, notionPropertyType };
}

// Commander collector for the repeatable --map option
export function collectMapping(value, previous = []) {
	return previous.concat(parseMapping(value));
}

// True if any config-building flag was provided on the command line (so we build from flags instead of a config file)
export function usedBuildingFlags(command) {
	return ['databaseId', 'dataSourceId', 'map'].some((name) => command.getOptionValueSource(name) === 'cli');
}

// Build a full configuration object from parsed CLI options
export function buildConfig(options) {
	if (!options.databaseId) {
		throw new Error('provide --database-id (the Notion database ID), or a config.json.');
	}
	const notionDatabaseId = normalizeNotionId(options.databaseId);
	if (!notionDatabaseId) {
		throw new Error(`"${options.databaseId}" is not a valid Notion database ID (expected a 32-character hex ID or dashed UUID).`);
	}
	const propertyMappings = options.map ?? [];
	if (propertyMappings.length === 0) {
		throw new Error('provide at least one --map <jsonKey:NotionPropertyName:type>, or a config.json.');
	}

	const config = {
		$schema: 'config.schema.json',
		notionDatabaseId
	};
	if (options.dataSourceId) {
		const notionDataSourceId = normalizeNotionId(options.dataSourceId);
		if (!notionDataSourceId) {
			throw new Error(`"${options.dataSourceId}" is not a valid Notion data source ID (expected a 32-character hex ID or dashed UUID).`);
		}
		config.notionDataSourceId = notionDataSourceId;
	}
	config.inputFile = options.input ?? 'input.json';
	config.writeErroredObjectsToFile = options.writeErrored ?? true;
	config.propertyMappings = propertyMappings;
	return config;
}
