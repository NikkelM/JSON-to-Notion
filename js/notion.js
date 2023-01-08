import { Client, LogLevel } from '@notionhq/client';
import { CONFIG } from './utils.js';

// ---------- Notion API ----------

const NOTION = new Client({
	auth: CONFIG.notionIntegrationKey,
	logLevel: LogLevel.ERROR
});
const databaseId = CONFIG.notionDatabaseId;

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

	// Add the field that is used to check for duplicates
	if (CONFIG.skipExisting?.enabled) {
		properties.push({
			"notionPropertyName": CONFIG.skipExisting.notionProperty,
			"notionPropertyType": CONFIG.skipExisting.propertyType
		});
	}

	// Add all properties defined in extraProperties
	if (CONFIG.extraProperties) {
		for (const property of CONFIG.extraProperties) {
			properties.push({
				"notionPropertyName": property.notionPropertyName,
				"notionPropertyType": property.notionPropertyType
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

// ---------- Duplicate check/Database query ----------

// Get a list of pages in the Notion database that have the `CONFIG.skipExisting.notionProperty` field set 
export async function getPagesToSkipFromNotionDatabase() {
	const pages = [];

	async function getPages(cursor) {
		// While there are more pages left in the query, get pages from the database. 
		const currentPages = await queryDatabase(cursor);

		currentPages.results.forEach(page => {
			switch (CONFIG.skipExisting.propertyType) {
				case "title":
				case "rich_text":
					pages.push(page.properties[CONFIG.skipExisting.notionProperty][CONFIG.skipExisting.propertyType][0].plain_text);
					break;
				case "number":
					pages.push(page.properties[CONFIG.skipExisting.notionProperty].number);
					break;
				case "select":
					pages.push(page.properties[CONFIG.skipExisting.notionProperty].select.name);
					break;
				case "url":
					pages.push(page.properties[CONFIG.skipExisting.notionProperty].url);
			}
		});

		if (currentPages.has_more) {
			await getPages(currentPages.next_cursor)
		}
	}

	await getPages();
	return pages;
};

// Fetch all pages from the database that have the specified property set to anything but null
async function queryDatabase(cursor) {
	return await NOTION.databases.query({
		database_id: databaseId,
		page_size: 100,
		start_cursor: cursor,
		filter: {
			property: CONFIG.skipExisting.notionProperty,
			[CONFIG.skipExisting.propertyType]: {
				"is_not_empty": true
			}
		}
	});
}