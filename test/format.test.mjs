// Description: Offline tests for the JSON-to-Notion property formatting helpers

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	addToNotionObject,
	formatProperty,
	handleMultiSelectProperty,
	handleSelectProperty,
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
	it('wraps a bare select string as a { name } object', () => {
		assert.deepEqual(addToNotionObject('Action', 'select'), { select: { name: 'Action' } });
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

	it('skips a text/date property when the JSON key is missing (avoids a null-content Notion rejection)', () => {
		assert.ok(!('Name' in formatProperty({}, mapping, fresh(), 'rich_text').properties));
		assert.ok(!('Name' in formatProperty({}, mapping, fresh(), 'title').properties));
		assert.ok(!('Name' in formatProperty({}, mapping, fresh(), 'date').properties));
	});

	it('still emits null for a missing number/url (Notion accepts those)', () => {
		assert.equal(formatProperty({}, mapping, fresh(), 'number').properties.Name.number, null);
		assert.equal(formatProperty({}, mapping, fresh(), 'url').properties.Name.url, null);
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

	it('yields an empty multi_select for a missing/null value instead of crashing on .split', () => {
		assert.deepEqual(handleMultiSelectProperty({}, { jsonKey: 'tags', notionPropertyName: 'Tags' }, { properties: {} }).properties.Tags.multi_select, []);
		assert.deepEqual(handleMultiSelectProperty({ tags: '' }, { jsonKey: 'tags', notionPropertyName: 'Tags' }, { properties: {} }).properties.Tags.multi_select, []);
	});
});

describe('handleSelectProperty', () => {
	it('wraps a string value as a Notion select { name }', () => {
		const out = handleSelectProperty({ status: 'Done' }, { jsonKey: 'status', notionPropertyName: 'Status' }, { properties: {} });
		assert.deepEqual(out.properties.Status, { select: { name: 'Done' } });
	});

	it('skips the property when the value is missing or empty (no empty select)', () => {
		assert.ok(!('Status' in handleSelectProperty({}, { jsonKey: 'status', notionPropertyName: 'Status' }, { properties: {} }).properties));
		assert.ok(!('Status' in handleSelectProperty({ status: '' }, { jsonKey: 'status', notionPropertyName: 'Status' }, { properties: {} }).properties));
	});
});

describe('handlePageIconOrCover', () => {
	it('sets an external icon URL at the top level', () => {
		const out = handlePageIconOrCover({ img: 'https://x.dev/i.png' }, { jsonKey: 'img' }, { properties: {}, icon: null, cover: null }, 'icon');
		assert.deepEqual(out.icon, { type: 'external', external: { url: 'https://x.dev/i.png' } });
	});

	it('leaves icon/cover null (never url:null/"") when the value is missing or empty', () => {
		assert.equal(handlePageIconOrCover({}, { jsonKey: 'img' }, { properties: {}, icon: null, cover: null }, 'icon').icon, null);
		assert.equal(handlePageIconOrCover({ img: '' }, { jsonKey: 'img' }, { properties: {}, icon: null, cover: null }, 'cover').cover, null);
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
	it('throws (rather than process.exit) on a missing or unknown policy', () => {
		assert.throws(() => applyNestedObjectPolicy({ data: {} }, { jsonKey: 'data', notionPropertyName: 'D', nestedObjectPolicy: {} }), /No nested object policy|Unknown nestedObjectPolicy/);
		assert.throws(() => applyNestedObjectPolicy({ data: {} }, { jsonKey: 'data', notionPropertyName: 'D', nestedObjectPolicy: { policy: 'bogus' } }), /Unknown nestedObjectPolicy/);
	});
});
