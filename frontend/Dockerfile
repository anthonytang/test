# Production Dockerfile for Azure deployment (monorepo)
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy monorepo package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY frontend ./frontend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Accept build arguments for public environment variables
ARG NEXT_PUBLIC_BACKEND_SERVER_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_AZURE_AD_CLIENT_ID
ARG NEXT_PUBLIC_AZURE_AD_TENANT_ID
ARG NEXT_PUBLIC_AZURE_AD_REDIRECT_URI
ARG NEXT_PUBLIC_AZURE_AD_AUTHORITY
ARG NEXT_PUBLIC_AZURE_AD_API_SCOPE

# Set environment variables from build arguments
ENV NEXT_PUBLIC_BACKEND_SERVER_URL=${NEXT_PUBLIC_BACKEND_SERVER_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_AZURE_AD_CLIENT_ID=${NEXT_PUBLIC_AZURE_AD_CLIENT_ID}
ENV NEXT_PUBLIC_AZURE_AD_TENANT_ID=${NEXT_PUBLIC_AZURE_AD_TENANT_ID}
ENV NEXT_PUBLIC_AZURE_AD_REDIRECT_URI=${NEXT_PUBLIC_AZURE_AD_REDIRECT_URI}
ENV NEXT_PUBLIC_AZURE_AD_AUTHORITY=${NEXT_PUBLIC_AZURE_AD_AUTHORITY}
ENV NEXT_PUBLIC_AZURE_AD_API_SCOPE=${NEXT_PUBLIC_AZURE_AD_API_SCOPE}

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build packages first (with NODE_ENV=production to generate .d.ts files)
RUN NODE_ENV=production pnpm run build

# Then build the frontend
WORKDIR /app/frontend
RUN pnpm build
WORKDIR /app

# Production image
FROM node:20-alpine
RUN apk add --no-cache libc6-compat

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy monorepo structure for runtime
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nextjs:nodejs /app/frontend ./frontend

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Runtime environment variables (server-side only) will be injected by Azure:
# - DATABASE_URL
# - AZURE_STORAGE_ACCOUNT_NAME
# - AZURE_STORAGE_ACCOUNT_KEY
# - AZURE_STORAGE_BLOB_ENDPOINT
# - AZURE_STORAGE_CONTAINER_NAME
# - APIM_BASE_URL
# - APIM_SUBSCRIPTION_KEY
# - AZURE_AD_API_SCOPE

WORKDIR /app/frontend
CMD ["pnpm", "start"]
