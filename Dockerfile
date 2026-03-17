FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY themes/ ./themes/

RUN mkdir -p favicon-cache

EXPOSE 2525

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2525/ || exit 1

USER node

CMD ["node", "src/server/index.js"]
