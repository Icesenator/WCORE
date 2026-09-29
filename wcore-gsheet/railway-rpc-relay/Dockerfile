FROM node:22-alpine

WORKDIR /app

COPY wcore-gsheet/railway-rpc-relay/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY wcore-gsheet/railway-rpc-relay/server.js ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
