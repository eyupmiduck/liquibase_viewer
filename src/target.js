import { isValidIdentifier } from './identifiers.js';

/**
 * Raised when the requested schema or table is not a usable identifier, so the
 * server can answer with 400 rather than a generic 500.
 */
export class TargetError extends Error {}

// Express may hand a repeated query parameter through as an array; only a
// single non-blank string is accepted.
function queryString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function requireIdentifier(value, field) {
  if (!isValidIdentifier(value)) {
    throw new TargetError(`${field} must be a valid SQL identifier, was ${JSON.stringify(value)}`);
  }
}

/**
 * Resolves the changelog and lock tables from the request query, falling back
 * to the configured defaults.
 *
 * Liquibase names the lock table after the changelog table
 * (`DATABASECHANGELOGLOCK`), so the lock table is derived from the effective
 * changelog table. The configured lock table is kept when the changelog table
 * is not overridden, so a non-standard configuration still works. Schema and
 * table names are validated as identifiers; they cannot be bound as parameters.
 *
 * @param {object} config the application configuration
 * @param {object} [query] the request query string
 * @returns {{changelog: {schema: string, table: string}, lock: {schema: string, table: string}}} the resolved targets
 * @throws {TargetError} when a name is not a valid identifier
 */
export function resolveTarget(config, query = {}) {
  const schemaParam = queryString(query.schema);
  const schema = schemaParam ?? config.changelog.schema;
  const table = queryString(query.table) ?? config.changelog.table;

  const lockSchema = schemaParam ?? config.lock.schema;
  const lockTable =
    queryString(query.lockTable) ??
    (table === config.changelog.table ? config.lock.table : `${table}lock`);

  requireIdentifier(schema, 'schema');
  requireIdentifier(table, 'table');
  requireIdentifier(lockSchema, 'schema');
  requireIdentifier(lockTable, 'lockTable');

  return {
    changelog: { schema, table },
    lock: { schema: lockSchema, table: lockTable },
  };
}
