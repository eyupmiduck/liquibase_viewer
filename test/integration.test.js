import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { listChangelog, listLocks, unlock } from '../src/repository.js';
import { resolveTarget } from '../src/target.js';

// These tests need a real database (the local ddl_utils one by default). They
// are skipped unless the password environment variable is set.
const skip = process.env.VIEWER_DB_PASSWORD ? false : 'VIEWER_DB_PASSWORD is not set';

async function withPool(run) {
  const config = loadConfig();
  const pool = createPool(config);
  try {
    await run(config, pool, resolveTarget(config, {}));
  } finally {
    await pool.end();
  }
}

test('lists a page of the changelog', { skip }, async () => {
  await withPool(async (config, pool, target) => {
    const page = await listChangelog(pool, config, target.changelog, { page: 1, pageSize: 5 });

    assert.equal(page.rows.length, 5);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 5);
    assert.ok(page.total >= 5);
    assert.ok(page.pages >= 1);
    assert.ok(page.rows[0].id);
  });
});

test('filters the changelog by author', { skip }, async () => {
  await withPool(async (config, pool, target) => {
    const page = await listChangelog(pool, config, target.changelog, {
      pageSize: 100,
      filters: { author: 'ddl_utils' },
    });

    assert.ok(page.total >= 1);
    assert.ok(page.rows.every((row) => row.author.includes('ddl_utils')));
  });
});

test('reads the lock table and only counts held locks when releasing', { skip }, async () => {
  await withPool(async (config, pool, target) => {
    const rows = await listLocks(pool, target.lock);
    assert.ok(Array.isArray(rows));

    const held = rows.filter((row) => row.locked).length;
    const released = await unlock(pool, target.lock);
    assert.equal(released, held);

    // Releasing again is a no-op.
    assert.equal(await unlock(pool, target.lock), 0);
  });
});
