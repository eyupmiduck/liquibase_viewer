import { qualifyName } from './identifiers.js';
import { buildChangelogQuery } from './query.js';

/**
 * Reads one page of the changelog table.
 *
 * @param {import('pg').Pool} pool the connection pool
 * @param {object} config the application configuration
 * @param {object} [params] pagination, sorting and filter values
 * @returns {Promise<{rows: object[], total: number, page: number, pageSize: number, pages: number}>} the page
 */
export async function listChangelog(pool, config, params = {}) {
  const { rowsSql, countSql, rowsValues, countValues, page, pageSize } = buildChangelogQuery(
    config,
    params,
  );

  const [rowsResult, countResult] = await Promise.all([
    pool.query(rowsSql, rowsValues),
    pool.query(countSql, countValues),
  ]);

  const total = countResult.rows[0].total;
  return {
    rows: rowsResult.rows,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Reads every row of the lock table.
 *
 * @param {import('pg').Pool} pool the connection pool
 * @param {object} config the application configuration
 * @returns {Promise<object[]>} the lock rows
 */
export async function listLocks(pool, config) {
  const table = qualifyName(config.lock.schema, config.lock.table);
  const { rows } = await pool.query(
    `SELECT id, locked, lockgranted, lockedby FROM ${table} ORDER BY id`,
  );
  return rows;
}

/**
 * Releases any held Liquibase lock, with the same effect as Liquibase's
 * releaseLocks: clear `locked`, `lockgranted` and `lockedby`.
 *
 * @param {import('pg').Pool} pool the connection pool
 * @param {object} config the application configuration
 * @returns {Promise<number>} the number of lock rows that were held and released
 */
export async function unlock(pool, config) {
  const table = qualifyName(config.lock.schema, config.lock.table);
  const result = await pool.query(
    `UPDATE ${table} SET locked = false, lockgranted = NULL, lockedby = NULL WHERE locked`,
  );
  return result.rowCount;
}
