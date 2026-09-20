import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { ConfigError, loadConfig, parseArgs } from './config.js';
import { createPool } from './db.js';
import { listChangelog, listLocks, unlock } from './repository.js';

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
    target:
      `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}` +
      ` · ${config.changelog.schema}.${config.changelog.table}`,
    allowUnlock: config.server.allowUnlock,
    server: { pageSize: config.server.pageSize, maxPageSize: config.server.maxPageSize },
  };
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
      response.json(await listChangelog(pool, config, parseChangelogParams(request.query)));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/lock', async (request, response, next) => {
    try {
      response.json({ rows: await listLocks(pool, config) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/lock/unlock', async (request, response, next) => {
    if (!config.server.allowUnlock) {
      response.status(403).json({ error: 'Unlocking is disabled by configuration' });
      return;
    }
    try {
      response.json({ released: await unlock(pool, config) });
    } catch (error) {
      next(error);
    }
  });

  // Express needs four arguments to treat this as error middleware.
  app.use((error, request, response, _next) => {
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
