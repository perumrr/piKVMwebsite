const POLL_MS = 10000;

async function loadStatus() {
  let res;
  try {
    res = await fetch('/api/status');
  } catch (err) {
    return; // transient network hiccup — next poll will retry
  }

  if (res.status === 401) {
    window.location.href = '/';
    return;
  }

  const data = await res.json();
  render(data.pikvms || []);
}

function statusBadges(kvm) {
  if (!kvm.online) {
    return '<span class="badge badge-offline">Unreachable</span>';
  }

  const badges = [];

  if (kvm.someoneConnected) {
    badges.push('<span class="badge badge-active">Someone connected</span>');
  } else {
    badges.push('<span class="badge badge-idle">No one connected</span>');
  }

  if (kvm.poweredOn === true) {
    badges.push('<span class="badge badge-on">Powered on</span>');
  } else if (kvm.poweredOn === false) {
    badges.push('<span class="badge badge-off">Powered off</span>');
  }
  // kvm.poweredOn === null: ATX power sensing isn't wired up on this unit — omit the badge.

  return badges.join(' ');
}

function render(pikvms) {
  const container = document.getElementById('kvm-list');

  if (!pikvms.length) {
    container.innerHTML = '<p>No piKVMs configured yet.</p>';
    return;
  }

  container.innerHTML = pikvms.map((kvm) => `
    <a class="kvm-card" href="/kvm/${kvm.slug}/">
      <h2>${kvm.name}</h2>
      <div class="badges">${statusBadges(kvm)}</div>
    </a>
  `).join('');
}

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/';
});

loadStatus();
setInterval(loadStatus, POLL_MS);
