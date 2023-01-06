// Author: NikkelM
// Description: Utility that is able to "import" JSON files to Notion - for cases where a CSV file is simply not available, and the conversion from JSON to CSV would be too complicated.

// Suppresses the warning about the fetch API being unstable
process.removeAllListeners('warning');

import { CONFIG } from './js/utils.js';
import { getGamesFromNotionDatabase, updateNotionPage, checkNotionPropertiesExistence } from './js/notion.js';

// ---------- Setup ----------

// We need to do this here because of circular imports
// TODO: Is this still true?
await checkNotionPropertiesExistence()