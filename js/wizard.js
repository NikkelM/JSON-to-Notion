// Interactive configuration builder for the CLI (`json-to-notion init`)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { input, password, select, confirm } from '@inquirer/prompts';

import { validateConfig } from './utils.js';
import { run } from './jsonToNotion.js';

// Read the allowed property types straight from the shipped schema so the prompts stay in sync with it
const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schema = JSON.parse(fs.readFileSync(path.join(packageDir, 'config.schema.json'), 'utf8').replace(/^\uFEFF/, ''));
const MAPPING_TYPES = schema.properties.propertyMappings.items.properties.notionPropertyType.enum;
const SKIP_TYPES = schema.properties.skipExisting.properties.propertyType.enum;

export async function runWizard(outputPath = 'config.json') {
	// If a configuration file already exists, confirm overwriting up front so the user can abort early
	if (fs.existsSync(outputPath)) {
		const overwrite = await confirm({ message: `"${outputPath}" already exists. Overwrite it?`, default: false });
		if (!overwrite) {
			console.log('Aborted - the existing configuration file was not changed.');
			return;
		}
	}

	const notionIntegrationKey = await password({
		message: 'Notion integration key (create or find it at https://www.notion.so/my-integrations):',
		mask: true,
		validate: (value) => value.trim() ? true : 'A Notion integration key is required.'
	});

	const notionDatabaseId = await input({
		message: 'Notion database ID (from the database URL):',
		validate: (value) => value.trim() ? true : 'A Notion database ID is required.'
	});

	const notionDataSourceId = await input({
		message: 'Notion data source ID (optional - only needed if the database has multiple data sources):',
		default: ''
	});

	const inputFile = await input({
		message: 'Path to the JSON input file:',
		default: 'input.json',
		validate: (value) => value.trim().endsWith('.json') ? true : 'The input file must be a .json file.'
	});

	// Property mappings - at least one is required
	console.log('\nAdd one or more property mappings (a JSON key -> a Notion property). Advanced options such as "nestedObjectPolicy" can be added by editing the config.json afterwards.');
	const propertyMappings = [];
	do {
		const jsonKey = await input({ message: '  JSON key:', validate: (value) => value.trim() ? true : 'A JSON key is required.' });
		const notionPropertyName = await input({ message: '  Notion property name:', validate: (value) => value.trim() ? true : 'A Notion property name is required.' });
		const notionPropertyType = await select({
			message: '  Notion property type:',
			choices: MAPPING_TYPES.map((type) => ({ name: type, value: type })),
			default: 'rich_text'
		});
		propertyMappings.push({ jsonKey: jsonKey.trim(), notionPropertyName: notionPropertyName.trim(), notionPropertyType });
	} while (await confirm({ message: 'Add another property mapping?', default: false }));

	// skipExisting is optional
	const skipExistingEnabled = await confirm({ message: 'Skip objects that already exist in the database?', default: false });
	let skipExisting;
	if (skipExistingEnabled) {
		const jsonKey = await input({ message: '  skipExisting: JSON key to compare:', validate: (value) => value.trim() ? true : 'A JSON key is required.' });
		const notionProperty = await input({ message: '  skipExisting: Notion property to compare:', validate: (value) => value.trim() ? true : 'A Notion property is required.' });
		const propertyType = await select({
			message: '  skipExisting: property type:',
			choices: SKIP_TYPES.map((type) => ({ name: type, value: type })),
			default: 'rich_text'
		});
		skipExisting = { enabled: true, jsonKey: jsonKey.trim(), notionProperty: notionProperty.trim(), propertyType };
	}

	const writeErroredObjectsToFile = await confirm({ message: 'Write objects that failed to import to a file?', default: true });

	// Build the config in a natural key order (the optional data source ID sits next to the database ID)
	const config = {
		$schema: 'config.schema.json',
		notionIntegrationKey: notionIntegrationKey.trim(),
		notionDatabaseId: notionDatabaseId.trim()
	};
	if (notionDataSourceId.trim()) {
		config.notionDataSourceId = notionDataSourceId.trim();
	}
	config.inputFile = inputFile.trim();
	config.writeErroredObjectsToFile = writeErroredObjectsToFile;
	if (skipExisting) {
		config.skipExisting = skipExisting;
	}
	config.propertyMappings = propertyMappings;
	config.extraProperties = [];

	// Sanity-check the assembled configuration against the schema before writing it
	validateConfig(config);

	fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
	console.log(`\nWrote configuration to "${outputPath}".`);

	const runNow = await confirm({ message: 'Import to Notion with this configuration now?', default: false });
	if (runNow) {
		await run(config);
	}
}
