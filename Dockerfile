# ==============================================================================
# Oracle AI Database Private Agent Factory - Production Container
# ==============================================================================
# Designed for deployment on Google Cloud Run & Google Kubernetes Engine (GKE)
# Multi-stage security-hardened container with Oracle Instant Client support.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Dependencies
# ------------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools and libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ENV npm_config_registry=https://registry.npmjs.org/

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev --registry=https://registry.npmjs.org/

# ------------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies for Oracle Instant Client (libaio1) and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libaio1 \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set standard environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    TNS_ADMIN=/secrets/oracle-wallet \
    GOOGLE_CLOUD_LOCATION=us-central1

# Create non-root application user for container runtime security
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/bash -m appuser

# Copy production node_modules from builder
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy application source code
COPY --chown=appuser:appgroup . .

# Ensure secure directories for wallet extraction and runtime cache
RUN mkdir -p /secrets/oracle-wallet /app/.oracle_wallet && \
    chown -R appuser:appgroup /secrets/oracle-wallet /app/.oracle_wallet /app

# Switch to non-root user
USER appuser

# Expose HTTP port
EXPOSE 8080

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

# Start Private Agent Factory Server
CMD ["node", "app.js"]
