FROM node:22-alpine AS builder

# CACHE_BUST=2026-05-30-audit-deploy

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

# Flat node_modules (no symlinks) for Docker compatibility
RUN echo "node-linker=hoisted" > .npmrc

COPY pnpm-workspace.yaml tsconfig.base.json package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY apps/api/package.json apps/api/tsconfig.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/shared/src packages/shared/src
COPY packages/db/prisma packages/db/prisma
COPY packages/db/src packages/db/src
COPY packages/core/src packages/core/src
COPY apps/api/src apps/api/src

RUN pnpm --filter "@wcore/shared" build
RUN pnpm --filter "@wcore/db" db:generate
RUN rm -rf packages/core/dist && pnpm --filter "@wcore/core" build
RUN rm -rf apps/api/dist && pnpm --filter "@wcore/api" build

# Fix workspace package.json to point to compiled dist (not TS source)
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('packages/shared/package.json','utf8')); p.main='./dist/index.js'; p.exports={'.':'./dist/index.js'}; fs.writeFileSync('packages/shared/package.json',JSON.stringify(p,null,2))"
RUN node -e "const fs=require('fs');const path=require('path');function fix(f){const files=fs.readdirSync(f,{recursive:true}).filter(x=>x.endsWith('.js')).map(x=>path.join(f,x));for(const file of files){let c=fs.readFileSync(file,'utf8');const before=c;c=c.replace(/from\s+\"\.\/([\w\/-]+)(?<!\.js)\"/g,'from \"./\$1.js\"');if(c!==before)fs.writeFileSync(file,c)}} fix('packages/shared/dist'); fix('packages/core/dist')"
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('packages/core/package.json','utf8')); p.main='./dist/index.js'; p.exports={'.':'./dist/index.js'}; fs.writeFileSync('packages/core/package.json',JSON.stringify(p,null,2))"
RUN mkdir -p packages/db/dist && echo 'export { PrismaClient, Prisma } from "@prisma/client";' > packages/db/dist/index.js
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('packages/db/package.json','utf8')); p.main='./dist/index.js'; fs.writeFileSync('packages/db/package.json',JSON.stringify(p,null,2))"

FROM node:22-alpine AS runner

WORKDIR /app
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=4000
ENV HOST=0.0.0.0

# Copy everything: flat node_modules (hoisted, no symlinks), dist, prisma
COPY --chown=node:node --from=builder /app/package.json /app/package.json
# Root package.json must have "type": "module" for ESM imports
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('/app/package.json','utf8')); p.type='module'; fs.writeFileSync('/app/package.json',JSON.stringify(p,null,2))"
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
# Workspace packages (symlinks resolve to these)
COPY --chown=node:node --from=builder /app/packages/shared ./packages/shared
COPY --chown=node:node --from=builder /app/packages/core ./packages/core
COPY --chown=node:node --from=builder /app/packages/db ./packages/db
# Ensure @wcore symlinks work — create them manually if needed
RUN mkdir -p node_modules/@wcore && \
    test -L node_modules/@wcore/shared || ln -sf ../../packages/shared node_modules/@wcore/shared && \
    test -L node_modules/@wcore/core || ln -sf ../../packages/core node_modules/@wcore/core && \
    test -L node_modules/@wcore/db || ln -sf ../../packages/db node_modules/@wcore/db
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --chown=node:node --from=builder /app/packages/core/dist ./packages/core/dist
COPY --chown=node:node --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --chown=node:node --from=builder /app/packages/db/dist ./packages/db/dist
COPY --chown=node:node --from=builder /app/packages/db/prisma ./prisma
COPY --chown=node:node apps/api/start-production.sh ./start-production.sh
RUN chmod +x ./start-production.sh

# Run as non-root (node:alpine ships an unprivileged `node` user, uid 1000).
USER node

EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health',r=>{process.exit(r.statusCode===200?0:1)})"

# Apply reviewed Prisma migrations on startup. If the existing Railway DB was
# created before migration history existed, baseline once; never use db push.
CMD ["./start-production.sh"]
