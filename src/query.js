import { qualifyName } from './identifiers.js';

/** Columns returned to the UI, in display order. */
export const CHANGELOG_COLUMNS = [
  'id',
  'author',
  'filename',
  'dateexecuted',
  'orderexecuted',
  'exectype',
  'description',
  'comments',
  'tag',
  'contexts',
  'labels',
  'deployment_id',
  'md5sum',
  'liquibase',
];

/** Filter query-string name to changelog column. */
const FILTER_COLUMNS = {
  id: 'id',
  author: 'author',
  filename: 'filename',
  exectype: 'exectype',
  tag: 'tag',
  description: 'description',
  contexts: 'contexts',
  labels: 'labels',
  deployment_id: 'deployment_id',
};

/** Columns a caller may sort by. */
const SORTABLE_COLUMNS = new Set([
  'orderexecuted',
  'id',
  'author',
  'filename',
  'dateexecuted',
  'exectype',
  'tag',
]);

const DEFAULT_SORT = 'orderexecuted';

function clampPageSize(config, requested) {
  const max = config.server.maxPageSize;
  const parsed = Number.parseInt(requested, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return config.server.pageSize;
  }
  return Math.min(parsed, max);
}

/**
 * Builds the paginated, filtered changelog query. Values are always passed as
 * bind parameters; only validated identifiers and allow-listed sort columns are
 * interpolated.
 *
 * @param {object} config the application configuration
 * @param {object} [params] pagination, sorting and filter values
 * @returns {{rowsSql: string, countSql: string, rowsValues: unknown[], countValues: unknown[], page: number, pageSize: number, sort: string, dir: string}} the queries and resolved parameters
 */
export function buildChangelogQuery(config, params = {}) {
  const table = qualifyName(config.changelog.schema, config.changelog.table);
  const filters = params.filters ?? {};

  const where = [];
  const countValues = [];
  const placeholder = (value) => {
    countValues.push(value);
    return `$${countValues.length}`;
  };

  for (const [name, column] of Object.entries(FILTER_COLUMNS)) {
    const value = filters[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      where.push(`${column} ILIKE ${placeholder(`%${String(value).trim()}%`)}`);
    }
  }
  if (filters.from) {
    where.push(`dateexecuted >= ${placeholder(filters.from)}::timestamp`);
  }
  if (filters.to) {
    where.push(`dateexecuted <= ${placeholder(filters.to)}::timestamp`);
  }
  const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

  const page = Math.max(1, Number.parseInt(params.page, 10) || 1);
  const pageSize = clampPageSize(config, params.pageSize);
  const offset = (page - 1) * pageSize;
  const sort = SORTABLE_COLUMNS.has(params.sort) ? params.sort : DEFAULT_SORT;
  const dir = String(params.dir ?? '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const rowsSql =
    `SELECT ${CHANGELOG_COLUMNS.join(', ')} FROM ${table}${whereSql}` +
    ` ORDER BY ${sort} ${dir}, orderexecuted ASC LIMIT $${countValues.length + 1} OFFSET $${countValues.length + 2}`;
  const rowsValues = [...countValues, pageSize, offset];
  const countSql = `SELECT count(*)::int AS total FROM ${table}${whereSql}`;

  return { rowsSql, countSql, rowsValues, countValues, page, pageSize, sort, dir };
}
