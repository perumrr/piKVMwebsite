#!/usr/bin/env bash
set -euo pipefail

mkdir -p authelia/secrets
chmod 700 authelia/secrets

for name in session_secret storage_encryption_key jwt_secret; do
  echo "Generating $name.txt"
  docker run --rm authelia/authelia:latest authelia crypto rand --length 64 > "authelia/secrets/$name.txt"
  chmod 600 "authelia/secrets/$name.txt"
done

echo "Secrets created under authelia/secrets/"
