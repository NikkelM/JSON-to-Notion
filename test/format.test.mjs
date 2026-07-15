// Description: Offline tests for the JSON-to-Notion property formatting helpers

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	addToNotionObject,
	formatProperty,
	handleMultiSelectProperty,
	handlePageIconOrCover,
	applyNestedObjectPolicy
} from '../js/jsonToNotion.js';

describe('addToNotionObject', () => {
	it('wraps a title value', () => {
		assert.deepEqual(addToNotionObject('Hi', 'title'), { title: [{ type: 'text', text: { content: 'Hi' } }] });
	});
	it('wraps a rich_text value', () => {
		assert.deepEqual(addToNotionObject('Hi', 'rich_text'), { rich_text: [{ type: 'text', text: { content: 'Hi' } }] });
	});
	it('passes numbers, urls, selects and multi_selects through', () => {
		assert.deepEqual(addToNotionObject(42, 'number'), { number: 42 });
		assert.deepEqual(addToNotionObject('https://x.dev', 'url'), { url: 'https://x.dev' });
		assert.deepEqual(addToNotionObject({ name: 'A' }, 'select'), { select: { name: 'A' } });
		assert.deepEqual(addToNotionObject([{ name: 'A' }], 'multi_select'), { multi_select: [{ name: 'A' }] });
	});
	it('wraps a date value as a start date', () => {
		assert.deepEqual(addToNotionObject('2026-01-01', 'date'), { date: { start: '2026-01-01' } });
	});
});

describe('formatProperty', () => {
	const mapping = { jsonKey: 'name', notionPropertyName: 'Name', notionPropertyType: 'rich_text' };
	const fresh = () => ({ properties: {}, icon: null, cover: null });

	it('sets the value under the Notion property name', () => {
		const out = formatProperty({ name: 'Zag' }, mapping, fresh(), 'rich_text');
		assert.equal(out.properties.Name.rich_text[0].text.content, 'Zag');
	});

	it('uses null when the JSON key is missing', () => {
		const out = formatProperty({}, mapping, fresh(), 'rich_text');
		assert.equal(out.properties.Name.rich_text[0].text.content, null);
	});

	it('truncates strings to 2000 characters', () => {
		const out = formatProperty({ name: 'x'.repeat(3000) }, mapping, fresh(), 'rich_text');
		assert.equal(out.properties.Name.rich_text[0].text.content.length, 2000);
	});

	it('applies the nested object policy when the value is an object', () => {
		const nestedMapping = { ...mapping, nestedObjectPolicy: { policy: 'usePriorityList', priorityList: ['b', 'a'] } };
		const out = formatProperty({ name: { a: 'first', b: 'second' } }, nestedMapping, fresh(), 'rich_text');
		assert.equal(out.properties.Name.rich_text[0].text.content, 'second');
	});
});

describe('handleMultiSelectProperty', () => {
	it('splits a comma-separated string into name objects', () => {
		const out = handleMultiSelectProperty({ tags: 'a,b,c' }, { jsonKey: 'tags', notionPropertyName: 'Tags' }, { properties: {} });
		assert.deepEqual(out.properties.Tags.multi_select, [{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
	});
});

describe('handlePageIconOrCover', () => {
	it('sets an external icon URL at the top level', () => {
		const out = handlePageIconOrCover({ img: 'https://x.dev/i.png' }, { jsonKey: 'img' }, { properties: {}, icon: null, cover: null }, 'icon');
		assert.deepEqual(out.icon, { type: 'external', external: { url: 'https://x.dev/i.png' } });
	});
});

describe('applyNestedObjectPolicy', () => {
	it('concatenates all nested values with a comma', () => {
		const result = applyNestedObjectPolicy({ data: { a: '1', b: '2', c: '3' } }, { jsonKey: 'data', nestedObjectPolicy: { policy: 'concatenateProperties' } });
		assert.equal(result, '1,2,3');
	});
	it('uses the first present property from the priority list', () => {
		const result = applyNestedObjectPolicy({ data: { b: 'second' } }, { jsonKey: 'data', nestedObjectPolicy: { policy: 'usePriorityList', priorityList: ['a', 'b'] } });
		assert.equal(result, 'second');
	});
	it('uses the named property', () => {
		const result = applyNestedObjectPolicy({ data: { chosen: 'yes', other: 'no' } }, { jsonKey: 'data', nestedObjectPolicy: { policy: 'useNamedProperty', namedProperty: 'chosen' } });
		assert.equal(result, 'yes');
	});
});
