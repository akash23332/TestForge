import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 5.1C-4: ARM64 Build Pipeline Hardening Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const buildArm64Path = path.join(rootDir, 'deploy/judge0/build-arm64.sh');
  const compilersDockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.compilers-arm64');
  const judge0DockerfilePath = path.join(rootDir, 'deploy/judge0/docker/Dockerfile.judge0-arm64');
  const verifyBinariesPath = path.join(rootDir, 'deploy/judge0/verify-arm64-binaries.sh');
  const verifyCgroupsPath = path.join(rootDir, 'deploy/judge0/verify-cgroups-isolate.sh');
  const deployRunnerPath = path.join(rootDir, 'deploy/judge0/deploy-runner.sh');
  const envExamplePath = path.join(rootDir, 'deploy/judge0/.env.example');
  const dockerComposePath = path.join(rootDir, 'deploy/judge0/docker-compose.yml');

  let buildArm64Content;
  let compilersDockerfileContent;
  let judge0DockerfileContent;
  let verifyBinariesContent;
  let verifyCgroupsContent;
  let deployRunnerContent;
  let envExampleContent;
  let dockerComposeContent;

  beforeAll(() => {
    buildArm64Content = fs.readFileSync(buildArm64Path, 'utf8');
    compilersDockerfileContent = fs.readFileSync(compilersDockerfilePath, 'utf8');
    judge0DockerfileContent = fs.readFileSync(judge0DockerfilePath, 'utf8');
    verifyBinariesContent = fs.readFileSync(verifyBinariesPath, 'utf8');
    verifyCgroupsContent = fs.readFileSync(verifyCgroupsPath, 'utf8');
    deployRunnerContent = fs.readFileSync(deployRunnerPath, 'utf8');
    envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
  });

  describe('B-03: Enforce Native ARM64 Only in build-arm64.sh', () => {
    test('strictly requires aarch64 or arm64 host architecture and exits 1 on mismatch', () => {
      expect(buildArm64Content).toMatch(/if \[ "\$HOST_ARCH" != "aarch64" \] && \[ "\$HOST_ARCH" != "arm64" \]; then/);
      expect(buildArm64Content).toMatch(/\[FATAL\] Native ARM64 build requires an aarch64\/arm64 host/);
      expect(buildArm64Content).toMatch(/exit 1/);
    });

    test('has removed QEMU cross-compilation continuation path', () => {
      expect(buildArm64Content).not.toMatch(/Cross-compiling via Docker Buildx \/ QEMU will be used/);
      expect(buildArm64Content).toMatch(/Cross-compilation via QEMU or binfmt emulation is strictly prohibited/);
    });

    test('validates Docker daemon architecture is aarch64 or arm64 and fails closed', () => {
      expect(buildArm64Content).toMatch(/DOCKER_SERVER_ARCH=\$\(docker version --format/);
      expect(buildArm64Content).toMatch(/if \[ "\$DOCKER_SERVER_ARCH" != "aarch64" \] && \[ "\$DOCKER_SERVER_ARCH" != "arm64" \]; then/);
      expect(buildArm64Content).toMatch(/Refusing to build ARM64 images under a non-native Docker engine/);
    });

    test('inspects Buildx configuration for native linux/arm64 builder support', () => {
      expect(buildArm64Content).toMatch(/docker buildx inspect/);
      expect(buildArm64Content).toMatch(/Current Docker Buildx builder does not (support|list native) linux\/arm64/);
    });
  });

  describe('B-04: Image Tag Consistency Across Deployment Stack', () => {
    const COMPILERS_IMAGE = 'testforge/compilers:v1.4.0-arm64';
    const JUDGE0_ARM64_IMAGE = 'testforge/judge0:v1.13.1-arm64';

    test('build-arm64.sh builds the standardized compiler and judge0 image tags', () => {
      expect(buildArm64Content).toContain(`-t "${COMPILERS_IMAGE}"`);
      expect(buildArm64Content).toContain(`-t "${JUDGE0_ARM64_IMAGE}"`);
    });

    test('Dockerfile.judge0-arm64 builds FROM standardized compilers image', () => {
      expect(judge0DockerfileContent).toMatch(new RegExp(`FROM ${COMPILERS_IMAGE.replace(/\./g, '\\.')} AS production`));
    });

    test('deploy-runner.sh sets DEFAULT_ARM64_IMAGE to standardized tag', () => {
      expect(deployRunnerContent).toMatch(new RegExp(`DEFAULT_ARM64_IMAGE="${JUDGE0_ARM64_IMAGE.replace(/\./g, '\\.')}"`));
    });

    test('verify-arm64-binaries.sh defaults to standardized judge0 ARM64 tag', () => {
      expect(verifyBinariesContent).toContain(`IMAGE_NAME="\${1:-${JUDGE0_ARM64_IMAGE}}"`);
    });

    test('.env.example references standardized judge0 ARM64 tag', () => {
      expect(envExampleContent).toMatch(new RegExp(`# JUDGE0_IMAGE=${JUDGE0_ARM64_IMAGE.replace(/\./g, '\\.')}`));
    });

    test('docker-compose.yml enforces fail-closed required JUDGE0_IMAGE variable pattern', () => {
      expect(dockerComposeContent).toMatch(/image:\s*["']?\$\{JUDGE0_IMAGE:\?FATAL: JUDGE0_IMAGE must be set in \.env/);
    });
  });

  describe('B-05: Fail-Closed Binary Verification in verify-arm64-binaries.sh', () => {
    test('uses empty entrypoint override (--entrypoint "") to bypass Rails entrypoint interference', () => {
      expect(verifyBinariesContent).toMatch(/--entrypoint "" "\$IMAGE_NAME"/);
    });

    test('checks exit status and validity for GCC, Java, Node, and Python runtimes', () => {
      expect(verifyBinariesContent).toMatch(/if GCC_VER=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" gcc --version/);
      expect(verifyBinariesContent).toMatch(/if JAVA_VER=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" javac -version/);
      expect(verifyBinariesContent).toMatch(/if NODE_VER=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" node -v/);
      expect(verifyBinariesContent).toMatch(/if PYTHON_VER=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" python3 --version/);
    });

    test('checks Ruby version and legacy OpenSSL 1.1.1 linkage', () => {
      expect(verifyBinariesContent).toMatch(/if RUBY_VER=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" \/usr\/local\/ruby-2\.7\.0\/bin\/ruby -v/);
      expect(verifyBinariesContent).toMatch(/if OPENSSL_LINK=\$\(docker run --rm --entrypoint "" "\$IMAGE_NAME" \/usr\/local\/ruby-2\.7\.0\/bin\/ruby -ropenssl/);
    });

    test('never passes unconditionally when a version command fails', () => {
      expect(verifyBinariesContent).not.toMatch(/GCC_VER=.*\|\|\s*echo "ERROR"\s*pass "GCC version: \$GCC_VER"/);
      expect(verifyBinariesContent).not.toMatch(/JAVA_VER=.*\|\|\s*echo "ERROR"\s*pass "Java compiler version: \$JAVA_VER"/);
    });

    test('verifies sanity compilation output for C++ and Java with exact string matches', () => {
      expect(verifyBinariesContent).toMatch(/\[ "\$CPP_TEST" = "TESTFORGE_CPP_OK" \]/);
      expect(verifyBinariesContent).toMatch(/\[ "\$JAVA_TEST" = "TESTFORGE_JAVA_OK" \]/);
      expect(verifyBinariesContent).toMatch(/\[ "\$JS_TEST" = "TESTFORGE_JS_OK" \]/);
      expect(verifyBinariesContent).toMatch(/\[ "\$PY_TEST" = "TESTFORGE_PY_OK" \]/);
    });

    test('exits with code 1 if FAILED is nonzero', () => {
      expect(verifyBinariesContent).toMatch(/if \[ "\$FAILED" -eq 0 \]; then\s+echo " VERDICT: ALL ARM64 BINARY CHECKS PASSED \[SUCCESS\]"\s+exit 0\s+else\s+echo " VERDICT: ARM64 BINARY VERIFICATION FAILED \[FAIL-CLOSED\]"\s+exit 1/);
    });
  });

  describe('B-06: Restrict Privilege Escalation in Dockerfile.judge0-arm64', () => {
    test('replaces unrestricted NOPASSWD: ALL with narrow sudoers rules and service wrapper', () => {
      expect(judge0DockerfileContent).not.toMatch(/judge0 ALL=\(ALL\) NOPASSWD: ALL/);
      expect(judge0DockerfileContent).toMatch(/judge0 ALL=\(ALL\) NOPASSWD: \/usr\/local\/bin\/start-cron-daemon, \/usr\/local\/bin\/isolate-wrapper(, \/usr\/local\/bin\/isolate)?, \/usr\/sbin\/service cron start, \/etc\/init\.d\/cron start/);
    });

    test('enforces strict permissions (0440) on /etc/sudoers.d/judge0', () => {
      expect(judge0DockerfileContent).toMatch(/chmod 0440 \/etc\/sudoers\.d\/judge0/);
    });

    test('preserves privileged: false on judge0-server and privileged: true on judge0-workers', () => {
      const serverMatch = dockerComposeContent.match(/\n  judge0-server:[\s\S]*?(?=\n  judge0-workers:)/);
      expect(serverMatch[0]).toMatch(/privileged:\s*false/);

      const workerMatch = dockerComposeContent.match(/\n  judge0-workers:[\s\S]*?(?=\n  judge0-db:)/);
      expect(workerMatch[0]).toMatch(/privileged:\s*true/);
    });
  });

  describe('B-07: Remove Hidden Failures and Pin Artifact Checksums', () => {
    test('removes aglio with suppressed errors from Dockerfile.judge0-arm64', () => {
      expect(judge0DockerfileContent).not.toMatch(/aglio.*2>\/dev\/null\s*\|\|\s*true/);
    });

    test('copies Judge0 source tree cleanly without error suppression', () => {
      expect(judge0DockerfileContent).not.toMatch(/cp.*\/tmp\/judge0-src\/\.\*.*2>\/dev\/null\s*\|\|\s*true/);
      expect(judge0DockerfileContent).toMatch(/cp -a \/tmp\/judge0-src\/\. \/api\//);
    });

    test('validates SHA-256 checksum for OpenSSL 1.1.1w download', () => {
      expect(compilersDockerfileContent).toMatch(/cf3098950cb4d853ad95c0841f1f9c6d3dc102dccfcacd521d93925208b76ac8\s+openssl\.tar\.gz/);
      expect(compilersDockerfileContent).toMatch(/sha256sum -c -/);
    });

    test('validates SHA-256 checksum for Ruby 2.7.8 download', () => {
      expect(compilersDockerfileContent).toMatch(/c2dab63cbc8f2a05526108ad419efa63a67ed4074dbbcf9fc2b1ca664cb45ba0\s+ruby\.tar\.gz/);
      expect(compilersDockerfileContent).toMatch(/sha256sum -c -/);
    });

    test('removes || true from isolate cleanup verification in verify-cgroups-isolate.sh', () => {
      expect(verifyCgroupsContent).toMatch(/CLEAN_OUT=\$\(docker compose exec -T judge0-workers isolate --cleanup --box-id=\$BOX_ID --cg 2>&1\)/);
      expect(verifyCgroupsContent).toMatch(/CLEAN_EXIT=\$\?/);
      expect(verifyCgroupsContent).not.toMatch(/isolate --cleanup --box-id=\$BOX_ID.*\|\|\s*true/);
    });
  });

  describe('B-09: Judge0 Language Compatibility & Paths', () => {
    test('configures C++ ID 54 symlinks (/usr/local/gcc-9.2.0/bin/gcc and g++)', () => {
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/gcc \/usr\/local\/gcc-9\.2\.0\/bin\/gcc/);
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/g\+\+ \/usr\/local\/gcc-9\.2\.0\/bin\/g\+\+/);
    });

    test('configures Java ID 62 symlinks (/usr/local/openjdk-13/bin/javac and java)', () => {
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/javac \/usr\/local\/openjdk-13\/bin\/javac/);
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/java \/usr\/local\/openjdk-13\/bin\/java/);
    });

    test('configures JavaScript ID 63 symlink (/usr/local/node-12.14.0/bin/node)', () => {
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/node \/usr\/local\/node-12\.14\.0\/bin\/node/);
    });

    test('configures Python ID 71 symlinks (/usr/local/python-3.8.1/bin/python3 and python)', () => {
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/python3 \/usr\/local\/python-3\.8\.1\/bin\/python3/);
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/python3 \/usr\/local\/python-3\.8\.1\/bin\/python/);
      expect(compilersDockerfileContent).toMatch(/ln -sf \/usr\/bin\/python3 \/usr\/bin\/python/);
    });

    test('ensures Isolate configuration mounts /usr/local directory', () => {
      expect(compilersDockerfileContent).toMatch(/echo "dir \/usr\/local" >> \/usr\/local\/etc\/isolate/);
    });
  });
});
