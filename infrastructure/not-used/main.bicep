// =============================================================================
// STUDIO INFRASTRUCTURE - ESSENTIAL SERVICES ONLY
// =============================================================================
// This template deploys the essential Studio infrastructure for AI-powered 
// document analysis including core Azure resources.
//
// Essential Resources deployed:
// - Resource Group
// - App Service Plan & Apps (Frontend/Backend)  
// - Azure AI Foundry Service
// - Cosmos DB (PostgreSQL & MongoDB)
// - Storage Account
// - Key Vault
// =============================================================================

targetScope = 'subscription'

// =============================================================================
// PARAMETERS
// =============================================================================

@minLength(3)
@maxLength(10)
@description('Customer prefix for resource naming (3-10 alphanumeric chars)')
param customerPrefix string

@allowed(['dev', 'staging', 'prod'])
@description('Environment name')
param environment string = 'dev'

@description('Azure region for all resources')
param location string = 'eastus'

@description('App Service Plan SKU')
@allowed(['B1', 'B2', 'S1', 'S2', 'P1v3', 'P2v3'])
param appServicePlanSku string = 'B1'

@secure()
@description('Azure AD Tenant ID')
param tenantId string

@secure()
@description('Azure AD Client ID for authentication')
param clientId string

@secure()
@description('Azure AD Client Secret')
param clientSecret string

@secure()
@description('Cosmos DB PostgreSQL admin password')
param postgresPassword string

@secure()
@description('Cosmos DB MongoDB admin password') 
param mongoPassword string



// =============================================================================
// VARIABLES
// =============================================================================

var resourceGroupName = '${customerPrefix}-studio-${environment}-rg'
var resourcePrefix = '${customerPrefix}-studio-${environment}'
var commonTags = {
  Environment: environment
  Customer: customerPrefix
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'infrastructure-as-code'
}

// =============================================================================
// RESOURCE GROUP
// =============================================================================

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

// =============================================================================
// KEY VAULT (for secrets)
// =============================================================================

module keyVault 'modules/keyVault.bicep' = {
  scope: rg
  name: 'keyvault-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    tenantId: tenantId
    tags: commonTags
  }
}

// =============================================================================
// STORAGE ACCOUNT
// =============================================================================

module storage 'modules/storage.bicep' = {
  scope: rg
  name: 'storage-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    tags: commonTags
  }
}

// =============================================================================
// AZURE AI FOUNDRY SERVICE
// =============================================================================

module openai 'modules/openai.bicep' = {
  scope: rg
  name: 'openai-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    tags: commonTags
  }
}

// =============================================================================
// COSMOS DB POSTGRESQL
// =============================================================================

module cosmosPostgres 'modules/cosmosPostgres.bicep' = {
  scope: rg
  name: 'cosmos-postgres-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    administratorLoginPassword: postgresPassword
    tags: commonTags
  }
}

// =============================================================================
// COSMOS DB MONGODB
// =============================================================================

module cosmosMongo 'modules/cosmosMongo.bicep' = {
  scope: rg
  name: 'cosmos-mongo-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    administratorLoginPassword: mongoPassword
    tags: commonTags
  }
}

// =============================================================================
// APP SERVICE PLAN & APPS
// =============================================================================

module appService 'modules/appService.bicep' = {
  scope: rg
  name: 'appservice-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    appServicePlanSku: appServicePlanSku
    keyVaultName: keyVault.outputs.keyVaultName
    storageAccountName: storage.outputs.storageAccountName
    openaiEndpoint: openai.outputs.endpoint
    tenantId: tenantId
    clientId: clientId
    appInsightsInstrumentationKey: ''
    appInsightsConnectionString: ''
    tags: commonTags
  }
}

// =============================================================================
// STORE SECRETS IN KEY VAULT
// =============================================================================

module secrets 'modules/secrets.bicep' = {
  scope: rg
  name: 'secrets-deployment'
  params: {
    keyVaultName: keyVault.outputs.keyVaultName
    cosmosPostgresConnectionString: cosmosPostgres.outputs.connectionString
    cosmosMongoConnectionString: cosmosMongo.outputs.connectionString
    storageConnectionString: storage.outputs.connectionString
    openaiApiKey: openai.outputs.apiKey
    openaiEndpoint: openai.outputs.endpoint
    clientSecret: clientSecret
  }
}

// =============================================================================
// OUTPUTS
// =============================================================================

@description('Resource Group Name')
output resourceGroupName string = rg.name

@description('Frontend Application URL')
output frontendUrl string = appService.outputs.frontendUrl

@description('Backend API URL')
output backendUrl string = appService.outputs.backendUrl

@description('Azure OpenAI Endpoint')
output openaiEndpoint string = openai.outputs.endpoint

@description('Storage Account Name')
output storageAccountName string = storage.outputs.storageAccountName

@description('Key Vault Name')
output keyVaultName string = keyVault.outputs.keyVaultName

@description('Cosmos PostgreSQL Connection String')
output postgresConnectionString string = cosmosPostgres.outputs.connectionString

@description('Cosmos MongoDB Connection String')
output mongoConnectionString string = cosmosMongo.outputs.connectionString

@description('Next Steps')
output nextSteps array = [
  '1. Upload your application code to: ${appService.outputs.frontendUrl}'
  '2. Configure Azure AD app registration with redirect URI: ${appService.outputs.frontendUrl}/auth/callback'
  '3. Test the application endpoints'
  '4. Set up CI/CD pipeline for code deployments'
]