import pg from 'pg';

const { Pool } = pg;

/**
 * Creates a PostgreSQL connection pool from the configuration.
 *
 * @param {object} config the application configuration (including password)
 * @returns {pg.Pool} the connection pool
 */
export function createPool(config) {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.password,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}
