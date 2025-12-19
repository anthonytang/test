/**
 * Runtime configuration for server-side services
 * This file handles environment variables that should only be accessed at runtime,
 * not during the build process.
 */

import { z } from 'zod';

// Schema definitions for type safety and validation
const AzureStorageConfigSchema = z.object({
  accountName: z.string().min(1, 'Azure Storage account name is required'),
  accountKey: z.string().min(1, 'Azure Storage account key is required'),
  endpoint: z.string().url('Invalid Azure Storage endpoint URL'),
  containerName: z.string().min(1, 'Azure Storage container name is required'),
});

const DatabaseConfigSchema = z.object({
  url: z.string().min(1, 'Database URL is required'),
});

const ServerConfigSchema = z.object({
  azureStorage: AzureStorageConfigSchema,
  database: DatabaseConfigSchema,
});

const PublicConfigSchema = z.object({
  backendUrl: z.string().url('Invalid backend URL'),
  siteUrl: z.string().url('Invalid site URL'),
  azure: z.object({
    clientId: z.string().min(1, 'Azure AD client ID is required'),
    tenantId: z.string().min(1, 'Azure AD tenant ID is required'),
    redirectUri: z.string().url('Invalid redirect URI'),
    authority: z.string().url('Invalid authority URL'),
  }),
});

// Types
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type PublicConfig = z.infer<typeof PublicConfigSchema>;

// Singleton pattern for config caching
let cachedServerConfig: ServerConfig | null = null;
let cachedPublicConfig: PublicConfig | null = null;

/**
 * Get server-side configuration
 * @throws {Error} If required environment variables are missing or invalid
 */
export function getServerConfig(): ServerConfig {
  // Return cached config if available
  if (cachedServerConfig) {
    return cachedServerConfig;
  }

  // Only validate in server environment
  if (typeof window !== 'undefined') {
    throw new Error('getServerConfig() called on client side');
  }

  try {
    const config = ServerConfigSchema.parse({
      azureStorage: {
        accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
        accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
        endpoint: process.env.AZURE_STORAGE_BLOB_ENDPOINT,
        containerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
      },
      database: {
        url: process.env.DATABASE_URL,
      },
    });

    cachedServerConfig = config;
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Invalid server configuration:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Get public configuration (safe for client-side)
 */
export function getPublicConfig(): PublicConfig {
  // Return cached config if available
  if (cachedPublicConfig) {
    return cachedPublicConfig;
  }

  try {
    const config = PublicConfigSchema.parse({
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_SERVER_URL,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      azure: {
        clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID,
        tenantId: process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID,
        redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI,
        authority: process.env.NEXT_PUBLIC_AZURE_AD_AUTHORITY,
      },
    });

    cachedPublicConfig = config;
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Invalid public configuration:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Validate server configuration without throwing
 * Useful for health checks
 */
export function validateServerConfig(): { valid: boolean; errors?: string[] } {
  try {
    getServerConfig();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: error instanceof Error ? [error.message] : ['Unknown configuration error'],
    };
  }
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get a safe config for logging (with sensitive values redacted)
 */
export function getSafeConfigForLogging(): Record<string, any> {
  const config = getServerConfig();
  return {
    azureStorage: {
      accountName: config.azureStorage.accountName,
      accountKey: '***REDACTED***',
      endpoint: config.azureStorage.endpoint,
      containerName: config.azureStorage.containerName,
    },
    database: {
      url: config.database.url.replace(/:[^:@]+@/, ':***REDACTED***@'),
    },
  };
}