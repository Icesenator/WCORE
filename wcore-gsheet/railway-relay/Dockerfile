FROM node:22-alpine

WORKDIR /app

COPY wcore-gsheet/railway-relay/package*.json ./
RUN npm ci --omit=dev

COPY wcore-gsheet/railway-relay/server.js ./

ENV NODE_ENV=production
# Unprivileged user shipped with the official image: the relay needs no root right.
USER node
CMD ["node", "server.js"]
