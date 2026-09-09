# Network and security setup

## Goal

The only public service should be the gateway:

    Internet -> gateway:443 -> authenticated proxy -> private PiKVM

A PiKVM must not remain directly reachable from the public Internet.

## Recommended firewall

Gateway:
- allow TCP 80 from Internet (needed for HTTP->HTTPS and ACME HTTP challenges)
- allow TCP 443 from Internet
- allow SSH only from your administration source/network
- allow gateway -> PiKVM TCP 443 over the private network/VPN

PiKVM:
- deny Internet -> TCP 443
- allow gateway -> TCP 443
- allow SSH only from your administration source/network if SSH is required
- keep PiKVM's own authentication enabled

## If the PiKVMs are on your home/office LAN

The gateway must have a route to that LAN.

If the gateway is a cloud VPS, do not simply open the PiKVMs to the VPS's public Internet address and call them private. Use a VPN such as WireGuard or another authenticated private tunnel.

## DNS

Public names should resolve to the gateway:

    portal.example.com -> gateway public IP
    auth.example.com   -> gateway public IP
    kvm1.example.com   -> gateway public IP

The private upstream remains something like:

    kvm1.example.com -> 10.0.10.21 (inside the gateway's private routing)

## Why the browser never talks directly to the PiKVM

The dashboard gives the browser the protected URL, not the PiKVM's private IP or credentials.

Caddy checks the Authelia session before forwarding requests to the PiKVM. This matters for normal HTTP requests and PiKVM WebSockets.

## Do not do this

Do not:

- put PiKVM admin passwords in frontend JavaScript
- send PiKVM passwords to browsers
- rely on a hidden dashboard button as authorization
- expose the PiKVM public port and assume an obscure URL is enough
- disable PiKVM authentication
- trust user-supplied X-Forwarded-* headers

## Defense in depth

Even with SSO in front, keep the PiKVM KVM/API authentication enabled. If the proxy is ever misconfigured, the PiKVM's own authentication remains another barrier.
