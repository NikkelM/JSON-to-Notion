// Description: Core import logic - activates a validated config, verifies the Notion database, then creates a Notion page per input object

import cliProgress from 'cli-progress';
import { confirm } from '@inquirer/prompts';

import { CONFIG, INPUTFILE, initConfig, resolveSecret, writeErroredObjectsToFile, writeObjectsMissingInInputToFile } from './utils.js';
import { checkNotionPropertiesExistence, createNotionPage, removeNotionPage, getExistingPagesFromNotionDatabase } from './notion.js';

// Activate the given (already validated) config, verify the Notion database, then import every input object
export async function run(config) {
	initConfig(config);

	CONFIG.notionIntegrationKey = await resolveSecret({
		envVar: 'NOTION_INTEGRATION_KEY',
		configValue: CONFIG.notionIntegrationKey,
		configField: 'notionIntegrationKey',
		promptMessage: 'Notion integration key (create or find it at https://www.notion.so/my-integrations):',
		label: 'Notion integration key'
	});

	try {
		await checkNotionPropertiesExistence();
	} catch (error) {
		if (error?.code === 'unauthorized') {
			console.error("\nError: Your Notion integration key is invalid. Set a valid key via the NOTION_INTEGRATION_KEY environment variable (create or find it at https://www.notion.so/my-integrations).");
		} else if (error?.code === 'object_not_found') {
			console.error("\nError: The Notion database was not found, or your integration has not been granted access to it. Check \"notionDatabaseId\" and share the database with your integration.");
		} else {
			console.error("\nError connecting to Notion: " + (error?.message ?? error));
		}
		process.exit(1);
	}

	await importObjects();
}

async function importObjects() {
	let shouldGetPagesInDB = false;
	let objectsAlreadyInDB = [];

	// If we should skip existing objects, get a list of all objects with the given notionProperty set to some value, these will be skipped later on
	if (CONFIG.skipExisting?.enabled) {
		shouldGetPagesInDB = true;
		var numObjectsSkipped = 0;
		console.log("Skipping existing objects is enabled, the database will be queried for existing objects.");
	}

	// If we should take some action for objects that exist in the database but not the input
	if (CONFIG.missingInInputPolicy && CONFIG.missingInInputPolicy.policy !== "noAction") {
		shouldGetPagesInDB = true;
		var numObjectsMissingInInput = 0;
		var pagesMissingInInput = [];
		console.log(`The "${CONFIG.missingInInputPolicy.policy}" policy is enabled for items missing in the input file, the database will be queried for existing objects.`);
	}

	if (shouldGetPagesInDB) {
		console.log("Getting objects from the database...");
		objectsAlreadyInDB = await getExistingPagesFromNotionDatabase();
	}

	// For the skipExisting policy, only get the skippedPropertyValue of the objectsAlreadyInDB (normalized to strings, since Notion returns text while the JSON value may be a number)
	if (CONFIG.skipExisting?.enabled) {
		var propertiesAlreadyInDB = objectsAlreadyInDB.map(object => String(object.skippedPropertyValue));
	}

	// For the missingInInputPolicy, get all objects that are in the database but not in the input file
	if (CONFIG.missingInInputPolicy && CONFIG.missingInInputPolicy.policy !== "noAction") {
		const inputObjects = Object.values(INPUTFILE).map(object => String(object[CONFIG.missingInInputPolicy.jsonKey]));
		for (const object of objectsAlreadyInDB) {
			// A null value means the page never had this property set (it only matched the skipExisting property in an OR query), so it is not "missing from the input"
			if (object.missingPropertyValue == null) {
				continue;
			}
			if (!inputObjects.includes(String(object.missingPropertyValue))) {
				numObjectsMissingInInput++;
				pagesMissingInInput.push(object);
			}
		}

		console.log(`\nFound ${numObjectsMissingInInput} objects in the database that are not in the input file.`);

		if (numObjectsMissingInInput > 0) {
			switch (CONFIG.missingInInputPolicy.policy) {
				case "remove":
					// Refuse to archive when the input is empty - that would remove every matching page in the database
					if (Object.keys(INPUTFILE).length === 0) {
						console.error(`\nNot running the "remove" policy: the input file is empty, which would archive every matching page in the database. Aborting.`);
						process.exit(1);
					}
					// Archiving is destructive, so confirm in an interactive shell (proceed with a warning when non-interactive, since the policy was configured deliberately)
					let doRemove = true;
					if (process.stdin.isTTY) {
						doRemove = await confirm({ message: `The "remove" policy will archive ${numObjectsMissingInInput} Notion page(s) that are missing from the input file. Continue?`, default: false });
					} else {
						console.log(`Warning: the "remove" policy will archive ${numObjectsMissingInInput} Notion page(s) missing from the input file.`);
					}
					if (doRemove) {
						console.log("Removing objects missing in the input file from the database...");
						for (const page of pagesMissingInInput) {
							await removeNotionPage(page.pageId);
						}
					} else {
						console.log("Skipped removing pages (they are still alerted below).");
					}
				// No break, as we also want to alert those objects
				case "alert":
					const alertedPropertiesOnly = pagesMissingInInput.map(object => object.alertedPropertyValue ?? object.missingPropertyValue);
					writeObjectsMissingInInputToFile(alertedPropertiesOnly);
					break;
				default:
					console.log(`The "${CONFIG.missingInInputPolicy.policy}" policy is not supported.`);
			}
		}
	}

	console.log("\nImporting objects to Notion...");

	let erroredObjects = [];
	let errorMessages = [];

	const progressBar = new cliProgress.SingleBar({
		hideCursor: true,
		format: '|{bar}| {percentage}% | {eta}s left | {value}/{total} objects imported or skipped'
	}, cliProgress.Presets.legacy);

	progressBar.start(Object.keys(INPUTFILE).length, 0);

	for (const [inputKey, inputObject] of Object.entries(INPUTFILE)) {
		if (CONFIG.skipExisting?.enabled && propertiesAlreadyInDB.includes(String(inputObject[CONFIG.skipExisting.jsonKey]))) {
			progressBar.increment();
			numObjectsSkipped++;
			continue;
		}
		try {
			// This is the object that will be written to Notion
			let outputProperties = {
				"properties": {},
				"icon": null,
				"cover": null
			};

			for (const jsonProperty of CONFIG.propertyMappings) {
				switch (jsonProperty.notionPropertyType) {
					case "title":
					case "rich_text":
					case "number":
					case "date":
					case "url":
						outputProperties = formatProperty(inputObject, jsonProperty, outputProperties, jsonProperty.notionPropertyType);
						break;
					case "multi_select":
						outputProperties = handleMultiSelectProperty(inputObject, jsonProperty, outputProperties);
						break;
					case "select":
						outputProperties = handleSelectProperty(inputObject, jsonProperty, outputProperties);
						break;
					case "cover":
					case "icon":
						outputProperties = handlePageIconOrCover(inputObject, jsonProperty, outputProperties, jsonProperty.notionPropertyType);
						break;
					default:
						throw new Error(`Unsupported notionPropertyType "${jsonProperty.notionPropertyType}" for property "${jsonProperty.notionPropertyName}". Valid types: title, rich_text, number, date, url, select, multi_select, cover, icon.`);
				}
			}

			// Add the extraProperties
			for (const extraProperty of CONFIG.extraProperties ?? []) {
				outputProperties.properties[extraProperty.notionPropertyName] = addToNotionObject(extraProperty.propertyValue, extraProperty.notionPropertyType);
			}

			// Create a new page in the database
			await createNotionPage(outputProperties);
		} catch (error) {
			// Push the key of the errored object to the erroredObjects array
			erroredObjects.push(inputKey);
			// Push the error message to the errorMessages array
			errorMessages.push(error);
		}

		progressBar.increment();
	}

	progressBar.stop();

	console.log("\nImport finished.\n");

	if (CONFIG.skipExisting?.enabled) {
		console.log(`Skipped ${numObjectsSkipped} objects that already existed in the database.`);
	}

	if (erroredObjects.length > 0) {
		console.log("The following objects could not be imported due to either an internal or Notion API error:\n");
		console.log(erroredObjects);
		console.log("\nThe following error messages were returned:\n");
		console.log(errorMessages);

		if (CONFIG.writeErroredObjectsToFile) {
			writeErroredObjectsToFile(erroredObjects, errorMessages);
		}
	}

	console.log("\nDid you find this tool useful? Buy me a coffee at https://ko-fi.com/nikkelm");
}

// ---------- Property handlers ----------

// ----- Nested object policy -----

export function applyNestedObjectPolicy(inputObject, configProperty) {
	const policy = configProperty.nestedObjectPolicy;
	if (!policy) {
		throw new Error(`No nested object policy specified for property "${configProperty.notionPropertyName}"`);
	}

	let priorityList = null;
	switch (policy.policy) {
		case "useNamedProperty":
			priorityList = [policy.namedProperty];
			break;
		case "concatenateProperties":
			return Object.values(inputObject[configProperty.jsonKey]).join(",");
		case "usePriorityList":
			priorityList = policy.priorityList;
			break;
		default:
			throw new Error(`Unknown nestedObjectPolicy "${policy.policy}" for property "${configProperty.notionPropertyName}". Valid policies: useNamedProperty, concatenateProperties, usePriorityList.`);
	}

	let output = "";
	for (const property of priorityList ?? []) {
		if (inputObject[configProperty.jsonKey][property] !== undefined) {
			output = inputObject[configProperty.jsonKey][property];
			// If output is of type object, use the first value
			if (typeof output === "object") {
				output = Object.values(output)[0];
			}
			break;
		}
	}
	return output;
}

// ----- Formatting -----

// Format a given value for input to the Notion API. The value itself must already be complete, e.g. a string for "rich_text" or an array of objects for "multi_select"
export function addToNotionObject(value, type) {
	switch (type) {
		case "title":
			return {
				"title": [
					{
						"type": "text",
						"text": {
							"content": value
						}
					}
				]
			};
		case "rich_text":
			return {
				"rich_text": [
					{
						"type": "text",
						"text": {
							"content": value
						}
					}
				]
			};
		case "number":
			return {
				"number": value
			};
		case "multi_select":
			return {
				"multi_select": value
			};
		case "date":
			return {
				"date": {
					"start": value
				}
			};
		case "url":
			return {
				"url": value
			};
		case "select":
			return {
				"select": (value && typeof value === "object") ? value : { "name": value }
			};
	}
}

// ----- By property type -----

export function formatProperty(inputObject, configProperty, outputProperties, propertyType) {
	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] === undefined
		? null
		: inputObject[configProperty.jsonKey];

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Notion rejects a null/empty content for text-like and date properties, so skip them rather than failing the whole page (number and url accept null)
	if ((value === null || value === "") && ["title", "rich_text", "date"].includes(propertyType)) {
		return outputProperties;
	}

	// If the value is of type string, restrict it to a length of 2000 characters
	if (typeof value === "string") {
		value = value.slice(0, 2000);
	}

	// Set the value of the property in the output object
	outputProperties.properties[configProperty.notionPropertyName] = addToNotionObject(value, propertyType);

	return outputProperties;
}

// As multi_select gets interpreted from a string, it needs to be handled separately
export function handleMultiSelectProperty(inputObject, configProperty, outputProperties) {
	let value = inputObject[configProperty.jsonKey] ?? null;

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// A missing, empty, or non-string value yields an empty multi_select rather than crashing on .split
	const names = (value === null || value === undefined || value === "")
		? []
		: String(value).split(",").map((name) => ({ "name": name }));

	// Set the value of the property in the output object
	outputProperties.properties[configProperty.notionPropertyName] = addToNotionObject(names, "multi_select");

	return outputProperties;
}

// A select value is a single string that must be wrapped as a { name } object for the Notion API
export function handleSelectProperty(inputObject, configProperty, outputProperties) {
	let value = inputObject[configProperty.jsonKey] ?? null;

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Notion rejects an empty select, so skip it rather than failing the whole page
	if (value === null || value === undefined || value === "") {
		return outputProperties;
	}

	outputProperties.properties[configProperty.notionPropertyName] = addToNotionObject({ "name": String(value).slice(0, 2000) }, "select");

	return outputProperties;
}

export function handlePageIconOrCover(inputObject, configProperty, outputProperties, propertyType) {
	let value = inputObject[configProperty.jsonKey] ?? null;

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Notion rejects a null/empty external URL, so only set the icon/cover when there is a real URL (leaving it null otherwise, which the create call tolerates)
	if (typeof value === "string" && value.trim() !== "") {
		outputProperties[propertyType] = {
			"type": "external",
			"external": {
				"url": value
			}
		};
	}

	return outputProperties;
}
