const API = {
  config: '/api/config',
  changelog: '/api/changelog',
  lock: '/api/lock',
  unlock: '/api/lock/unlock',
};

// Known Liquibase execution types, used to pick a badge style safely.
const EXEC_TYPES = new Set(['EXECUTED', 'FAILED', 'RERAN', 'MARK_RAN', 'SKIPPED']);

const state = {
  page: 1,
  pages: 1,
  pageSize: 25,
  sort: 'orderexecuted',
  dir: 'asc',
  allowUnlock: true,
  filters: {},
  schema: '',
  table: '',
  defaults: { schema: '', table: '' },
};

// Incremented on every changelog request so a slower, older response cannot
// overwrite a newer one.
let changelogRequest = 0;

const elements = {
  target: document.getElementById('target'),
  lock: document.getElementById('lock'),
  lockText: document.getElementById('lock-text'),
  unlock: document.getElementById('unlock'),
  targetForm: document.getElementById('target-form'),
  targetReset: document.getElementById('target-reset'),
  schemaInput: document.querySelector('#target-form input[name="schema"]'),
  tableInput: document.querySelector('#target-form input[name="table"]'),
  filters: document.getElementById('filters'),
  clear: document.getElementById('clear'),
  rows: document.getElementById('rows'),
  empty: document.getElementById('empty'),
  summary: document.getElementById('summary'),
  pageLabel: document.getElementById('page-label'),
  pageSize: document.getElementById('page-size'),
  first: document.getElementById('first'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  last: document.getElementById('last'),
  error: document.getElementById('error'),
  errorText: document.getElementById('error-text'),
  errorClose: document.getElementById('error-close'),
  table: document.getElementById('changelog'),
};

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  return response.json();
}

function showError(error) {
  elements.errorText.textContent = error.message;
  elements.error.hidden = false;
}

function clearError() {
  elements.errorText.textContent = '';
  elements.error.hidden = true;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  if (className) td.className = className;
  return td;
}

function renderRows(rows) {
  elements.rows.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.append(cell(row.orderexecuted, 'num'));
    tr.append(cell(row.id, 'mono'));
    tr.append(cell(row.author));
    tr.append(cell(row.filename, 'mono'));

    const typeCell = document.createElement('td');
    if (row.exectype) {
      const badge = document.createElement('span');
      badge.className = `badge ${EXEC_TYPES.has(row.exectype) ? row.exectype : 'OTHER'}`;
      badge.textContent = row.exectype;
      typeCell.append(badge);
    }
    tr.append(typeCell);

    tr.append(cell(row.tag));
    tr.append(cell(formatDate(row.dateexecuted)));
    tr.append(cell(row.description));
    elements.rows.append(tr);
  }
}

function renderPagination(result) {
  const firstRow = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const lastRow = Math.min(result.page * result.pageSize, result.total);
  elements.summary.textContent = `${firstRow}–${lastRow} of ${result.total}`;
  elements.pageLabel.textContent = `Page ${result.page} of ${result.pages}`;

  state.pages = result.pages;
  elements.first.disabled = result.page <= 1;
  elements.prev.disabled = result.page <= 1;
  elements.next.disabled = result.page >= result.pages;
  elements.last.disabled = result.page >= result.pages;
}

function markSortedColumn() {
  for (const th of elements.table.querySelectorAll('th[data-sort]')) {
    if (th.dataset.sort === state.sort) {
      th.setAttribute('aria-sort', state.dir === 'desc' ? 'descending' : 'ascending');
    } else {
      th.removeAttribute('aria-sort');
    }
  }
}

function targetParams() {
  return { schema: state.schema, table: state.table };
}

async function loadChangelog() {
  clearError();
  const token = ++changelogRequest;

  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    sort: state.sort,
    dir: state.dir,
    schema: state.schema,
    table: state.table,
  });
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }

  try {
    const result = await api(`${API.changelog}?${params}`);
    if (token !== changelogRequest) return;
    renderRows(result.rows);
    renderPagination(result);
    markSortedColumn();
    elements.empty.hidden = result.total !== 0;
  } catch (error) {
    if (token !== changelogRequest) return;
    showError(error);
  }
}

function renderLock(rows) {
  const held = rows.filter((row) => row.locked);
  elements.lock.hidden = false;
  if (held.length === 0) {
    elements.lock.classList.remove('locked');
    elements.lockText.textContent = 'Not locked';
    elements.unlock.hidden = true;
    return;
  }
  elements.lock.classList.add('locked');
  const details = held
    .map((row) =>
      [row.lockedby, row.lockgranted && formatDate(row.lockgranted)]
        .filter(Boolean)
        .join(' since '),
    )
    .filter(Boolean)
    .join(', ');
  elements.lockText.textContent = `Locked${details ? ` by ${details}` : ''}`;
  elements.unlock.hidden = !state.allowUnlock;
}

async function loadLock() {
  try {
    const params = new URLSearchParams(targetParams());
    const { rows } = await api(`${API.lock}?${params}`);
    renderLock(rows);
  } catch (error) {
    showError(error);
  }
}

function ensurePageSizeOption(value) {
  const exists = [...elements.pageSize.options].some((option) => Number(option.value) === value);
  if (!exists) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    elements.pageSize.append(option);
  }
}

async function loadConfig() {
  const config = await api(API.config);
  elements.target.textContent = config.connection;
  state.pageSize = config.server.pageSize;
  state.allowUnlock = config.allowUnlock;
  state.defaults = { schema: config.schema, table: config.table };
  state.schema = config.schema;
  state.table = config.table;
  elements.schemaInput.value = config.schema;
  elements.tableInput.value = config.table;
  ensurePageSizeOption(config.server.pageSize);
  elements.pageSize.value = String(config.server.pageSize);
}

function readFilters() {
  const data = new FormData(elements.filters);
  const filters = {};
  for (const [key, value] of data.entries()) {
    if (String(value).trim() !== '') filters[key] = String(value).trim();
  }
  return filters;
}

function sortBy(column) {
  if (state.sort === column) {
    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort = column;
    state.dir = 'asc';
  }
  state.page = 1;
  loadChangelog();
}

function bindEvents() {
  elements.errorClose.addEventListener('click', clearError);

  elements.targetForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.schema = elements.schemaInput.value.trim() || state.defaults.schema;
    state.table = elements.tableInput.value.trim() || state.defaults.table;
    elements.schemaInput.value = state.schema;
    elements.tableInput.value = state.table;
    state.page = 1;
    clearError();
    loadChangelog();
    loadLock();
  });

  elements.targetReset.addEventListener('click', () => {
    state.schema = state.defaults.schema;
    state.table = state.defaults.table;
    elements.schemaInput.value = state.schema;
    elements.tableInput.value = state.table;
    state.page = 1;
    clearError();
    loadChangelog();
    loadLock();
  });

  elements.filters.addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters = readFilters();
    state.page = 1;
    loadChangelog();
  });

  elements.clear.addEventListener('click', () => {
    elements.filters.reset();
    state.filters = {};
    state.page = 1;
    loadChangelog();
  });

  elements.pageSize.addEventListener('change', () => {
    state.pageSize = Number(elements.pageSize.value);
    state.page = 1;
    loadChangelog();
  });

  elements.first.addEventListener('click', () => {
    state.page = 1;
    loadChangelog();
  });
  elements.prev.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    loadChangelog();
  });
  elements.next.addEventListener('click', () => {
    state.page = Math.min(state.pages, state.page + 1);
    loadChangelog();
  });
  elements.last.addEventListener('click', () => {
    state.page = state.pages;
    loadChangelog();
  });

  for (const th of elements.table.querySelectorAll('th[data-sort]')) {
    th.tabIndex = 0;
    th.addEventListener('click', () => sortBy(th.dataset.sort));
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        sortBy(th.dataset.sort);
      }
    });
  }

  elements.unlock.addEventListener('click', async () => {
    if (!window.confirm('Release the Liquibase lock? Only do this if no deployment is running.')) {
      return;
    }
    try {
      const params = new URLSearchParams(targetParams());
      const { released } = await api(`${API.unlock}?${params}`, { method: 'POST' });
      await loadLock();
      await loadChangelog();
      if (released === 0) {
        window.alert('There was no lock to release.');
      }
    } catch (error) {
      showError(error);
    }
  });
}

async function start() {
  bindEvents();
  try {
    await loadConfig();
  } catch (error) {
    showError(error);
  }
  await Promise.all([loadLock(), loadChangelog()]);
}

start();
