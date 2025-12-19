targetScope = 'subscription'

@minLength(3)
@maxLength(10)
@description('Customer prefix for resource naming (3-10 alphanumeric chars)')
param customerPrefix string

@allowed(['dev', 'test', 'staging', 'prod'])
@description('Environment name')
param environment string = 'dev'

@description('Azure region for all resources')
param location string = 'eastus'

@secure()
@description('Azure AD Tenant ID')
param tenantId string

// Variables
var resourceGroupName = '${customerPrefix}-studio-${environment}-rg'
var resourcePrefix = '${customerPrefix}-studio-${environment}'
var commonTags = {
  Environment: environment
  Customer: customerPrefix
  Project: 'studio'
  ManagedBy: 'bicep'
  DeployedBy: 'modular-deployment'
}

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

// Key Vault
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

// Outputs
output resourceGroupName string = rg.name
output keyVaultName string = keyVault.outputs.keyVaultName
output resourcePrefix string = resourcePrefix
