// Author: NikkelM
// Description: Utility that is able to "import" JSON files to Notion - for cases where a CSV file is simply not available, and the conversion from JSON to CSV would be too complicated.

// Suppresses the warning about the fetch API being unstable
process.removeAllListeners('warning');

import cliProgress from 'cli-progress';

import { CONFIG, INPUTFILE, writeErroredObjectsToFile, writeObjectsMissingInInputToFile } from './js/utils.js';
import { checkNotionPropertiesExistence, createNotionPage, removeNotionPage, getExistingPagesFromNotionDatabase } from './js/notion.js';

// ---------- Setup ----------
await checkNotionPropertiesExistence();

main();

async function main() {
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

	// For the skipExisting policy, only get the skippedPropertyValue of the objectsAlreadyInDB
	if (CONFIG.skipExisting?.enabled) {
		var propertiesAlreadyInDB = objectsAlreadyInDB.map(object => object.skippedPropertyValue);
	}

	// For the missingInInputPolicy, get all objects that are in the database but not in the input file
	if (CONFIG.missingInInputPolicy && CONFIG.missingInInputPolicy.policy !== "noAction") {
		const inputObjects = Object.values(INPUTFILE).map(object => object[CONFIG.missingInInputPolicy.jsonKey]);
		for (const object of objectsAlreadyInDB) {
			if (!inputObjects.includes(object.missingPropertyValue)) {
				numObjectsMissingInInput++;
				pagesMissingInInput.push(object);
			}
		}

		console.log(`\nFound ${numObjectsMissingInInput} objects in the database that are not in the input file.`);

		if (numObjectsMissingInInput > 0) {
			switch (CONFIG.missingInInputPolicy.policy) {
				case "remove":
					console.log("Removing objects missing in the inpout file from the database...");
					for (const page of pagesMissingInInput) {
						await removeNotionPage(page.pageId);
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
		if (CONFIG.skipExisting?.enabled && propertiesAlreadyInDB.includes(inputObject[CONFIG.skipExisting.jsonKey])) {
			progressBar.increment();
			numObjectsSkipped++;
			continue;
		}
		try {
			// This is the object that will be written to Notion
			// It contains a "property" property, as well as "icon" and "cover"
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
					case "cover":
					case "icon":
						outputProperties = handlePageIconOrCover(inputObject, jsonProperty, outputProperties, jsonProperty.notionPropertyType);
						break;
				}
			}

			// Add the extraProperties
			for (const extraProperty of CONFIG.extraProperties) {
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

function applyNestedObjectPolicy(inputObject, configProperty) {
	if (!configProperty.nestedObjectPolicy) {
		throw new Error(`No nested object policy specified for property "${configProperty.notionPropertyName}"`);
	}

	let output = "";
	let priorityList = null;
	try {
		switch (configProperty.nestedObjectPolicy.policy) {
			case "useNamedProperty":
				priorityList = [[configProperty.nestedObjectPolicy.namedProperty]];
				break;
			case "concatenateProperties":
				for (const property of Object.values(inputObject[configProperty.jsonKey])) {
					output += `${property},`;
				}
				output = output.slice(0, -1);
				return output;
			case "usePriorityList":
				priorityList = configProperty.nestedObjectPolicy.priorityList;
		}

		for (const property of priorityList) {
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

	} catch (error) {
		console.log("Error while applying nested object policy:");
		console.log(error);
		console.log("Input object:");
		console.log(inputObject);
		console.log("Config property:");
		console.log(configProperty);
		process.exit(1);
	}
}

// ----- Formatting -----

// Format a given value for input to the Notion API. The value itself must already be complete, e.g. a string for "rich_text" or an array of objects for "multi_select"
function addToNotionObject(value, type) {
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
				"select": value
			};
	}
}

// ----- By property type -----

function formatProperty(inputObject, configProperty, outputProperties, propertyType) {
	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] === undefined
		? null
		: inputObject[configProperty.jsonKey];

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
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
function handleMultiSelectProperty(inputObject, configProperty, outputProperties) {
	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] || null;

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Split the value string into an array of objects using , as delimiter
	value = value.split(",").map((value) => {
		return {
			"name": value
		}
	});

	// Set the value of the property in the output object
	outputProperties.properties[configProperty.notionPropertyName] = addToNotionObject(value, "multi_select");

	return outputProperties;
}

function handlePageIconOrCover(inputObject, configProperty, outputProperties, propertyType) {
	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] || null;

	if (value && typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Set the value of the property in the output object
	outputProperties[propertyType] = {
		"type": "external",
		"external": {
			"url": value
		}
	};

	return outputProperties;
}