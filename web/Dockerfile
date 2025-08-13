# syntax=docker/dockerfile:1

# Install deps and build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Production runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy only runtime artifacts
COPY --from=deps /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=deps /app/.next ./.next
COPY --from=deps /app/public ./public
COPY --from=deps /app/next.config.ts ./next.config.ts
COPY --from=deps /app/src ./src

USER app
EXPOSE 3000
CMD ["npm","run","start"]
