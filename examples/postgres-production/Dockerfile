FROM node:20-alpine
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
