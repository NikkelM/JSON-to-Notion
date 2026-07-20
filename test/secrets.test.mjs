// Description: Offline tests for runtime secret resolution (env var, config fallback, non-interactive error)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSecret } from '../js/utils.js';

describe('resolveSecret', () => {
	it('prefers the environment variable and trims it', async () => {
		process.env.JTN_TEST_SECRET = '  env-value  ';
		try {
			const value = await resolveSecret({ envVar: 'JTN_TEST_SECRET', promptMessage: 'x', label: 'test secret' });
			assert.equal(value, 'env-value');
		} finally {
			delete process.env.JTN_TEST_SECRET;
		}
	});

	it('rejects a secret stored in the config file', async () => {
		delete process.env.JTN_TEST_SECRET;
		await assert.rejects(
			resolveSecret({ envVar: 'JTN_TEST_SECRET', configValue: '  config-value  ', configField: 'notionIntegrationKey', promptMessage: 'x', label: 'test secret' }),
			/must not be stored in the configuration file/
		);
	});

	it('throws when no secret is available in a non-interactive shell', async () => {
		delete process.env.JTN_TEST_SECRET;
		const originalIsTTY = process.stdin.isTTY;
		process.stdin.isTTY = false;
		try {
			await assert.rejects(
				resolveSecret({ envVar: 'JTN_TEST_SECRET', configValue: '', promptMessage: 'x', label: 'test secret' }),
				/test secret is required/
			);
		} finally {
			process.stdin.isTTY = originalIsTTY;
		}
	});
});
