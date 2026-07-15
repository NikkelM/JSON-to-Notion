import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jsonschema from 'jsonschema';

// The package root, so the shipped config schema is found no matter the working directory
const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------- Exported variables ----------

// Live bindings, set by initConfig once a config has been loaded and validated
export let CONFIG;
export let INPUTFILE;

// ---------- Config ----------

// Load a config from the given path, or discover ./config.json (falling back to ./config.default.json)
// in the current directory, then validate it against the shipped schema
export function loadConfig(configPath) {
	let configFileName = configPath;
	if (!configFileName) {
		if (fs.existsSync('config.json')) {
			console.log("Loading configuration file \"config.json\"...");
			configFileName = 'config.json';
		} else if (fs.existsSync('config.default.json')) {
			console.log("!!! No custom configuration file found! Loading default configuration file \"config.default.json\"...");
			configFileName = 'config.default.json';
		} else {
			console.error("Error loading configuration file: no \"config.json\" found in the current directory. Run \"json-to-notion init\" to create one, or pass --config <path>.");
			process.exit(1);
		}
	} else if (!fs.existsSync(configFileName)) {
		console.error(`Error loading configuration file: no configuration file found at "${configFileName}".`);
		process.exit(1);
	} else {
		console.log(`Loading configuration file "${configFileName}"...`);
	}

	let config;
	try {
		config = JSON.parse(fs.readFileSync(configFileName, 'utf8').replace(/^\uFEFF/, ''));
	} catch (error) {
		console.error(`Error parsing configuration file "${configFileName}" as JSON: ${error.message ?? error}`);
		process.exit(1);
	}

	validateConfig(config);
	return config;
}

// Validate a config against the shipped schema, returning the raw jsonschema result
export function validateConfigResult(config) {
	const validator = new jsonschema.Validator();
	return validator.validate(config, JSON.parse(fs.readFileSync(path.join(packageDir, 'config.schema.json'), 'utf8').replace(/^\uFEFF/, '')));
}

// Validate a config against the shipped schema, exiting the process on failure
export function validateConfig(config) {
	console.log("Validating configuration file...\n");
	const result = validateConfigResult(config);
	if (result.errors.length > 0) {
		console.error("Error validating configuration file: " + result.errors.map((error) => error.stack).join('; '));
		process.exit(1);
	}
}

// Activate a validated config and load its input file into the live bindings
export function initConfig(config) {
	CONFIG = config;
	INPUTFILE = loadInputFile();
}

// ---------- Input file validation ----------

// Load and validate the input file referenced by the active config
function loadInputFile() {
	if (fs.existsSync(CONFIG.inputFile)) {
		console.log(`Loading input file "${CONFIG.inputFile}"...`);
	} else {
		console.error(`Input file does not exist: ${CONFIG.inputFile}`);
		process.exit(1);
	}
	let inputFile;
	try {
		inputFile = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf8').replace(/^\uFEFF/, ''));
	} catch (error) {
		console.error(`Error parsing input file "${CONFIG.inputFile}" as JSON: ${error.message ?? error}`);
		process.exit(1);
	}

	// Validate the input file
	console.log("Validating input file...\n");
	if (!Object.keys(inputFile).every(key => typeof inputFile[key] === 'object')) {
		console.error("Not every property in the input file is an object!");
		process.exit(1);
	}

	return inputFile;
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

export function writeObjectsMissingInInputToFile(objectsMissingInInput) {
	console.log("Writing objects missing in input to file...");

	const outputFilename = `${CONFIG.inputFile.split(".json")[0]}_objectsMissingInInput.json`;

	// Write missing objects to file
	fs.writeFileSync(`${outputFilename}`, JSON.stringify(objectsMissingInInput, null, 2));

	console.log(`Wrote objects missing in input to file "${outputFilename}".`);
}