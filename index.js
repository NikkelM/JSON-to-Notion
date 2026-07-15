// Author: NikkelM
// Description: Utility that is able to "import" JSON files to Notion - for cases where a CSV file is simply not available, and the conversion from JSON to CSV would be too complicated.
// Backwards-compatible entry point - the CLI (bin/cli.js) is the primary interface.

import { loadConfig } from './js/utils.js';
import { run } from './js/jsonToNotion.js';

try {
	await run(loadConfig());
} catch (error) {
	console.error("Error: " + (error?.message ?? error));
	process.exit(1);
}
