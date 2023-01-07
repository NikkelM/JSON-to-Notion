import fs from 'fs';
import jsonschema from 'jsonschema';

// ---------- Exported variables ----------

export const CONFIG = getConfig();
export const INPUTFILE = getInputFile();

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

// ---------- Input file validation ----------

// Validate the input file
function getInputFile() {
	if (fs.existsSync(CONFIG.inputFile)) {
		console.log(`Loading input file "${CONFIG.inputFile}"...`);
	} else {
		console.error(`Input file does not exist: ${CONFIG.inputFile}`);
		process.exit(1);
	}
	const INPUTFILE = JSON.parse(fs.readFileSync(CONFIG.inputFile));

	// Validate the input file
	console.log("Validating input file...\n");
	if (!Object.keys(INPUTFILE).every(key => typeof INPUTFILE[key] === 'object')) {
		console.error("Not every property in the input file is an object!");
		process.exit(1);
	}

	return INPUTFILE;
}

// ---------- Error handling ----------

// Write errored objects to file
export function writeErroredObjectsToFile(erroredObjects, errorMessages) {
	console.log("\nWriting errored objects to file...");

	// Get all objects from INPUTFILE that have their key in erroredObjects
	const erroredObjectsFromFile = Object.keys(INPUTFILE).filter(key => erroredObjects.includes(key)).reduce((obj, key) => {
		obj[key] = INPUTFILE[key];
		// Add the error message to the object
		obj[key].errorMessage = errorMessages[erroredObjects.indexOf(key)].toString();
		return obj;
	}, {});

	const outputFilename = `${CONFIG.inputFile.split(".json")[0]}_erroredObjects.json`;

	// Write errored objects to file
	fs.writeFileSync(`${outputFilename}`, JSON.stringify(erroredObjectsFromFile, null, 2));

	console.log(`Wrote errored objects to file "${outputFilename}".`);
}