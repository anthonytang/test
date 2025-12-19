// =============================================================================
// SECRETS MODULE
// =============================================================================
// Stores sensitive configuration in Azure Key Vault

@description('Key Vault name')
param keyVaultName string

@secure()
@description('Cosmos PostgreSQL connection string')
param cosmosPostgresConnectionString string

@secure()
@description('Cosmos MongoDB connection string')
param cosmosMongoConnectionString string

@secure()
@description('Storage connection string')
param storageConnectionString string

@secure()
@description('OpenAI API key')
param openaiApiKey string

@description('OpenAI endpoint')
param openaiEndpoint string

@secure()
@description('Azure AD client secret')
param clientSecret string

// Reference to existing Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Cosmos PostgreSQL Connection String Secret
resource cosmosPostgresSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-postgresql-connection'
  properties: {
    value: cosmosPostgresConnectionString
    contentType: 'connection-string'
  }
}

// Cosmos MongoDB Connection String Secret
resource cosmosMongoSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-mongodb-connection'
  properties: {
    value: cosmosMongoConnectionString
    contentType: 'connection-string'
  }
}

// Storage Connection String Secret
resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'storage-connection-string'
  properties: {
    value: storageConnectionString
    contentType: 'connection-string'
  }
}

// OpenAI API Key Secret
resource openaiApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-api-key'
  properties: {
    value: openaiApiKey
    contentType: 'api-key'
  }
}

// OpenAI Endpoint Secret
resource openaiEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-endpoint'
  properties: {
    value: openaiEndpoint
    contentType: 'endpoint'
  }
}

// Azure AD Client Secret
resource clientSecretSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-ad-client-secret'
  properties: {
    value: clientSecret
    contentType: 'client-secret'
  }
}

// Outputs
output secretsCreated array = [
  'cosmos-postgresql-connection'
  'cosmos-mongodb-connection'
  'storage-connection-string'
  'azure-openai-api-key'
  'azure-openai-endpoint'
  'azure-ad-client-secret'
]