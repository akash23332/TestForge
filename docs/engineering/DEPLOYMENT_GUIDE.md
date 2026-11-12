# DEPLOYMENT & INFRASTRUCTURE OPERATIONS GUIDE: TESTFORGE

**Document ID:** DOC-ENG-007  
**Version:** 1.0.0  
**Status:** Authoritative Operations Manual  
**Date:** November 12, 2026  
**Primary Architect:** Antigravity Engineering Agent

---

## 1. Operating Environment & Budget Protection Invariants

TestForge runs across two operational environments:
1. **Local Development / Testing:** Windows/Linux host running Node.js 22+, MongoDB, Redis, and mock/local execution providers.
2. **Staging Runner Infrastructure:** A dedicated Azure ARM64 virtual machine hosting custom Judge0 CE v1.13.1, Isolate sandbox, Redis, and Caddy reverse proxy.

### Strict Budget Governance Rules
* **Subscription:** Azure for Students (Central India).
* **Personal Cash Budget:** **₹0**.
* **Zero Sprawl Invariant:** Never create new Azure VMs, additional unattached OS/data disks, public IPs, or load balancers.
* **No Pay-As-You-Go:** Never upgrade the subscription to Pay-As-You-Go or attach personal payment cards.
* **Authorization Gate:** Any infrastructure operation (SSH, Docker builds, service restarts on VM) strictly requires explicit user confirmation.

---

## 2. Staging Infrastructure Specifications

* **VM Name:** `testforge-judge0-staging`
* **Region:** Central India
* **Size:** Standard_D2ps_v5 (2 vCPU, 8 GB RAM, 30 GB OS Disk) *(Authoritative: Dedicated non-burstable ARM64 Ampere Altra CPU; reconciled against historical preflight references to burstable Standard_B2ps_v2)*
* **Architecture:** ARM64 / `aarch64`
* **Operating System:** Ubuntu 22.04.5 LTS
* **Default User:** `azureuser`
* **Disaster Recovery Snapshot:** `testforge-before-cgroup-change`
* **Kernel Cgroup Arrangement:** Hybrid cgroups (cgroup v2 host with v1 controllers mounted for Isolate compatibility):
  * `/sys/fs/cgroup/memory`
  * `/sys/fs/cgroup/cpu,cpuacct`
  * `/sys/fs/cgroup/pids`
  * `/sys/fs/cgroup/devices`
  * `/sys/fs/cgroup/freezer`
  * `/sys/fs/cgroup/unified`

---

## 3. Local Development Setup

### 3.1 Prerequisites
* Node.js v20.x or v22.x LTS
* npm v10+
* MongoDB v6.0+ running locally (`mongodb://localhost:27017/testforge`)
* Redis v6.0+ or Valkey running locally (`redis://localhost:6379`)

### 3.2 Environment Variables (`server/.env`)
```bash
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/testforge
REDIS_URL=redis://localhost:6379
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_for_dev
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173

# Execution Provider Configuration
# Options: 'mock', 'local', 'judge0'
EXECUTION_PROVIDER=mock
JUDGE0_API_URL=https://staging-judge0.yourdomain.internal
JUDGE0_AUTH_TOKEN=dev_auth_token_secret
CORRELATION_KEY=at_least_32_bytes_super_secret_correlation_key_12345
```

### 3.3 Running Locally
```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Run backend API server
cd server && npm run dev

# 3. Run background BullMQ execution worker
cd server && npm run worker

# 4. Run frontend client
cd client && npm run dev
```

---

## 4. Staging Deployment Runbook (When Authorized)

When Milestone C/D authorization is granted by the user:

### Step 1: Pre-Flight Resource Check
```bash
# Connect to staging VM (never hardcode keys)
ssh azureuser@<staging-vm-ip>

# Check free disk and memory (Pre-condition: >15GB disk, >4GB RAM free)
df -h /
free -m
docker info | grep -E "Architecture|Cgroup"
```

### Step 2: Build Native ARM64 Images Sequentially
```bash
cd /opt/testforge/deploy/judge0

# 1. Build compiler image (do not run concurrently with worker build)
docker build -t testforge/judge0-compilers:arm64 -f docker/Dockerfile.compilers-arm64 .

# 2. Build custom Judge0 ARM64 image with Phase 5.1C-13 patches
docker build -t testforge/judge0-arm64:v1.13.1 -f docker/Dockerfile.judge0-arm64 .
```

### Step 3: Verify Isolate Binary & Setuid Permissions
```bash
# Verify isolate binary is 4755 root-owned inside container
docker run --rm testforge/judge0-arm64:v1.13.1 ls -la /usr/local/bin/isolate
# Expected: -rwsr-xr-x 1 root root ... /usr/local/bin/isolate
```

### Step 4: Launch Service Stack via Docker Compose
```bash
# Ensure strict file permissions on judge0.conf
chmod 0600 /opt/testforge/deploy/judge0/judge0.conf

# Start infrastructure
docker compose up -d

# Verify container health
docker compose ps
docker compose logs caddy
docker compose logs worker
```

---

## 5. Rollback & Disaster Recovery Procedure

If a deployment fails, kernel panic occurs, or containers fail to stabilize:

1. **Service Teardown:**
   ```bash
   docker compose down -v
   ```
2. **Snapshot Restoration:**
   If the VM filesystem or cgroup mounts become corrupted, restore the VM from the verified Azure snapshot:
   * Snapshot Name: `testforge-before-cgroup-change`
   * Restore target: Swap OS disk of `testforge-judge0-staging`.
3. **Fail-Closed Application Safety:**
   The TestForge backend automatically marks execution jobs as `internal_error` if the staging runner becomes unreachable, ensuring no corrupted marks are awarded to students.
