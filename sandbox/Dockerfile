# ==============================================================================
# TestForge Hardened Multi-Language Code Execution Sandbox
# Supports: Node.js 20, Python 3.11, OpenJDK 17, GCC/G++ 12+ (C++20)
# ==============================================================================

FROM node:20-bookworm-slim

# Prevent interactive prompts during apt installation
ENV DEBIAN_FRONTEND=noninteractive

# Install core language toolchains and security utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-minimal \
    openjdk-17-jdk-headless \
    g++ \
    gcc \
    libc6-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged sandbox execution user (UID/GID 10001)
RUN groupadd -g 10001 sandbox && \
    useradd -u 10001 -g sandbox -m -s /bin/bash sandbox

# Set working directory for the sandbox daemon
WORKDIR /app

# Copy package manifests and install runtime dependencies
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy sandbox server code
COPY server.js ./

# Prepare scratch directory for ephemeral runs with correct ownership
RUN mkdir -p /tmp/testforge-sandboxes && \
    chown -R sandbox:sandbox /tmp/testforge-sandboxes && \
    chmod 700 /tmp/testforge-sandboxes && \
    chown -R sandbox:sandbox /app

# Switch to non-root execution identity
USER sandbox

# Environment configuration
ENV PORT=5050
ENV NODE_ENV=production
ENV SCRATCH_BASE=/tmp/testforge-sandboxes

# Expose internal execution port
EXPOSE 5050

# Container health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5050/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the execution daemon
CMD ["node", "server.js"]
