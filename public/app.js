const state = {
  page: 1,
  pages: 1,
  pageSize: 25,
  sort: 'orderexecuted',
  dir: 'asc',
  filters: {},
};

const elements = {
  target: document.getElementById('target'),
  lock: document.getElementById('lock'),
  lockText: document.getElementById('lock-text'),
  unlock: document.getElementById('unlock'),
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
  elements.error.textContent = error.message;
  elements.error.hidden = false;
}

function clearError() {
  elements.error.textContent = '';
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
      badge.className = `badge ${row.exectype}`;
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

async function loadChangelog() {
  clearError();
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    sort: state.sort,
    dir: state.dir,
  });
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }

  try {
    const result = await api(`/api/changelog?${params}`);
    renderRows(result.rows);
    renderPagination(result);
    markSortedColumn();
    elements.empty.hidden = result.total !== 0;
  } catch (error) {
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
  elements.unlock.hidden = false;
}

async function loadLock() {
  try {
    const { rows } = await api('/api/lock');
    renderLock(rows);
  } catch (error) {
    showError(error);
  }
}

async function loadConfig() {
  const config = await api('/api/config');
  elements.target.textContent =
    `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}` +
    ` · ${config.changelog.schema}.${config.changelog.table}`;
  state.pageSize = config.server.pageSize;
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

function bindEvents() {
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
    th.addEventListener('click', () => {
      const column = th.dataset.sort;
      if (state.sort === column) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = column;
        state.dir = 'asc';
      }
      state.page = 1;
      loadChangelog();
    });
  }

  elements.unlock.addEventListener('click', async () => {
    if (!window.confirm('Release the Liquibase lock? Only do this if no deployment is running.')) {
      return;
    }
    try {
      const { released } = await api('/api/lock/unlock', { method: 'POST' });
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
