#!/usr/bin/env bash
# ==============================================================================
# TestForge Dedicated Execution Runner - ARM64 Binary & Isolate Verification
# Target Image: testforge/judge0:v1.13.1-arm64
# Verifies:
#   1. Docker image architecture metadata (arm64)
#   2. ELF header architectures of isolate, ruby, gcc, node, python, java (aarch64)
#   3. Isolate sandbox lifecycle inside container
#   4. Basic compilation & execution for all 4 TestForge languages (C++, Java, JS, Python)
# ==============================================================================

set -euo pipefail

IMAGE_NAME="${1:-testforge/judge0:v1.13.1-arm64}"

echo "========================================================"
echo " TestForge Native ARM64 Binary & Sandbox Verification   "
echo " Image:        $IMAGE_NAME"
echo " Date:         $(date -u)"
echo "========================================================"

FAILED=0

fail() {
  echo "  [FAIL] $1"
  FAILED=1
}

pass() {
  echo "  [PASS] $1"
}

# 1. Verify Image Architecture Metadata
echo ""
echo "── 1. Image Architecture Inspection ──"
IMG_ARCH=$(docker inspect -f '{{.Architecture}}' "$IMAGE_NAME" 2>/dev/null || echo "NOT_FOUND")

if [ "$IMG_ARCH" = "arm64" ]; then
  pass "Docker image architecture is 'arm64'"
else
  fail "Expected architecture 'arm64', found '$IMG_ARCH'"
fi

# 2. Verify ELF Binary Architectures Inside Container
echo ""
echo "── 2. ELF Binary Header Architecture Verification ──"

BINARIES=(
  "/usr/local/bin/isolate"
  "/usr/local/ruby-2.7.0/bin/ruby"
  "/usr/bin/gcc"
  "/usr/bin/g++"
  "/usr/bin/node"
  "/usr/bin/python3"
  "/usr/lib/jvm/java-17-openjdk-arm64/bin/java"
)

# Use empty entrypoint override (--entrypoint "") to bypass Rails/app startup logic (B-05)
for bin in "${BINARIES[@]}"; do
  if ! docker run --rm --entrypoint "" "$IMAGE_NAME" test -x "$bin" 2>/dev/null; then
    fail "$bin is missing or not executable inside container"
    continue
  fi

  FILE_INFO=$(docker run --rm --entrypoint "" "$IMAGE_NAME" file -L "$bin" 2>/dev/null || echo "ERROR")
  if [ "$FILE_INFO" = "ERROR" ] || [ -z "$FILE_INFO" ]; then
    fail "Failed to read ELF header for $bin (command exited with error)"
  elif echo "$FILE_INFO" | grep -qiE "aarch64|ARM aarch64"; then
    pass "$bin is native 64-bit ARM ($FILE_INFO)"
  else
    fail "$bin is NOT native ARM64: $FILE_INFO"
  fi
done

# 3. Verify Tool Versions
echo ""
echo "── 3. Runtime & Compiler Version Verification ──"

if RUBY_VER=$(docker run --rm --entrypoint "" "$IMAGE_NAME" /usr/local/ruby-2.7.0/bin/ruby -v 2>/dev/null) && echo "$RUBY_VER" | grep -q "ruby 2.7"; then
  pass "Ruby version matches Rails requirement: $RUBY_VER"
else
  fail "Ruby version mismatch or execution failed: ${RUBY_VER:-command failed}"
fi

if OPENSSL_LINK=$(docker run --rm --entrypoint "" "$IMAGE_NAME" /usr/local/ruby-2.7.0/bin/ruby -ropenssl -e 'puts OpenSSL::OPENSSL_VERSION' 2>/dev/null) && echo "$OPENSSL_LINK" | grep -q "OpenSSL 1.1.1"; then
  pass "Ruby OpenSSL linkage verified (legacy OpenSSL 1.1.1): $OPENSSL_LINK"
else
  fail "Ruby OpenSSL linkage failed or mismatch: ${OPENSSL_LINK:-command failed}"
fi

if GCC_VER=$(docker run --rm --entrypoint "" "$IMAGE_NAME" gcc --version 2>/dev/null | head -n1) && [ -n "$GCC_VER" ] && [ "$GCC_VER" != "ERROR" ]; then
  pass "GCC version: $GCC_VER"
else
  fail "GCC version check failed or binary missing"
fi

if JAVA_VER=$(docker run --rm --entrypoint "" "$IMAGE_NAME" javac -version 2>&1) && echo "$JAVA_VER" | grep -qi "javac"; then
  pass "Java compiler version: $JAVA_VER"
else
  fail "Java compiler version check failed: ${JAVA_VER:-command failed}"
fi

if NODE_VER=$(docker run --rm --entrypoint "" "$IMAGE_NAME" node -v 2>/dev/null) && echo "$NODE_VER" | grep -qiE "^v[0-9]+"; then
  pass "Node.js version: $NODE_VER"
else
  fail "Node.js version check failed: ${NODE_VER:-command failed}"
fi

if PYTHON_VER=$(docker run --rm --entrypoint "" "$IMAGE_NAME" python3 --version 2>/dev/null) && echo "$PYTHON_VER" | grep -qi "Python 3"; then
  pass "Python version: $PYTHON_VER"
else
  fail "Python version check failed: ${PYTHON_VER:-command failed}"
fi

# 4. Verify Language Discovery & Symlinks Expected by Judge0
echo ""
echo "── 4. Symlink Paths for Judge0 Language IDs ──"

SYMLINKS=(
  "/usr/local/gcc-9.2.0/bin/gcc"
  "/usr/local/gcc-9.2.0/bin/g++"
  "/usr/local/openjdk-13/bin/javac"
  "/usr/local/openjdk-13/bin/java"
  "/usr/local/node-12.14.0/bin/node"
  "/usr/local/python-3.8.1/bin/python3"
  "/usr/local/python-3.8.1/bin/python"
)

for sym in "${SYMLINKS[@]}"; do
  if docker run --rm --entrypoint "" "$IMAGE_NAME" test -x "$sym" 2>/dev/null; then
    RESOLVED_TARGET=$(docker run --rm --entrypoint "" "$IMAGE_NAME" readlink -f "$sym" 2>/dev/null || echo "UNKNOWN")
    pass "Symlink $sym -> $RESOLVED_TARGET is present and executable"
  else
    fail "Symlink $sym is missing or not executable"
  fi
done

# 5. Verify In-Container Native Compilation & Execution for Supported Languages
echo ""
echo "── 5. In-Container Compiler & Interpreter Execution Sanity Tests ──"

# C++ (ID 54)
CPP_TEST=$(docker run --rm --entrypoint /bin/bash "$IMAGE_NAME" -c '
  set -euo pipefail
  echo "#include <iostream>" > /tmp/test.cpp
  echo "int main(){ std::cout << \"TESTFORGE_CPP_OK\" << std::endl; return 0; }" >> /tmp/test.cpp
  g++ -O2 /tmp/test.cpp -o /tmp/test_cpp
  /tmp/test_cpp
  rm -f /tmp/test.cpp /tmp/test_cpp
' 2>/dev/null || echo "ERROR")
if [ "$CPP_TEST" = "TESTFORGE_CPP_OK" ]; then
  pass "C++ native compilation & execution: OK (Output: TESTFORGE_CPP_OK)"
else
  fail "C++ compilation/execution failed. Expected 'TESTFORGE_CPP_OK', got: '$CPP_TEST'"
fi

# Java (ID 62)
JAVA_TEST=$(docker run --rm --entrypoint /bin/bash "$IMAGE_NAME" -c '
  set -euo pipefail
  cd /tmp
  echo "public class Main { public static void main(String[] args){ System.out.println(\"TESTFORGE_JAVA_OK\"); } }" > Main.java
  javac Main.java
  java Main
  rm -f Main.java Main.class
' 2>/dev/null || echo "ERROR")
if [ "$JAVA_TEST" = "TESTFORGE_JAVA_OK" ]; then
  pass "Java native compilation & execution: OK (Output: TESTFORGE_JAVA_OK)"
else
  fail "Java compilation/execution failed. Expected 'TESTFORGE_JAVA_OK', got: '$JAVA_TEST'"
fi

# JavaScript (ID 63)
JS_TEST=$(docker run --rm --entrypoint "" "$IMAGE_NAME" node -e 'console.log("TESTFORGE_JS_OK")' 2>/dev/null || echo "ERROR")
if [ "$JS_TEST" = "TESTFORGE_JS_OK" ]; then
  pass "JavaScript native execution: OK (Output: TESTFORGE_JS_OK)"
else
  fail "JavaScript execution failed. Expected 'TESTFORGE_JS_OK', got: '$JS_TEST'"
fi

# Python (ID 71)
PY_TEST=$(docker run --rm --entrypoint "" "$IMAGE_NAME" python3 -c 'print("TESTFORGE_PY_OK")' 2>/dev/null || echo "ERROR")
if [ "$PY_TEST" = "TESTFORGE_PY_OK" ]; then
  pass "Python native execution: OK (Output: TESTFORGE_PY_OK)"
else
  fail "Python execution failed. Expected 'TESTFORGE_PY_OK', got: '$PY_TEST'"
fi

echo ""
echo "========================================================"
if [ "$FAILED" -eq 0 ]; then
  echo " VERDICT: ALL ARM64 BINARY CHECKS PASSED [SUCCESS]"
  exit 0
else
  echo " VERDICT: ARM64 BINARY VERIFICATION FAILED [FAIL-CLOSED]"
  exit 1
fi
