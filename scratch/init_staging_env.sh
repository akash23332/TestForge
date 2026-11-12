#!/usr/bin/env bash
set -euo pipefail

cd /home/azureuser/deploy-judge0
OLD_UMASK=$(umask)
umask 077

POSTGRES_PASS=$(openssl rand -hex 24)
REDIS_PASS=$(openssl rand -hex 24)
AUTHN_TOKEN=$(openssl rand -hex 32)
AUTHZ_TOKEN=$(openssl rand -hex 32)
CORRELATION_KEY=$(openssl rand -hex 32)

cat <<EOF > .env
POSTGRES_USER=judge0
POSTGRES_PASSWORD=$POSTGRES_PASS
POSTGRES_DB=judge0
REDIS_PASSWORD=$REDIS_PASS
AUTHN_TOKEN=$AUTHN_TOKEN
AUTHZ_TOKEN=$AUTHZ_TOKEN
CORRELATION_KEY=$CORRELATION_KEY
JUDGE0_IMAGE=testforge/judge0:v1.13.1-arm64
EOF

chmod 600 .env

sed -i "s/^AUTHN_TOKEN=.*/AUTHN_TOKEN=$AUTHN_TOKEN/" judge0.conf
sed -i "s/^AUTHZ_TOKEN=.*/AUTHZ_TOKEN=$AUTHZ_TOKEN/" judge0.conf
sed -i "s/^CORRELATION_KEY=.*/CORRELATION_KEY=$CORRELATION_KEY/" judge0.conf
sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASS/" judge0.conf
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASS/" judge0.conf
chmod 600 judge0.conf

umask "$OLD_UMASK"

echo "=== INITIALIZATION COMPLETE ==="
ls -la .env judge0.conf
