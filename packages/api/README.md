# @studio/api

Backend API communication and data fetching package for Studio.

## Contents

- `azure-api-client.ts` - Azure API client for backend API interactions
- `azure-db-client.ts` - Azure database client for PostgreSQL operations
- `backend-client.ts` - Backend communication client with authentication
- `enhancement-api.ts` - Enhancement API operations

## Installation

```bash
pnpm add @studio/api
```

## Usage

```typescript
import { azureApiClient, BackendClient, EnhancementAPI, azureDbClient } from '@studio/api';

// Use API client
const templates = await azureApiClient.getTemplates();

// Use backend client
const response = await BackendClient.fetch('/endpoint', { token: '...' });

// Use enhancement API
const enhanced = await EnhancementAPI.enhanceDescription(description, token);

// Use database client (server-side only)
const files = await azureDbClient.getFiles(userId);
```

## Dependencies

- `@studio/core` - Core types and utilities
- `pg` - PostgreSQL client library

## Build

```bash
pnpm build
```

## Development

```bash
pnpm dev
```

