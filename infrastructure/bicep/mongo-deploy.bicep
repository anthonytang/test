targetScope = 'resourceGroup'

param resourcePrefix string = 'sallyport-studio-prod'
param location string = 'eastus'
param environment string = 'prod'
param administratorLoginPassword string = 'SallyPort2024!@#'

var commonTags = {
  Environment: environment
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// Cosmos MongoDB
module cosmosMongo 'modules/cosmosMongo.bicep' = {
  name: 'cosmos-mongo-deployment'
  params: {
    resourcePrefix: resourcePrefix
    location: location
    environment: environment
    administratorLoginPassword: administratorLoginPassword
    tags: commonTags
  }
}

// Store connection string in Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: 'sallyport-studio-prod-kv'
}

resource mongoConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-mongodb-connection'
  properties: {
    value: cosmosMongo.outputs.connectionString
  }
}

// Outputs
output connectionString string = cosmosMongo.outputs.connectionString
output clusterName string = cosmosMongo.outputs.clusterName
