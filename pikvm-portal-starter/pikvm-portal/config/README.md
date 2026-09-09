# PiKVM inventory

Edit `pikvms.json`.

For each PiKVM:

- `id`: stable internal identifier.
- `name`: display name.
- `host`: private IP or private DNS name reachable from the dashboard container.
- `port`: normally 443.
- `url`: protected public URL users will open.
- `username`: PiKVM KVM/API username.
- `password`: PiKVM KVM/API password.

The browser never receives the PiKVM credentials.

For production, move credentials to Docker secrets or a dedicated secret manager.
