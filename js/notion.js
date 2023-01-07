import { Client, LogLevel } from '@notionhq/client';
import { CONFIG } from './utils.js';

// ---------- Notion API ----------

const NOTION = new Client({
	auth: CONFIG.notionIntegrationKey,
	logLevel: LogLevel.ERROR
});
const databaseId = CONFIG.notionDatabaseId;


// Deprecated/unused?
export function updateNotionPage(pageId, properties) {
	// Update a page in the database with new info
	NOTION.pages.update({
		page_id: pageId,
		properties: properties.properties,
		cover: properties.cover,
		icon: properties.icon
	});
}

export async function createNotionPage(properties) {
	// Create a new page in the database
	await NOTION.pages.create({
		parent: {
			database_id: databaseId
		},
		properties: properties.properties,
		cover: properties.cover,
		icon: properties.icon
	});
}

// Sends a simple request to the database to check if all properties exist in the database
export async function checkNotionPropertiesExistence() {
	// We don't need to validate these properties, as they always exist
	const alwaysValidProperties = [
		"cover",
		"icon"
	];

	// Get a list of all fields that must exist in the Notion database
	let properties = [];
	for (const propertyMapping of CONFIG.propertyMappings) {
		if (!alwaysValidProperties.includes(propertyMapping.notionPropertyType)) {
			properties.push({
				"notionPropertyName": propertyMapping.notionPropertyName,
				"notionPropertyType": propertyMapping.notionPropertyType
			});
		}
	}

	const response = await NOTION.databases.retrieve({
		database_id: databaseId
	});

	// If any of the properties are not found in the database, exit the program
	for (const property of properties) {
		if (!response.properties[property.notionPropertyName] || !(response.properties[property.notionPropertyName].type === property.notionPropertyType)) {
			console.error(`Error validating configuration file: Notion database does not contain the property "${property.notionPropertyName}" specified in the configuration file, or the property is not of type "${property.notionPropertyType}".`);
			process.exit(1);
		}
	}
}