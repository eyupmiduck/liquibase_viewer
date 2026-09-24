import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG } from '../src/config.js';
import { resolveTarget, TargetError } from '../src/target.js';

test('falls back to the configured changelog and lock tables', () => {
  const target = resolveTarget(DEFAULT_CONFIG, {});

  assert.deepEqual(target.changelog, { schema: 'liquibase', table: 'ddl_utils_databasechangelog' });
  assert.deepEqual(target.lock, {
    schema: 'liquibase',
    table: 'ddl_utils_databasechangeloglock',
  });
});

test('derives the lock table from an overridden changelog table', () => {
  const target = resolveTarget(DEFAULT_CONFIG, { schema: 'public', table: 'databasechangelog' });

  assert.deepEqual(target.changelog, { schema: 'public', table: 'databasechangelog' });
  assert.deepEqual(target.lock, { schema: 'public', table: 'databasechangeloglock' });
});

test('derives the lock table when only the table is overridden', () => {
  const target = resolveTarget(DEFAULT_CONFIG, { table: 'my_changelog' });

  assert.equal(target.changelog.schema, 'liquibase');
  assert.deepEqual(target.lock, { schema: 'liquibase', table: 'my_changeloglock' });
});

test('keeps the configured lock table when the changelog table is unchanged', () => {
  const target = resolveTarget(DEFAULT_CONFIG, { schema: 'public' });

  assert.deepEqual(target.changelog, { schema: 'public', table: 'ddl_utils_databasechangelog' });
  assert.deepEqual(target.lock, {
    schema: 'public',
    table: 'ddl_utils_databasechangeloglock',
  });
});

test('treats blank and repeated parameters as unset', () => {
  const target = resolveTarget(DEFAULT_CONFIG, { schema: '  ', table: ['a', 'b'] });

  assert.deepEqual(target.changelog, { schema: 'liquibase', table: 'ddl_utils_databasechangelog' });
});

test('rejects a schema or table that is not a valid identifier', () => {
  assert.throws(() => resolveTarget(DEFAULT_CONFIG, { table: 'bad name' }), TargetError);
  assert.throws(() => resolveTarget(DEFAULT_CONFIG, { schema: 'a.b' }), TargetError);
  assert.throws(() => resolveTarget(DEFAULT_CONFIG, { lockTable: 'x; drop table y' }), TargetError);
});
