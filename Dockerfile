FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LICENSE_EXPIRY=2026-08-27
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Install Node.js and system dependencies
RUN apt-get update && \
    apt-get install -y curl gnupg wget ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Set working directory
WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies and Playwright browsers
RUN npm ci --only=production && \
    npx playwright install --with-deps 

# Copy application files
COPY . .

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1

# Start the application (running as root)
CMD ["node", "server.js"]