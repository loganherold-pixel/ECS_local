FROM node:22-alpine

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

RUN cd apps/web && npm ci --audit=false --fund=false

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

WORKDIR /workspace/apps/web

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
