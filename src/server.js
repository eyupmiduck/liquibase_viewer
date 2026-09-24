import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { ConfigError, loadConfig, parseArgs } from './config.js';
import { createPool } from './db.js';
import { listChangelog, listLocks, unlock } from './repository.js';
import { resolveTarget, TargetError } from './target.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  console.log(`Usage: node src/server.js [--config <file>]

Options:
  --config <file>  YAML configuration file (default: config/default.yaml)
  -h, --help       Show this help

The database password is read from the environment variable named by
database.passwordEnv in the configuration (VIEWER_DB_PASSWORD by default).`);
}

function publicConfig(config) {
  return {
    // The UI only needs a display label, so keep the raw connection
    // coordinates server-side.
    connection: `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
    // Defaults for the editable schema/table inputs.
    schema: config.changelog.schema,
    table: config.changelog.table,
    allowUnlock: config.server.allowUnlock,
    server: { pageSize: config.server.pageSize, maxPageSize: config.server.maxPageSize },
  };
}

// Answers 400 for a bad schema/table and reports whether it handled the error.
function sendTargetError(error, response) {
  if (error instanceof TargetError) {
    response.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

function parseChangelogParams(query) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    dir: query.dir,
    filters: {
      id: query.id,
      author: query.author,
      filename: query.filename,
      exectype: query.exectype,
      tag: query.tag,
      description: query.description,
      contexts: query.contexts,
      labels: query.labels,
      deployment_id: query.deployment_id,
      from: query.from,
      to: query.to,
    },
  };
}

function createApp(config, pool) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(projectRoot, 'public')));

  app.get('/api/config', (request, response) => {
    response.json(publicConfig(config));
  });

  app.get('/api/changelog', async (request, response, next) => {
    try {
      const target = resolveTarget(config, request.query);
      response.json(
        await listChangelog(pool, config, target.changelog, parseChangelogParams(request.query)),
      );
    } catch (error) {
      if (sendTargetError(error, response)) return;
      next(error);
    }
  });

  app.get('/api/lock', async (request, response, next) => {
    try {
      const target = resolveTarget(config, request.query);
      response.json({ rows: await listLocks(pool, target.lock) });
    } catch (error) {
      if (sendTargetError(error, response)) return;
      next(error);
    }
  });

  app.post('/api/lock/unlock', async (request, response, next) => {
    if (!config.server.allowUnlock) {
      response.status(403).json({ error: 'Unlocking is disabled by configuration' });
      return;
    }
    try {
      const target = resolveTarget(config, request.query);
      response.json({ released: await unlock(pool, target.lock) });
    } catch (error) {
      if (sendTargetError(error, response)) return;
      next(error);
    }
  });

  // Express needs four arguments to treat this as error middleware.
  app.use((error, request, response, _next) => {
    // A schema or table that does not exist is a client mistake, not a server
    // fault: 42P01 = undefined_table, 3F000 = invalid_schema_name.
    if (error?.code === '42P01' || error?.code === '3F000') {
      response.status(404).json({ error: 'Table not found: check the schema and table names.' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let config;
  try {
    config = loadConfig({ argv: process.argv.slice(2) });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const pool = createPool(config);
  const app = createApp(config, pool);

  const server = app.listen(config.server.port, config.server.host, () => {
    console.log(`liquibase-viewer on http://${config.server.host}:${config.server.port}`);
    console.log(`  config:    ${config.configPath}`);
    console.log(
      `  database:  ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`,
    );
    console.log(`  changelog: ${config.changelog.schema}.${config.changelog.table}`);
    console.log(`  lock:      ${config.lock.schema}.${config.lock.table}`);
  });

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
