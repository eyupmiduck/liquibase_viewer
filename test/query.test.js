import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG } from '../src/config.js';
import { buildChangelogQuery } from '../src/query.js';

test('builds a default query with no filters', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG);

  assert.match(query.rowsSql, /FROM "public"\."databasechangelog"/);
  assert.doesNotMatch(query.rowsSql, /WHERE/);
  assert.match(query.rowsSql, /ORDER BY orderexecuted ASC/);
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 25);
  assert.deepEqual(query.countValues, []);
  assert.deepEqual(query.rowsValues, [25, 0]);
  assert.doesNotMatch(query.countSql, /LIMIT/);
});

test('parameterizes filter values instead of interpolating them', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, {
    filters: { id: "x'; drop table users; --", author: 'alice' },
  });

  assert.match(query.rowsSql, /id ILIKE \$1/);
  assert.match(query.rowsSql, /author ILIKE \$2/);
  assert.doesNotMatch(query.rowsSql, /drop table/);
  assert.deepEqual(query.countValues, ["%x'; drop table users; --%", '%alice%']);
  assert.deepEqual(query.rowsValues, ["%x'; drop table users; --%", '%alice%', 25, 0]);
});

test('ignores blank filters and adds a date range', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, {
    filters: { id: '  ', from: '2024-01-01', to: '2024-12-31' },
  });

  assert.doesNotMatch(query.rowsSql, /id ILIKE/);
  assert.match(query.rowsSql, /dateexecuted >= \$1::timestamp/);
  // `to` is inclusive of the whole day.
  assert.match(query.rowsSql, /dateexecuted < \(\$2::date \+ 1\)/);
  assert.deepEqual(query.countValues, ['2024-01-01', '2024-12-31']);
});

test('ignores filter values that are not a single string', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, {
    filters: { author: ['a', 'b'], from: ['2024-01-01', '2024-02-01'] },
  });

  assert.doesNotMatch(query.rowsSql, /author ILIKE/);
  assert.doesNotMatch(query.rowsSql, /WHERE/);
  assert.deepEqual(query.countValues, []);
});

test('falls back to a safe sort column', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, { sort: 'md5sum; drop table x', dir: 'desc' });

  assert.match(query.rowsSql, /ORDER BY orderexecuted DESC/);
  assert.equal(query.sort, 'orderexecuted');
});

test('clamps the page size to the configured maximum', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, { pageSize: '100000' });

  assert.equal(query.pageSize, DEFAULT_CONFIG.server.maxPageSize);
  assert.deepEqual(query.rowsValues, [DEFAULT_CONFIG.server.maxPageSize, 0]);
});

test('computes the offset from the page number', () => {
  const query = buildChangelogQuery(DEFAULT_CONFIG, { page: '3', pageSize: '10' });

  assert.equal(query.page, 3);
  assert.deepEqual(query.rowsValues, [10, 20]);
});
