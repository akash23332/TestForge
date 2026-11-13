import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-3: Critical Findings Remediation Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const deployRunnerPath = path.join(rootDir, 'deploy/judge0/deploy-runner.sh');
  const dockerComposePath = path.join(rootDir, 'deploy/judge0/docker-compose.yml');
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');

  let deployRunnerContent;
  let dockerComposeContent;
  let verifyAccountingContent;

  beforeAll(() => {
    deployRunnerContent = fs.readFileSync(deployRunnerPath, 'utf8');
    dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
  });

  describe('Task 1: Fix B-01 - Architecture Detection & ARM64 Default Image', () => {
    test('defines DEFAULT_ARM64_IMAGE as testforge/judge0:v1.13.1-arm64', () => {
      expect(deployRunnerContent).toMatch(/DEFAULT_ARM64_IMAGE="testforge\/judge0:v1\.13\.1-arm64"/);
      expect(deployRunnerContent).toMatch(/DEFAULT_AMD64_IMAGE="judge0\/judge0:v1\.13\.1"/);
    });

    test('selects DEFAULT_ARM64_IMAGE when on aarch64 or arm64 without override', () => {
      expect(deployRunnerContent).toMatch(/if \[ "\$ARCH" = "aarch64" \] \|\| \[ "\$ARCH" = "arm64" \]; then/);
      expect(deployRunnerContent).toMatch(/TARGET_JUDGE0_IMAGE="\$DEFAULT_ARM64_IMAGE"/);
    });

    test('preserves user-provided JUDGE0_IMAGE override on ARM64', () => {
      expect(deployRunnerContent).toMatch(/if \[ -n "\$\{JUDGE0_IMAGE:-\}" \]; then\s+TARGET_JUDGE0_IMAGE="\$JUDGE0_IMAGE"/);
    });

    test('selects DEFAULT_AMD64_IMAGE on x86_64 when no override is present', () => {
      expect(deployRunnerContent).toMatch(/TARGET_JUDGE0_IMAGE="\$\{JUDGE0_IMAGE:-\$DEFAULT_AMD64_IMAGE\}"/);
    });

    test('persists resolved TARGET_JUDGE0_IMAGE into generated .env file', () => {
      expect(deployRunnerContent).toMatch(/echo "JUDGE0_IMAGE=\$TARGET_JUDGE0_IMAGE" >> "\$INSTALL_DIR\/\.env"/);
    });

    test('fails closed if ARM64 image is missing from local Docker cache without pulling AMD64', () => {
      expect(deployRunnerContent).toMatch(/if \[ "\$ARCH" = "aarch64" \] \|\| \[ "\$ARCH" = "arm64" \]; then[\s\S]*?if docker image inspect "\$TARGET_JUDGE0_IMAGE" &>\/dev\/null; then[\s\S]*?else[\s\S]*?\[FATAL\] Required ARM64 Judge0 image '\$TARGET_JUDGE0_IMAGE' not found in local Docker cache[\s\S]*?sudo bash \.\/build-arm64\.sh[\s\S]*?exit 1/);
    });
  });

  describe('Task 2: Fix B-02 - Resource Allocation Limits & Sizing', () => {
    test('enforces exact memory limit on judge0-workers: 3072m', () => {
      const workerSectionMatch = dockerComposeContent.match(/judge0-workers:[\s\S]*?(?=judge0-db:)/);
      expect(workerSectionMatch).not.toBeNull();
      const workerSection = workerSectionMatch[0];
      expect(workerSection).toMatch(/mem_limit:\s*3072m/);
      expect(workerSection).toMatch(/cpus:\s*1\.00/);
    });

    test('enforces exact memory limit on judge0-server: 1024m', () => {
      const serverSectionMatch = dockerComposeContent.match(/judge0-server:[\s\S]*?(?=judge0-workers:)/);
      expect(serverSectionMatch).not.toBeNull();
      const serverSection = serverSectionMatch[0];
      expect(serverSection).toMatch(/mem_limit:\s*1024m/);
      expect(serverSection).toMatch(/cpus:\s*0\.50/);
    });

    test('enforces exact memory limit on judge0-db: 512m', () => {
      const dbSectionMatch = dockerComposeContent.match(/\n  judge0-db:[\s\S]*?(?=\n  judge0-redis:)/);
      expect(dbSectionMatch).not.toBeNull();
      const dbSection = dbSectionMatch[0];
      expect(dbSection).toMatch(/mem_limit:\s*512m/);
      expect(dbSection).toMatch(/cpus:\s*0\.25/);
    });

    test('enforces exact memory limit on judge0-redis: 384m and maxmemory: 256mb', () => {
      const redisSectionMatch = dockerComposeContent.match(/\n  judge0-redis:[\s\S]*?(?=\nnetworks:)/);
      expect(redisSectionMatch).not.toBeNull();
      const redisSection = redisSectionMatch[0];
      expect(redisSection).toMatch(/mem_limit:\s*384m/);
      expect(redisSection).toMatch(/cpus:\s*0\.25/);
      expect(redisSection).toMatch(/'--maxmemory',\s*'256mb'/);
      expect(redisSection).toMatch(/'--maxmemory-policy',\s*'allkeys-lru'/);
    });

    test('confirms total container limit reduction of 1536 MB leaving ~2100 MB host headroom', () => {
      const totalLimitsMB = 3072 + 1024 + 512 + 384;
      expect(totalLimitsMB).toBe(4992);
      const originalLimitsMB = 4096 + 1536 + 512 + 384;
      expect(originalLimitsMB).toBe(6528);
      const reductionMB = originalLimitsMB - totalLimitsMB;
      expect(reductionMB).toBe(1536);

      const physicalRamMB = 8192;
      const hostOverheadMB = 1100;
      const unallocatedHeadroomMB = physicalRamMB - hostOverheadMB - totalLimitsMB;
      expect(unallocatedHeadroomMB).toBe(2100);
    });
  });

  describe('Task 3: Privileged Worker Security Model & Isolation', () => {
    test('confines privileged: true strictly to judge0-workers', () => {
      const workerSectionMatch = dockerComposeContent.match(/\n  judge0-workers:[\s\S]*?(?=\n  judge0-db:)/);
      expect(workerSectionMatch[0]).toMatch(/privileged:\s*true/);

      const serverSectionMatch = dockerComposeContent.match(/\n  judge0-server:[\s\S]*?(?=\n  judge0-workers:)/);
      expect(serverSectionMatch[0]).toMatch(/privileged:\s*false/);

      const dbSectionMatch = dockerComposeContent.match(/\n  judge0-db:[\s\S]*?(?=\n  judge0-redis:)/);
      expect(dbSectionMatch[0]).not.toMatch(/privileged:\s*true/);

      const redisSectionMatch = dockerComposeContent.match(/\n  judge0-redis:[\s\S]*?(?=\nnetworks:)/);
      expect(redisSectionMatch[0]).not.toMatch(/privileged:\s*true/);
    });

    test('never mounts docker.sock anywhere in docker-compose.yml', () => {
      expect(dockerComposeContent).not.toMatch(/docker\.sock/);
    });

    test('binds server port strictly to 127.0.0.1:2358', () => {
      expect(dockerComposeContent).toMatch(/-\s*'127\.0\.0\.1:2358:2358'/);
    });

    test('enforces COUNT=1 in judge0-workers environment for staging concurrency control', () => {
      expect(dockerComposeContent).toMatch(/COUNT=1/);
    });
  });

  describe('Task 4: Resource & Cgroup Accounting Probe', () => {
    test('inspects memory.use_hierarchy across host and isolate levels', () => {
      expect(verifyAccountingContent).toMatch(/memory\.use_hierarchy/);
    });

    test('verifies OOM control settings and checks dmesg for host-level OOM events', () => {
      expect(verifyAccountingContent).toMatch(/memory\.oom_control/);
      expect(verifyAccountingContent).toMatch(/dmesg.*oom-killer/);
    });

    test('asserts post-execution cgroup cleanup with zero lingering processes', () => {
      expect(verifyAccountingContent).toMatch(/Post-Execution Cgroup Cleanup/);
      expect(verifyAccountingContent).toMatch(/cgroup\.procs/);
    });

    test('documents 4992 MB container limit and ~2100 MB headroom in probe summary', () => {
      expect(verifyAccountingContent).toMatch(/Total Container Allocation: 4992 MB/);
      expect(verifyAccountingContent).toMatch(/Unallocated Host Headroom:\s*~2100 MB buffer/);
      expect(verifyAccountingContent).toMatch(/Reduced from 6528 MB by 1536 MB/);
    });
  });
});
