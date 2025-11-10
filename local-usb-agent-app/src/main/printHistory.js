const MAX_HISTORY = 200;

let configStore = null;

function init(store) {
  configStore = store;
}

function getHistory() {
  if (!configStore) return [];
  return configStore.get('printHistory') || [];
}

function append(entry) {
  if (!configStore) return;
  const history = getHistory();
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };
  const next = [record, ...history].slice(0, MAX_HISTORY);
  configStore.set('printHistory', next);
}

function clear() {
  if (!configStore) return;
  configStore.set('printHistory', []);
}

module.exports = {
  init,
  getHistory,
  append,
  clear
};
