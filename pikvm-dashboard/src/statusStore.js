let statuses = [];
let lastUpdated = null;

function setStatuses(next) {
  statuses = next;
  lastUpdated = new Date().toISOString();
}

function getStatuses() {
  return { pikvms: statuses, lastUpdated };
}

module.exports = { setStatuses, getStatuses };
