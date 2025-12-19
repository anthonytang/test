import { NextResponse } from 'next/server';
import { validateServerConfig, getAzureBlobClient, azureDbClient } from '@studio/api/server';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    config: ServiceStatus;
    database: ServiceStatus;
    storage: ServiceStatus;
  };
  environment: string;
}

interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  message?: string;
  error?: string;
}

export async function GET() {
  const startTime = Date.now();
  
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      config: { status: 'unknown' },
      database: { status: 'unknown' },
      storage: { status: 'unknown' },
    },
    environment: process.env.NODE_ENV || 'development',
  };

  // Check configuration
  try {
    const configValidation = validateServerConfig();
    if (configValidation.valid) {
      health.services.config = { status: 'up', message: 'Configuration valid' };
    } else {
      health.services.config = { 
        status: 'down', 
        error: configValidation.errors?.join('; ') 
      };
      health.status = 'unhealthy';
    }
  } catch (error) {
    health.services.config = { 
      status: 'down', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
    health.status = 'unhealthy';
  }

  // Check database connectivity (only if config is valid)
  if (health.services.config.status === 'up') {
    try {
      // Simple query to test connection
      await azureDbClient.query('SELECT 1');
      health.services.database = { status: 'up', message: 'Database connected' };
    } catch (error) {
      health.services.database = { 
        status: 'down', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } else {
    health.services.database = { 
      status: 'unknown', 
      message: 'Skipped due to config error' 
    };
  }

  // Check storage connectivity (only if config is valid)
  if (health.services.config.status === 'up') {
    try {
      const blobClient = getAzureBlobClient();
      // Try to list files with a limit to test connection
      await blobClient.listFiles('health-check-');
      health.services.storage = { status: 'up', message: 'Storage accessible' };
    } catch (error) {
      health.services.storage = { 
        status: 'down', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } else {
    health.services.storage = { 
      status: 'unknown', 
      message: 'Skipped due to config error' 
    };
  }

  // Calculate response time
  const responseTime = Date.now() - startTime;

  // Set appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : 
                    health.status === 'degraded' ? 200 : 503;

  return NextResponse.json(
    {
      ...health,
      responseTime: `${responseTime}ms`,
    },
    { status: statusCode }
  );
}

// Simple database query method (type extension for azureDbClient)
declare module '@studio/api/server' {
  interface AzureDbClient {
    query(text: string): Promise<any[]>;
  }
}