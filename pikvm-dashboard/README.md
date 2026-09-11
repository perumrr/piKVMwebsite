# piKVM Dashboard

A login-gated dashboard listing your piKVMs with live status, where signing
in once on this site is enough to use every piKVM — no separate piKVM login.

## How it works

- Everyone signs in with **one shared site account** (`SITE_USERNAME` /
  `SITE_PASSWORD_HASH`), which creates a session cookie for this app.
- The Node app logs into each piKVM **server-side** using a shared piKVM
  account (`PIKVM_USER` / `PIKVM_PASS`) and caches the resulting `auth_token`.
- nginx proxies `/kvm/<slug>/*` to the real piKVM, but first checks (via
  `auth_request`) that the visitor has a valid site session, and injects the
  cached piKVM token into the proxied request. The visitor's browser never
  talks to the piKVM directly and never sees its login page.
- The dashboard page polls each piKVM's `/api/atx` and `/api/streamer`
  endpoints (server-side, using the same cached token) to show power state
  and whether anyone is currently connected.
- Because the piKVMs are only reached through this proxy, you can (and
  should) firewall each piKVM to refuse connections from anything except the
  proxy host — see **Step 5**.

```
Browser --> nginx (TLS, auth_request) --> Node app (/, /login, /dashboard, /api/*)
                |
                +--> /kvm/<slug>/* --> piKVM (token injected, no user-facing login)
```

## Prerequisites

- A Linux host (can be the same machine the piKVMs live on, or any box on
  the same LAN) with Node.js 18+ and nginx installed.
- Each piKVM's IP/hostname and a piKVM account (existing or new) that will
  be used as the shared "service account" for the proxy.

## Step 1 — Get the code onto the server

Copy this whole project directory to the server, e.g. `/opt/pikvm-dashboard`.

```bash
cd /opt/pikvm-dashboard
npm install
```

## Step 2 — Configure the piKVM list

```bash
cp pikvms.json.example pikvms.json
```

Edit `pikvms.json` — one entry per piKVM, with a short unique `slug`, a
display `name`, and its `host` (include the scheme, e.g. `https://192.168.1.50`).

## Step 3 — Configure secrets

```bash
cp .env.example .env
```

Edit `.env`:

- `SITE_USERNAME` — the shared username everyone will log in with.
- `SITE_PASSWORD_HASH` — generate with:
  ```bash
  npm run hash-password -- 'the-real-shared-password'
  ```
  and paste the output in.
- `SESSION_SECRET` — a long random string:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `PIKVM_USER` / `PIKVM_PASS` — a real account on every piKVM listed in
  `pikvms.json`. If it doesn't exist yet, create it on each piKVM with:
  ```bash
  kvmd-htpasswd set /etc/kvmd/htpasswd dashboard-proxy
  ```
  (run on the piKVM itself, over SSH).
- `NODE_ENV=production` — required so session cookies are marked `Secure`
  (which requires the HTTPS setup in Step 4).

## Step 4 — Set up nginx

1. Copy the snippet:
   ```bash
   mkdir -p /etc/nginx/snippets
   cp nginx/snippets/pikvm-dashboard-locations.conf /etc/nginx/snippets/
   ```
2. Copy `nginx/pikvm-dashboard.conf` to `/etc/nginx/sites-available/` (or
   `conf.d/`), symlink it into `sites-enabled/` if your distro uses that
   pattern, and edit:
   - `server_name` to your real hostname.
   - In the snippet, duplicate the `/kvm/<slug>/` block for every piKVM in
     `pikvms.json`, matching `slug` and `host` exactly.
3. Set up TLS (uncomment the `443` server block and point it at a real
   certificate, or a self-signed one for LAN-only use) and test:
   ```bash
   nginx -t && systemctl reload nginx
   ```

Cookies are set `Secure` in production, so the login page must be served
over HTTPS for sign-in to work.

## Step 5 — Lock the piKVMs down to the proxy only

This is the step that actually fixes "anyone with the link can reach it."
On each piKVM (or your router/firewall), restrict incoming connections on
the piKVM's web port to only the proxy server's IP — e.g. with `nft`/`iptables`
on the piKVM itself, or a firewall rule at the switch/router level. Once
that's in place, the only way to reach a piKVM is through your login-gated
proxy.

## Step 6 — Run the app

For a quick test:

```bash
NODE_ENV=production npm start
```

For a persistent service, create `/etc/systemd/system/pikvm-dashboard.service`:

```ini
[Unit]
Description=piKVM Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pikvm-dashboard
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
EnvironmentFile=/opt/pikvm-dashboard/.env
Environment=NODE_ENV=production
User=pikvm-dashboard

[Install]
WantedBy=multi-user.target
```

Then:

```bash
useradd -r -s /usr/sbin/nologin pikvm-dashboard   # if it doesn't exist
chown -R pikvm-dashboard:pikvm-dashboard /opt/pikvm-dashboard
systemctl daemon-reload
systemctl enable --now pikvm-dashboard
```

## Step 7 — Test it

1. Visit your site's URL — you should land on the login page.
2. Sign in with `SITE_USERNAME` / the real password.
3. The dashboard should list every piKVM with a status badge; badges refresh
   every `STATUS_POLL_INTERVAL_MS` (default 10s).
4. Click a piKVM — you should land directly in its interface with no
   additional login prompt.
5. From a machine that isn't going through the proxy, confirm the piKVM's
   own address is no longer reachable (Step 5).

## Notes and limitations

- **Sessions are in-memory** (`express-session`'s default store). Fine for a
  single small deployment; restarting the app logs everyone out. If you ever
  run multiple app instances behind a load balancer, switch to a shared
  store (e.g. `connect-redis`).
- **Shared account model**: everyone logs into the site with the same
  credentials, and the app in turn uses one shared piKVM account for all
  proxied access. There's no per-user audit trail with this setup — if you
  later want to know *who* connected to *which* piKVM and *when*, you'd need
  individual site accounts and per-user logging, which is a bigger change.
- **`poweredOn: null`** on the dashboard means that piKVM's ATX power-sensing
  isn't wired/configured — that's a piKVM hardware setup thing, not a bug
  here.
- This is a solid setup for a small trusted team on a home/lab network. It
  is not a hardened multi-tenant system — if this ever needs to serve a
  larger or less-trusted audience, revisit per-user accounts, real audit
  logging, and a managed session store.
