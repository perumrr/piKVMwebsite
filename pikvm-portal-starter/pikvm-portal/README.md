# PiKVM Portal — secure SSO starter

This project gives you:

- A single sign-in page handled by Authelia.
- A protected dashboard listing your PiKVMs.
- One SSO session shared by the dashboard and PiKVM subdomains.
- A Node.js backend that checks PiKVM health/status without exposing PiKVM credentials to browsers.
- Caddy as the public HTTPS reverse proxy.
- PiKVMs kept behind the reverse proxy instead of being directly exposed.
- WebSocket-compatible proxying for PiKVM video/input.
- Optional per-user/group authorization through Authelia.
- Docker Compose deployment.

## Important architecture

Internet
  |
  v
Caddy :80/:443
  |
  +--> auth.example.com       -> Authelia
  |
  +--> portal.example.com     -> dashboard (protected by Authelia)
  |
  +--> kvm1.example.com       -> PiKVM 1 (protected by Authelia)
  |
  +--> kvm2.example.com       -> PiKVM 2 (protected by Authelia)
  |
  +--> private LAN/VPN
          |
          +--> PiKVM 1
          +--> PiKVM 2

Do NOT publish the PiKVMs directly to the Internet once this is working.
The gateway server must be able to reach the PiKVM private IPs.

## What this starter assumes

- You have a Linux server capable of running Docker.
- The server has a public IP or is otherwise reachable by your users.
- You own/control a DNS domain.
- The server can reach the PiKVMs over a private LAN, VPN, or other private route.
- You are okay with Authelia providing the login UI. This is intentional: it avoids inventing a second authentication system and gives the dashboard and PiKVMs one SSO session.

If your PiKVMs are on a different network, establish a VPN/private route first. WireGuard is a common choice, but the exact VPN setup depends on your network.

## Files

- `compose.yml` — Docker services
- `Caddyfile` — HTTPS, SSO protection, and PiKVM reverse proxying
- `dashboard/` — dashboard backend/frontend
- `authelia/config/configuration.yml` — authentication configuration
- `authelia/config/users.yml` — local users with password hashes
- `authelia/secrets/` — generated secrets; never commit these
- `config/pikvms.json` — your PiKVM inventory and private upstream addresses
- `.env.example` — domain settings

## Quick start

### 1. Install Docker

Use Docker's official installation instructions for your Linux distribution.

Then verify:

    docker --version
    docker compose version

### 2. Copy this project to your server

For example:

    sudo mkdir -p /opt/pikvm-portal
    cd /opt/pikvm-portal

Copy the project files there.

### 3. Configure your domain

Copy:

    cp .env.example .env

Edit `.env`:

    DOMAIN=example.com
    AUTH_HOST=auth.example.com
    PORTAL_HOST=portal.example.com

Replace `example.com` with your actual domain. Also replace `auth.example.com`, `portal.example.com`, and every `kvm*.example.com` occurrence in the configuration files.

### 4. Configure DNS

Create DNS records pointing at the public IP of this server:

    auth.example.com
    portal.example.com
    kvm1.example.com
    kvm2.example.com

You can use individual A/AAAA records or a wildcard record if appropriate.

Do not point the PiKVM's old public IP directly at the Internet anymore. The public DNS name should point to this gateway.

### 5. Generate Authelia secrets

Create the directory:

    mkdir -p authelia/secrets

Generate three random 64-character secrets:

    docker run --rm authelia/authelia:latest authelia crypto rand --length 64

Run that three times and put the outputs in:

    authelia/secrets/session_secret.txt
    authelia/secrets/storage_encryption_key.txt
    authelia/secrets/jwt_secret.txt

Then:

    chmod 600 authelia/secrets/*.txt

The files are deliberately excluded by `.gitignore`.

### 6. Create your first user password hash

Run:

    docker run --rm -it authelia/authelia:latest authelia crypto hash generate argon2

Enter the password you want to use.

Copy the resulting `Digest: $argon2id$...` value.

Edit:

    authelia/config/users.yml

Replace `REPLACE_WITH_ARGON2_HASH` with that digest.

Do NOT put your plaintext password in `users.yml`.

### 7. Add your PiKVMs

Edit:

    config/pikvms.json

Example:

    [
      {
        "id": "server-room-1",
        "name": "Server Room 1",
        "host": "10.0.10.21",
        "port": 443,
        "url": "https://kvm1.example.com",
        "username": "admin",
        "password": "REPLACE_ME"
      }
    ]

The `host` is the PRIVATE address reachable from this Docker server.

The `url` is what users click. It must be the protected public hostname that Caddy serves, not the private IP.

Change each PiKVM's admin password before using it. PiKVM has separate Linux/root and KVM/Web/API credentials; secure both.

For stronger production security, move the PiKVM credentials out of `config/pikvms.json` into Docker secrets or another secret manager. The starter keeps them in one easy-to-understand file so you can get running first.

### 8. Add Caddy routes

Edit `Caddyfile`.

The sample contains:

    kvm1.example.com {
        forward_auth authelia:9091 {
            uri /api/authz/forward-auth
            copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
        }

        reverse_proxy https://10.0.10.21 {
            transport http {
                tls_insecure_skip_verify
            }
        }
    }

Change the hostname and private PiKVM address.

For every PiKVM, add one protected hostname.

Do not use `tls_insecure_skip_verify` unless the PiKVM uses a self-signed certificate. If you install a certificate trusted by the gateway, remove that option.

### 9. Start the stack

    docker compose up -d

Check:

    docker compose ps

Then:

    docker compose logs -f authelia
    docker compose logs -f caddy
    docker compose logs -f dashboard

### 10. Test

Open:

    https://portal.example.com

You should be redirected to:

    https://auth.example.com

Log in.

You should return to the dashboard.

Click a PiKVM. You should be able to use it without logging in again.

### 11. Lock down the PiKVMs

This is mandatory for the security goal.

Once the gateway works, configure your router/firewall so that PiKVM HTTPS ports are NOT reachable from the public Internet.

Allow:

    gateway-server -> PiKVM:443

Deny:

    Internet -> PiKVM:443

If the gateway and PiKVMs are on different networks, allow the private VPN path instead.

Do not remove the PiKVM's own authentication. Keep it enabled as defense in depth.

## Status meanings

The dashboard backend currently reports:

- `offline` — the PiKVM API could not be reached.
- `in_use` — PiKVM's streamer reports one or more clients.
- `target_on` — the PiKVM ATX power indicator reports the target as on.
- `target_off` — ATX is available and reports power off.
- `no_target` — Redfish reports no target system.
- `online` — PiKVM is reachable but the target state could not be determined.
- `unknown` — the API returned an unexpected state.

PiKVM's API exposes `/api/info`, `/api/atx`, `/api/streamer`, and Redfish endpoints. The exact meaning of "in use" is intentionally based on the stream client count, so a user merely opening the video stream counts as active.

## Adding more PiKVMs

1. Add an entry to `config/pikvms.json`.
2. Add a DNS record.
3. Add a protected Caddy host block.
4. Restart:

    docker compose restart

## Security checklist

Before calling this production-ready:

- [ ] PiKVMs are not publicly reachable.
- [ ] PiKVM root/Linux passwords were changed.
- [ ] PiKVM KVM/API passwords were changed.
- [ ] PiKVM 2FA is enabled if appropriate.
- [ ] The gateway uses HTTPS.
- [ ] Authelia secrets are random and not committed.
- [ ] `users.yml` contains password hashes, not plaintext passwords.
- [ ] The server is patched.
- [ ] Docker images are kept updated deliberately.
- [ ] Firewall only exposes 80/443 (and SSH if needed).
- [ ] SSH is key-based and root login is disabled where appropriate.
- [ ] Backups exist for Authelia configuration/database.
- [ ] You have tested that an unauthenticated browser cannot reach a PiKVM hostname.
- [ ] You have tested that a PiKVM private IP cannot be reached from the public Internet.

## Important limitation

This starter treats every authenticated Authelia user as allowed to access every PiKVM.

If you later want:

    Alice -> PiKVM 1 and 2
    Bob   -> PiKVM 2 only
    Admin -> everything

we should add group-based authorization to the Caddy/Authelia rules and dashboard inventory. Do not implement authorization only in the frontend.

## Useful official documentation

PiKVM API:
https://docs.pikvm.org/api/

PiKVM authentication:
https://docs.pikvm.org/auth/

PiKVM reverse proxy:
https://docs.pikvm.org/reverse_proxy/

Authelia:
https://www.authelia.com/

Caddy:
https://caddyserver.com/

Read the official documentation before changing authentication or proxy rules in production.
