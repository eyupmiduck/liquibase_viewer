# liquibase_viewer

A small web application to browse the Liquibase bookkeeping tables in a
PostgreSQL database:

- the **changelog** table (`public.databasechangelog` by default): every applied
  changeset, with pagination, filtering and sorting;
- the **lock** table (`public.databasechangeloglock` by default): its state, and
  a button to release a stuck lock.

It is read-only apart from the explicit unlock action. The UI is plain
HTML/CSS/ES modules — there is no build step.

## Requirements

- Node.js 24 (see `.nvmrc`)
- A PostgreSQL database holding the Liquibase tables

## Configuration

Configuration is YAML. The default file is `config/default.yaml`; select another
with `--config <path>` or the `CONFIG` environment variable. If no file is
present, the built-in defaults are used.

```yaml
database:
  host: 127.0.0.1
  port: 5432
  name: ddl_utils
  user: postgres
  passwordEnv: VIEWER_DB_PASSWORD # password is read from this env var, never the file
  ssl: false

changelog:
  schema: public
  table: databasechangelog

lock:
  schema: public
  table: databasechangeloglock

server:
  host: 127.0.0.1
  port: 3210
  pageSize: 25
  maxPageSize: 200
  allowUnlock: true # set false to disable the unlock endpoint
```

A database can hold several changelog tables for different deployments; point
`changelog.schema`/`changelog.table` and `lock.schema`/`lock.table` at the right
ones.

## Running

```sh
npm install
VIEWER_DB_PASSWORD=postgres npm start
```

Then open <http://127.0.0.1:3210>.

To start it against the local `ddl_utils` development database, use the helper
script (it supplies that database's password for you):

```sh
scripts/run-local.sh
```

A different configuration file can be selected either way:

```sh
VIEWER_DB_PASSWORD=secret npm start -- --config config/prod.yaml
scripts/run-local.sh --config config/prod.yaml
```

## Development

```sh
npm run dev          # node --watch
npm run lint
npm run format
npm test             # unit tests; integration tests run when VIEWER_DB_PASSWORD is set
```

Integration tests point at the configured database. To run them against the
local `ddl_utils` development database:

```sh
VIEWER_DB_PASSWORD=postgres npm test
```

## HTTP API

| Method | Path               | Description                                                          |
| ------ | ------------------ | -------------------------------------------------------------------- |
| GET    | `/api/config`      | Display target and page-size settings (no connection credentials).   |
| GET    | `/api/changelog`   | Paginated changelog. See the query parameters below.                 |
| GET    | `/api/lock`        | Rows from the lock table.                                            |
| POST   | `/api/lock/unlock` | Releases a held lock (Liquibase `releaseLocks`); returns `released`. |

`GET /api/changelog` query parameters:

- `page` (default `1`), `pageSize` (default `server.pageSize`, capped at
  `server.maxPageSize`)
- `sort` (`orderexecuted`, `id`, `author`, `filename`, `dateexecuted`,
  `exectype`, `tag`; default `orderexecuted`) and `dir` (`asc`/`desc`)
- filters: `id`, `author`, `filename`, `exectype`, `tag`, `description`,
  `contexts`, `labels`, `deployment_id` (substring match) and `from`/`to`
  (`dateexecuted` range)

## Security notes

- The database password is read only from the environment variable named by
  `database.passwordEnv`; it is never written to disk.
- Schema and table names from the config are validated and quoted; filter values
  are bound parameters.
- The server binds to `127.0.0.1` by default. Exposing it beyond localhost is at
  your own risk — there is no authentication. Set `server.allowUnlock: false` to
  disable the unlock endpoint entirely.
- Releasing a lock is a write. Only do it when no deployment is running; the UI
  asks for confirmation first.
