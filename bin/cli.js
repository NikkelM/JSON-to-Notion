#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';

import { loadConfig } from '../js/utils.js';
import { run } from '../js/jsonToNotion.js';
import { runWizard } from '../js/wizard.js';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

const program = new Command();

program
	.name('json-to-notion')
	.description('Import a JSON file into a Notion database, driven by a config.json.')
	.version(pkg.version);

program
	.command('run', { isDefault: true })
	.description('Import a JSON file into Notion using a configuration file')
	.option('-c, --config <path>', 'path to a config.json (defaults to ./config.json)')
	.option('-i, --input <path>', 'path to the JSON input file (overrides "inputFile" from the config)')
	.addHelpText('after', '\nThe configuration comes from a config.json in the current directory (or --config <path>).\nRun "json-to-notion init" to create one interactively, or see the README and config.schema.json for every option.')
	.action(async (options) => {
		// Start the interactive wizard when invoked with no options and no config to load, but only in an interactive shell so scripts still get the friendly no-config error
		if (!options.config && !options.input && !fs.existsSync('config.json') && process.stdin.isTTY) {
			await runWizard('config.json');
			return;
		}
		const config = loadConfig(options.config);
		if (options.input) {
			config.inputFile = options.input;
		}
		await run(config);
	});

program
	.command('init')
	.description('Interactively create a configuration file')
	.option('-o, --output <path>', 'where to write the configuration file', 'config.json')
	.action(async (options) => {
		await runWizard(options.output);
	});

program.showHelpAfterError('(run with --help to see available commands)');

try {
	await program.parseAsync(process.argv);
} catch (error) {
	console.error('Error: ' + (error?.message ?? error));
	process.exit(1);
}
