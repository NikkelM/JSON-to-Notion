import fs from 'fs';
import jsonschema from 'jsonschema';

// ---------- Exported variables ----------

export const CONFIG = getConfig();

// ---------- Config ----------

// Load the config file and validate it
function getConfig() {
	let configFileName;
	try {
		if (fs.existsSync('config.json')) {
			console.log("Loading configuration file \"config.json\"...");
			configFileName = 'config.json';
		} else if (fs.existsSync('config.default.json')) {
			console.log("!!! No custom configuration file found! Loading default configuration file \"config.default.json\"...");
			configFileName = 'config.default.json';
		}
	} catch (error) {
		console.error("Error loading configuration file: " + error);
		process.exit(1);
	}

	const CONFIG = JSON.parse(fs.readFileSync(configFileName));

	// Validate the config file
	console.log("Validating configuration file...\n");
	try {
		const validator = new jsonschema.Validator();
		validator.validate(CONFIG, JSON.parse(fs.readFileSync('config.schema.json')), { throwError: true });
	} catch (error) {
		console.error("Error validating configuration file: " + error);
		process.exit(1);
	}

	return CONFIG;
}