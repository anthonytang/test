// =============================================================================
// KEY VAULT MODULE
// =============================================================================
// Creates Azure Key Vault for secure storage of secrets, keys, and certificates

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Azure AD Tenant ID')
param tenantId string

@description('Resource tags')
param tags object = {}

@description('Enable private endpoints')
param enablePrivateEndpoints bool = false

@description('Object ID of the user who should have Key Vault access')
param deployerObjectId string = ''

// @description('Subnet ID for private endpoints')
// param subnetId string = ''

// Variables
var keyVaultName = '${resourcePrefix}-kv'

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: tenantId
    enabledForDeployment: true
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: enablePrivateEndpoints ? 'Deny' : 'Allow'
    }
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
  }
}

// Private endpoint for Key Vault (if enabled) - COMMENTED OUT FOR TEST RUN
// resource keyVaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (enablePrivateEndpoints && !empty(subnetId)) {
//   name: '${keyVaultName}-pe'
//   location: location
//   tags: tags
//   properties: {
//     subnet: {
//       id: subnetId
//     }
//     privateLinkServiceConnections: [
//       {
//         name: '${keyVaultName}-pe-connection'
//         properties: {
//           privateLinkServiceId: keyVault.id
//           groupIds: ['vault']
//         }
//       }
//     ]
//   }
// }

// Role assignment for deployer (Key Vault Secrets Officer)
resource keyVaultSecretsOfficerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerObjectId)) {
  name: guid(keyVault.id, deployerObjectId, 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
    principalId: deployerObjectId
    principalType: 'User'
  }
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri