// Author: NikkelM
// Description: Utility that is able to "import" JSON files to Notion - for cases where a CSV file is simply not available, and the conversion from JSON to CSV would be too complicated.

// Suppresses the warning about the fetch API being unstable
process.removeAllListeners('warning');

import { CONFIG, INPUTFILE } from './js/utils.js';
import { checkNotionPropertiesExistence, createNotionPage } from './js/notion.js';

// ---------- Setup ----------

// We need to do this here because of circular imports
// TODO: Is this still true?
await checkNotionPropertiesExistence();

main();

async function main() {
	console.log("Starting import...");

	// run the following for loop for each object in the input file
	for (const inputObject of INPUTFILE) {
		let outputProperties = {
			"properties": {},
			"icon": null,
			"cover": null
		};

		for (const jsonProperty of CONFIG.propertyMappings) {
			// This is the object that will be written to Notion
			// It contains a "property" property, as well as "icon" and "cover"

			switch (jsonProperty.notionPropertyType) {
				case "title":
					outputProperties = await handleTextProperty(inputObject, jsonProperty, outputProperties, true);
					break;
				case "rich_text":
					outputProperties = await handleTextProperty(inputObject, jsonProperty, outputProperties, false);
					break;
				case "multi_select":
					outputProperties = await handleMultiSelectProperty(inputObject, jsonProperty, outputProperties);
					break;
			}
		}
		// console.log(outputProperties);

		// Create a new page in the database
		createNotionPage(outputProperties);
	}
}

// ---------- Property handlers ----------

// ----- Nested object policy -----

function applyNestedObjectPolicy(inputObject, configProperty) {
	console.log("Applying nested object policy...");
	let output = "";
	let priorityList = null;
	try {
		switch (configProperty.nestedObjectPolicy.policy) {
			case "useNamedProperty":
				priorityList = [configProperty.nestedObjectPolicy.namedProperty];
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
			if (inputObject[configProperty.jsonKey]) {
				output = property;
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

// ----- By property type -----

function handleTextProperty(inputObject, configProperty, outputProperties, isTitle) {
	console.log("Handling rich_text property...");

	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] || null;

	if (typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	const propertyType = isTitle
		? "title"
		: "rich_text";

	// Set the value of the property in the output object
	outputProperties.properties[configProperty.notionPropertyName] = {
		[propertyType]: [
			{
				"type": "text",
				"text": {
					"content": value
				}
			}
		]
	};

	return outputProperties;
}

function handleMultiSelectProperty(inputObject, configProperty, outputProperties) {
	console.log("Handling multi_select property...");

	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[configProperty.jsonKey] || null;

	if (typeof value === "object") {
		value = applyNestedObjectPolicy(inputObject, configProperty);
	}

	// Split the value string into an array of objects using , as delimiter
	value = value.split(",").map((value) => {
		return {
			"name": value
		}
	});

	// Set the value of the property in the output object
	outputProperties.properties[configProperty.notionPropertyName] = {
		"multi_select": value
	};

	return outputProperties;
}