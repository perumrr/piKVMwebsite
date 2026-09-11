const { fetch, Agent } = require('undici');

// piKVM ships with a self-signed TLS certificate by default. This backend
// only ever talks to piKVMs on the trusted local network, so we relax
// certificate verification for these calls specifically. Do not reuse this
// agent for requests to anything else.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// slug -> { token, obtainedAt }
const tokenCache = new Map();

async function login(kvm) {
  const res = await fetch(`${kvm.host}/api/auth/login`, {
    method: 'POST',
    dispatcher: insecureAgent,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user: kvm.user, passwd: kvm.pass }).toString()
  });

  if (!res.ok) {
    throw new Error(`Login to "${kvm.name}" failed: HTTP ${res.status}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/auth_token=([^;]+)/);
  if (!match) {
    throw new Error(`Login to "${kvm.name}" succeeded but no auth_token cookie was returned`);
  }

  const token = match[1];
  tokenCache.set(kvm.slug, { token, obtainedAt: Date.now() });
  return token;
}

async function getToken(kvm, { forceRefresh = false } = {}) {
  const cached = tokenCache.get(kvm.slug);
  if (cached && !forceRefresh) return cached.token;
  return login(kvm);
}

// Calls a piKVM API path, logging in (or re-logging in once on 401/403) as needed.
async function authedFetch(kvm, apiPath, options = {}) {
  let token = await getToken(kvm);

  const doFetch = (t) => fetch(`${kvm.host}${apiPath}`, {
    ...options,
    dispatcher: insecureAgent,
    headers: {
      ...(options.headers || {}),
      Cookie: `auth_token=${t}`
    }
  });

  let res = await doFetch(token);
  if (res.status === 401 || res.status === 403) {
    token = await getToken(kvm, { forceRefresh: true });
    res = await doFetch(token);
  }
  return res;
}

async function getStatus(kvm) {
  try {
    const [atxRes, streamerRes] = await Promise.all([
      authedFetch(kvm, '/api/atx'),
      authedFetch(kvm, '/api/streamer')
    ]);

    if (!atxRes.ok || !streamerRes.ok) {
      return {
        slug: kvm.slug,
        name: kvm.name,
        online: false,
        error: `HTTP ${atxRes.status}/${streamerRes.status}`
      };
    }

    const atx = await atxRes.json();
    const streamer = await streamerRes.json();

    // leds.power reflects the motherboard's actual power LED via the ATX
    // GPIO wiring — it's null/unreliable if that isn't set up on a given
    // piKVM, so the UI should treat null as "unknown", not "off".
    const poweredOn = atx?.result?.leds?.power ?? null;

    const sinks = streamer?.result?.streamer?.sinks || {};
    const someoneConnected = Object.values(sinks).some((s) => s && s.has_clients);

    return { slug: kvm.slug, name: kvm.name, online: true, poweredOn, someoneConnected };
  } catch (err) {
    return { slug: kvm.slug, name: kvm.name, online: false, error: err.message };
  }
}

module.exports = { getToken, authedFetch, getStatus };
