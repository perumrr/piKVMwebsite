#!/usr/bin/env bash
set -euo pipefail

docker compose config
docker compose run --rm authelia authelia config validate --config /config/configuration.yml
echo "Basic configuration validation completed."
