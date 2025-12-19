// =============================================================================
// APP SERVICE MODULE
// =============================================================================
// Creates App Service Plan and Web Apps for frontend and backend

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('App Service Plan SKU')
param appServicePlanSku string

@description('Key Vault name')
param keyVaultName string

@description('Storage account name')
param storageAccountName string

@description('OpenAI endpoint')
param openaiEndpoint string

@description('Azure AD Tenant ID')
param tenantId string

@description('Azure AD Client ID')
param clientId string

@description('Application Insights instrumentation key')
param appInsightsInstrumentationKey string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Enable AI Foundry integration')
param hasAifoundry bool = true

@description('Resource tags')
param tags object = {}

@description('Enable private endpoints')
param enablePrivateEndpoints bool = false

@description('Subnet ID for App Service integration')
param subnetId string = ''

// Variables
var appServicePlanName = '${resourcePrefix}-plan'
var frontendAppName = '${resourcePrefix}-frontend'
var backendAppName = '${resourcePrefix}-backend'

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: appServicePlanSku
  }
  properties: {
    reserved: false
  }
}

// Frontend Web App (Next.js)
resource frontendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: frontendAppName
  location: location
  tags: tags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
    virtualNetworkSubnetId: enablePrivateEndpoints && !empty(subnetId) ? subnetId : null
    siteConfig: {
      nodeVersion: '20-lts'
      alwaysOn: appServicePlanSku != 'B1'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      httpLoggingEnabled: true
      detailedErrorLoggingEnabled: true
      requestTracingEnabled: true
      appSettings: [
        {
          name: 'NEXT_PUBLIC_BACKEND_SERVER_URL'
          value: 'https://${backendAppName}.azurewebsites.net'
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_CLIENT_ID'
          value: clientId
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_TENANT_ID'
          value: tenantId
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_REDIRECT_URI'
          value: 'https://${frontendAppName}.azurewebsites.net/auth/callback'
        }
        {
          name: 'NEXT_PUBLIC_AZURE_AD_AUTHORITY'
          value: '${az.environment().authentication.loginEndpoint}${tenantId}'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: 'user-files'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsightsInstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'NEXT_TELEMETRY_DISABLED'
          value: '1'
        }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Backend Web App (FastAPI/Python)
resource backendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: backendAppName
  location: location
  tags: tags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
    virtualNetworkSubnetId: enablePrivateEndpoints && !empty(subnetId) ? subnetId : null
    siteConfig: {
      pythonVersion: '3.11'
      alwaysOn: appServicePlanSku != 'B1'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      httpLoggingEnabled: true
      detailedErrorLoggingEnabled: true
      requestTracingEnabled: true
      cors: {
        allowedOrigins: [
          '*'
        ]
        supportCredentials: true
      }
      appSettings: concat([
        // Core settings
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=cosmos-postgresql-connection)'
        }
        {
          name: 'COSMOS_MONGODB_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=cosmos-mongodb-connection)'
        }
        {
          name: 'COSMOS_DATABASE_NAME'
          value: 'vectordb'
        }
        {
          name: 'COSMOS_COLLECTION_NAME'
          value: 'documents'
        }
        {
          name: 'STORAGE_ACCOUNT_CONNECTION'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=storage-connection-string)'
        }
        {
          name: 'AZURE_AD_TENANT_ID'
          value: tenantId
        }
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: clientId
        }
        {
          name: 'AZURE_AD_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=azure-ad-client-secret)'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'AZURE_STORAGE_CONTAINER_NAME'
          value: 'user-files'
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=storage-connection-string)'
        }
        {
          name: 'PORT'
          value: '8000'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8000'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsightsInstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'PYTHONPATH'
          value: '/app'
        }
        {
          name: 'PYTHONUNBUFFERED'
          value: '1'
        }
      ], hasAifoundry ? [
        // AI Foundry settings (only if enabled)
        {
          name: 'AZURE_OPENAI_API_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=azure-aifoundry-api-key)'
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openaiEndpoint
        }
        {
          name: 'AZURE_OPENAI_API_VERSION'
          value: '2025-01-01-preview'
        }
        {
          name: 'MODEL_NAME'
          value: 'gpt-4o'
        }
        {
          name: 'SMALL_MODEL_NAME'
          value: 'gpt-4o-mini'
        }
        {
          name: 'EMBEDDING_MODEL_NAME'
          value: 'text-embedding-3-small'
        }
        {
          name: 'AZURE_AD_ISSUER'
          value: '${az.environment().authentication.loginEndpoint}${tenantId}/v2.0'
        }
      ] : [])
      appCommandLine: 'uvicorn server:app --host 0.0.0.0 --port 8000'
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Key Vault access policy for Frontend App
resource frontendKeyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  name: '${keyVaultName}/add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: frontendApp.identity.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}

// Key Vault access policy for Backend App
resource backendKeyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  name: '${keyVaultName}/add'
  properties: {
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: backendApp.identity.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
  dependsOn: [
    frontendKeyVaultAccessPolicy
  ]
}

// Outputs
output appServicePlanId string = appServicePlan.id
output frontendAppId string = frontendApp.id
output frontendUrl string = 'https://${frontendApp.properties.defaultHostName}'
output backendAppId string = backendApp.id
output backendUrl string = 'https://${backendApp.properties.defaultHostName}'
output frontendPrincipalId string = frontendApp.identity.principalId
output backendPrincipalId string = backendApp.identity.principalId