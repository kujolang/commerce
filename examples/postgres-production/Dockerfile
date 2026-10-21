FROM node:24-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66

# Upgrade the runtime independently of the immutable base image.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
      amd64) node_arch=x64; node_sha=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce ;; \
      arm64) node_arch=arm64; node_sha=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b ;; \
      *) echo "Unsupported Node architecture: $arch" >&2; exit 1 ;; \
    esac \
    && curl --proto "=https" --tlsv1.2 -fsSL "https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-$node_arch.tar.xz" -o /tmp/node.tar.xz \
    && echo "$node_sha  /tmp/node.tar.xz" | sha256sum -c - \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/include/node \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
    && test "$(node --version)" = "v22.23.4" \
    && rm -f /tmp/node.tar.xz \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save pg@8
COPY adapters ./adapters
COPY src ./src
COPY runtime ./runtime
COPY browser ./browser
COPY schemas ./schemas
COPY examples/postgres-production ./examples/postgres-production
USER node
CMD ["node","examples/postgres-production/receiver.mjs"]
