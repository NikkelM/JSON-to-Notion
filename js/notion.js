import { Client } from '@notionhq/client';
import { CONFIG } from './utils.js';

// ---------- Notion API ----------

const NOTION = new Client({ auth: CONFIG.notionIntegrationKey });
const databaseId = CONFIG.notionDatabaseId;

export function updateNotionPage(pageId, properties) {
	// Update a page in the database with new info
	NOTION.pages.update({
		page_id: pageId,
		properties: properties.properties,
		cover: properties.cover,
		icon: properties.icon
	});
}

// Sends a simple request to the database to check if all properties exist in the database
export async function checkNotionPropertiesExistence() {
	// Get a list of all enabled properties
	let properties = Object.values(CONFIG.gameProperties).map(property => {
		// Skip properties that are disabled or do not have a notionProperty value (e.g. coverImage)
		if (!property.enabled || !property.notionProperty) { return; }
		return property.notionProperty
	}).filter(property => property !== undefined);

	// Add the Steam App ID property to the list of properties to check
	properties.push(CONFIG.steamAppIdProperty);

	const response = await NOTION.databases.retrieve({
		database_id: databaseId
	});

	// If any of the properties are not found in the database, exit the program
	for (const property of properties) {
		if (!response.properties[property]) {
			console.error(`Error validating configuration file: Notion database does not contain the property "${property}" specified in the configuration file.`);
			process.exit(1);
		}
	}
}