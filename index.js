// Author: NikkelM
// Description: Utility that is able to "import" JSON files to Notion - for cases where a CSV file is simply not available, and the conversion from JSON to CSV would be too complicated.

// Suppresses the warning about the fetch API being unstable
process.removeAllListeners('warning');

import { CONFIG, INPUTFILE } from './js/utils.js';
import { checkNotionPropertiesExistence } from './js/notion.js';

// ---------- Setup ----------

// We need to do this here because of circular imports
// TODO: Is this still true?
await checkNotionPropertiesExistence();

main();

async function main() {
	console.log("Starting import...");

	// run the following for loop for each object in the input file
	for (const inputObject of INPUTFILE) {
		console.log(`Importing object ${inputObject}...`);

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
			}
		}
		console.log(outputProperties);
	}
}

// ---------- Property handlers ----------

async function handleTextProperty(inputObject, jsonProperty, outputProperties, isTitle) {
	// Get the value of the property from the JSON file. If it does not exist, set it to null
	let value = inputObject[jsonProperty.jsonKey] || null;

	// TODO: Logic if value is an object. Use the nestedObjectPolicy policy

	const propertyType = isTitle
		? "title"
		: "rich_text";

	// Set the value of the property in the output object
	outputProperties.properties[jsonProperty.notionPropertyName] = {
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