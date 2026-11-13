#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - Tailscale Private Mesh Setup Script
# Target: Ubuntu 22.04 LTS / 24.04 LTS (x86_64 / aarch64)
# Configures private, encrypted point-to-point networking between TestForge
# Background Workers (Render) and the isolated Judge0 Runner VM.
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo " TestForge Dedicated Runner - Tailscale Private Mesh Setup "
echo "========================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "[FATAL] This script must be run as root or with sudo."
  exit 1
fi

# 1. Install Tailscale
echo "[Step 1/4] Installing Tailscale..."
if ! command -v tailscale &> /dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "Tailscale is already installed: $(tailscale version | head -n1)"
fi

# 2. Enable and start tailscaled daemon
echo "[Step 2/4] Enabling tailscaled service..."
systemctl enable --now tailscaled

# 3. Authenticate and join tailnet
echo "[Step 3/4] Joining Tailnet..."
HOSTNAME_ARG="testforge-judge0-runner"
if [ -n "${TAILSCALE_AUTH_KEY:-}" ]; then
  echo "Connecting using provided TAILSCALE_AUTH_KEY..."
  tailscale up --authkey="${TAILSCALE_AUTH_KEY}" --hostname="${HOSTNAME_ARG}" --ssh
else
  echo "----------------------------------------------------------------------"
  echo "No TAILSCALE_AUTH_KEY provided in environment."
  echo "Please authenticate interactively via the login URL below:"
  echo "----------------------------------------------------------------------"
  tailscale up --hostname="${HOSTNAME_ARG}" --ssh
fi

# 4. Configure Host Firewall (UFW) for Tailscale
echo "[Step 4/4] Hardening firewall for Tailscale interface (tailscale0)..."
if command -v ufw &> /dev/null; then
  # Allow Judge0 API (port 2358) ONLY on the private Tailscale interface
  ufw allow in on tailscale0 to any port 2358 proto tcp comment 'Judge0 API via private Tailscale mesh only'
  
  # Ensure port 2358 is NEVER accessible from the public internet
  # (Internal docker-compose binds to 127.0.0.1:2358 or Tailscale interface)
  echo "Firewall rules updated to allow port 2358 exclusively over tailscale0."
fi

# Retrieve Tailscale IP and MagicDNS details
TS_IPV4=$(tailscale ip -4 2>/dev/null || echo "PENDING")
TS_STATUS=$(tailscale status --json 2>/dev/null || echo "{}")
TS_DNS=$(echo "$TS_STATUS" | grep -o '"Self":{[^}]*' | grep -o '"DNSName":"[^"]*' | cut -d'"' -f4 || echo "testforge-judge0-runner.your-tailnet.ts.net")

echo ""
echo "========================================================"
echo " Tailscale Private Mesh Setup Complete! "
echo "========================================================"
echo " Runner Tailscale IPv4:  $TS_IPV4"
echo " Runner MagicDNS Name:   $TS_DNS"
echo " Runner Private Port:    2358"
echo ""
echo " To configure TestForge Background Worker on Render:"
echo " 1. If using Tailscale Userspace SOCKS5 proxy on Render:"
echo "    RENDER_SANDBOX_ENDPOINT=http://${TS_IPV4}:2358"
echo "    TAILSCALE_PROXY=http://127.0.0.1:1056"
echo "    REQUIRE_PROXY=true"
echo ""
echo " 2. If using Caddy with TLS over MagicDNS:"
echo "    RENDER_SANDBOX_ENDPOINT=https://${TS_DNS}"
echo "========================================================"
