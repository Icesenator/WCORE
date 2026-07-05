FROM node:22-alpine
WORKDIR /app
COPY wcore-gsheet/railway-relay/package.json wcore-gsheet/railway-relay/package-lock.json ./
RUN npm ci --omit=dev
COPY wcore-gsheet/railway-relay/server.js wcore-gsheet/railway-relay/index.js ./
CMD ["node", "server.js"]
