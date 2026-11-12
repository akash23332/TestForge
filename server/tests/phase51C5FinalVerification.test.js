import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-5: Final Build and Isolate Verification Corrections Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const compilersDockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.compilers-arm64');
  const judge0DockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');
  const verifyCgroupsPath = path.join(rootDir, 'deploy/judge0/verify-cgroups-isolate.sh');
  const verifyBinariesPath = path.join(rootDir, 'deploy/judge0/verify-arm64-binaries.sh');
  const verifyAccountingPath = path.join(rootDir, 'deploy/judge0/verify-resource-accounting.sh');
  const deployRunnerPath = path.join(rootDir, 'deploy/judge0/deploy-runner.sh');
  const dockerComposePath = path.join(rootDir, 'deploy/judge0/docker-compose.yml');
  const buildArm64Path = path.join(rootDir, 'deploy/judge0/build-arm64.sh');

  let compilersDockerfile;
  let judge0Dockerfile;
  let verifyCgroupsContent;
  let verifyBinariesContent;
  let verifyAccountingContent;
  let deployRunnerContent;
  let dockerComposeContent;
  let buildArm64Content;

  beforeAll(() => {
    compilersDockerfile = fs.readFileSync(compilersDockerfilePath, 'utf8');
    judge0Dockerfile = fs.readFileSync(judge0DockerfilePath, 'utf8');
    verifyCgroupsContent = fs.readFileSync(verifyCgroupsPath, 'utf8');
    verifyBinariesContent = fs.readFileSync(verifyBinariesPath, 'utf8');
    verifyAccountingContent = fs.readFileSync(verifyAccountingPath, 'utf8');
    deployRunnerContent = fs.readFileSync(deployRunnerPath, 'utf8');
    dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
    buildArm64Content = fs.readFileSync(buildArm64Path, 'utf8');
  });

  describe('Task 1: Fix Isolate Compilation & Installation Targets', () => {
    test('avoids documentation-generation targets (asciidoc/a2x) by compiling specific program targets', () => {
      expect(compilersDockerfile).toMatch(/make -j\$\(nproc\) isolate isolate-check-environment/);
      expect(compilersDockerfile).not.toMatch(/make -j\$\(nproc\)\s*&&\s*make install/);
    });

    test('verifies installed isolate binary (mode 4755) and isolate configuration file existence', () => {
      expect(compilersDockerfile).toMatch(/chmod 4755 \/usr\/local\/bin\/isolate/);
      expect(compilersDockerfile).toMatch(/test -x \/usr\/local\/bin\/isolate/);
      expect(compilersDockerfile).toMatch(/test -f \/usr\/local\/etc\/isolate/);
    });

    test('configures Isolate to mount /usr/local inside sandboxes', () => {
      expect(compilersDockerfile).toMatch(/echo "dir \/usr\/local" >> \/usr\/local\/etc\/isolate/);
    });
  });

  describe('Task 2: Fix Isolate Verification & Lifecycle Checks', () => {
    test('removes all cleanup error suppression (|| true) from cleanup traps and commands', () => {
      const cleanupBoxesMatch = verifyCgroupsContent.match(/cleanup_boxes\(\)\s*\{([\s\S]*?)\n\}/);
      expect(cleanupBoxesMatch).not.toBeNull();
      expect(cleanupBoxesMatch[1]).not.toMatch(/\|\|\s*true/);
      expect(verifyCgroupsContent).not.toMatch(/isolate --cleanup --box-id=\$BOX_ID.*\|\|\s*true/);
    });

    test('replaces unsupported isolate --version check with SUID binary and environment verification', () => {
      expect(verifyCgroupsContent).not.toMatch(/isolate --version/);
      expect(verifyCgroupsContent).toMatch(/test -u \/usr\/local\/bin\/isolate/);
      expect(verifyCgroupsContent).toMatch(/test -x \/usr\/local\/bin\/isolate/);
      expect(verifyCgroupsContent).toMatch(/\/usr\/local\/bin\/isolate-check-environment/);
    });

    test('validates physical sandbox directory creation and cgroup directory creation upon --init', () => {
      expect(verifyCgroupsContent).toMatch(/test -d "\/var\/local\/lib\/isolate\/\$BOX_ID\/box"/);
      expect(verifyCgroupsContent).toMatch(/test -d "\/sys\/fs\/cgroup\/memory\/isolate\/box-\$BOX_ID"/);
    });

    test('ensures initialization, execution, and cleanup failures record non-zero error states', () => {
      expect(verifyCgroupsContent).toMatch(/INIT_EXIT=\$\?/);
      expect(verifyCgroupsContent).toMatch(/RUN_EXIT=\$\?/);
      expect(verifyCgroupsContent).toMatch(/CLEAN_EXIT=\$\?/);
      expect(verifyCgroupsContent).toMatch(/fail "isolate --cleanup command failed with exit code \$CLEAN_EXIT/);
    });
  });

  describe('Task 3: Security Tests & Boundary Distinctions', () => {
    test('clearly labels direct Docker container tests as NOT Isolate sandbox tests', () => {
      expect(verifyBinariesContent).toMatch(/Direct Docker Container Compiler Sanity Tests \(NOT Isolate Sandbox Tests\)/);
    });

    test('clearly labels Isolate sandbox engine tests running inside worker container', () => {
      expect(verifyCgroupsContent).toMatch(/DIRECT ISOLATE SANDBOX ENGINE TESTS \(Inside judge0-workers Container\)/);
    });

    test('tests Isolate filesystem boundaries (read-only rootfs prevention of writes to /)', () => {
      expect(verifyCgroupsContent).toMatch(/isolate --box-id=\$BOX_ID --cg --run -- \/bin\/touch \/test_boundary_probe/);
      expect(verifyCgroupsContent).toMatch(/Isolate filesystem boundary enforced/);
    });

    test('tests Isolate network isolation (outbound socket connection blocked)', () => {
      expect(verifyCgroupsContent).toMatch(/import socket/);
      expect(verifyCgroupsContent).toMatch(/s\.connect\(\("8\.8\.8\.8", 53\)\)/);
      expect(verifyCgroupsContent).toMatch(/Isolate network isolation enforced/);
    });

    test('tests Isolate memory limits (cgroup OOM containment)', () => {
      expect(verifyCgroupsContent).toMatch(/--cg-mem=32000/);
      expect(verifyCgroupsContent).toMatch(/Isolate cgroup memory limit enforced/);
    });

    test('tests Isolate CPU timeout enforcement (runaway loop termination)', () => {
      expect(verifyCgroupsContent).toMatch(/--time=1 --wall-time=2/);
      expect(verifyCgroupsContent).toMatch(/Isolate CPU time limit enforced/);
    });
  });

  describe('Task 4: Harden Architecture Selection & Compose Gate', () => {
    test('inspects image architecture on ARM64 and fails closed on non-ARM64 image', () => {
      expect(deployRunnerContent).toMatch(/RESOLVED_IMG_ARCH=\$\(docker image inspect "\$TARGET_JUDGE0_IMAGE" --format '\{\{\.Architecture\}\}'/);
      expect(deployRunnerContent).toMatch(/if \[ "\$RESOLVED_IMG_ARCH" != "arm64" \] && \[ "\$RESOLVED_IMG_ARCH" != "aarch64" \]; then/);
      expect(deployRunnerContent).toMatch(/Refusing to deploy non-ARM64 image on an ARM64 host/);
      expect(deployRunnerContent).toMatch(/exit 1/);
    });

    test('docker-compose.yml uses fail-closed pattern requiring JUDGE0_IMAGE in .env', () => {
      expect(dockerComposeContent).toMatch(/image:\s*["']?\$\{JUDGE0_IMAGE:\?FATAL: JUDGE0_IMAGE must be set in \.env \(testforge\/judge0:v1\.13\.1-arm64 on ARM64\)\}["']?/);
    });

    test('build-arm64.sh accurately describes Buildx and binfmt verification', () => {
      expect(buildArm64Content).toMatch(/Current Docker Buildx builder does not list native linux\/arm64 in supported platforms/);
      expect(buildArm64Content).toMatch(/Host kernel has registered qemu-aarch64 in binfmt_misc/);
    });
  });

  describe('Task 5: Fix Cron Installation & Formatting', () => {
    test('does NOT pipe /etc/cron.d files into user crontab', () => {
      expect(judge0Dockerfile).not.toMatch(/cat \/etc\/cron\.d\/\* \| crontab -/);
    });

    test('enforces 0644 root:root permissions on /etc/cron.d files with trailing newlines', () => {
      expect(judge0Dockerfile).toMatch(/chown -R root:root \/etc\/cron\.d\//);
      expect(judge0Dockerfile).toMatch(/chmod 0644 \/etc\/cron\.d\/\*/);
      expect(judge0Dockerfile).toMatch(/sed -i -e '\$a\\'/);
    });
  });

  describe('Task 6: Review Sudoers & Root-Owned Service Wrapper', () => {
    test('creates root-owned start-cron-daemon script with 0755 root:root', () => {
      expect(judge0Dockerfile).toMatch(/\/usr\/local\/bin\/start-cron-daemon/);
      expect(judge0Dockerfile).toMatch(/chmod 0755 \/usr\/local\/bin\/start-cron-daemon/);
      expect(judge0Dockerfile).toMatch(/chown root:root \/usr\/local\/bin\/start-cron-daemon/);
    });

    test('restricts judge0 sudoers strictly to the wrapper and isolate with 0440 mode', () => {
      expect(judge0Dockerfile).toMatch(/judge0 ALL=\(ALL\) NOPASSWD: \/usr\/local\/bin\/start-cron-daemon, \/usr\/local\/bin\/isolate-wrapper(, \/usr\/local\/bin\/isolate)?, \/usr\/sbin\/service cron start, \/etc\/init\.d\/cron start/);
      expect(judge0Dockerfile).toMatch(/chmod 0440 \/etc\/sudoers\.d\/judge0/);
    });
  });

  describe('Task 7: Host-Level Resource Accounting & Sibling Proving', () => {
    test('proves root sibling accounting vs nested accounting in verify-resource-accounting.sh', () => {
      expect(verifyAccountingContent).toMatch(/ROOT SIBLING ACCOUNTING PROVEN/);
      expect(verifyAccountingContent).toMatch(/Docker container 'mem_limit: 3072m' DOES NOT constrain Isolate child processes/);
      expect(verifyAccountingContent).toMatch(/Sandbox memory is bounded exclusively by Isolate's internal --cg-mem limit/);
    });

    test('confirms staging concurrency policy COUNT=1 protects host headroom', () => {
      expect(verifyAccountingContent).toMatch(/Concurrency is hardcoded to COUNT=1 in staging \(max 250 MB sandbox load\)/);
      expect(verifyAccountingContent).toMatch(/Unallocated Host Headroom:\s*~2100 MB buffer/);
    });
  });

  describe('Task 8: Reproducibility & Cryptographic Checksum Pinning', () => {
    test('preserves SHA-256 checksum for OpenSSL 1.1.1w in Dockerfile.compilers-arm64', () => {
      expect(compilersDockerfile).toMatch(/cf3098950cb4d853ad95c0841f1f9c6d3dc102dccfcacd521d93925208b76ac8\s+openssl\.tar\.gz/);
    });

    test('preserves SHA-256 checksum for Ruby 2.7.8 in Dockerfile.compilers-arm64', () => {
      expect(compilersDockerfile).toMatch(/c2dab63cbc8f2a05526108ad419efa63a67ed4074dbbcf9fc2b1ca664cb45ba0\s+ruby\.tar\.gz/);
    });
  });
});
