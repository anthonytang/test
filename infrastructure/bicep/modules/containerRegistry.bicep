// =============================================================================
// CONTAINER REGISTRY MODULE
// =============================================================================
// Creates Azure Container Registry for storing and managing container images

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Environment (dev, staging, prod)')
param environment string

@description('Resource tags')
param tags object = {}

@description('Enable admin user for registry access')
param enableAdminUser bool = false

@description('Enable private endpoints')
param enablePrivateEndpoints bool = false

// Variables
var registryName = replace('${resourcePrefix}acr', '-', '')
var sku = 'Premium'
var retentionDays = environment == 'prod' ? 30 : 7

// Container Registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: enableAdminUser
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
    networkRuleBypassOptions: 'AzureServices'
    policies: {
      retentionPolicy: {
        days: retentionDays
        status: 'enabled'
      }
      trustPolicy: {
        status: 'disabled'
      }
    }
  }
}

// Private endpoint for Container Registry (if enabled)
resource registryPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (enablePrivateEndpoints) {
  name: '${registryName}-pe'
  location: location
  tags: tags
  properties: {
    privateLinkServiceConnections: [
      {
        name: '${registryName}-pe-connection'
        properties: {
          privateLinkServiceId: containerRegistry.id
          groupIds: ['registry']
        }
      }
    ]
  }
}

// Outputs
output registryName string = containerRegistry.name
output registryId string = containerRegistry.id
output loginServer string = containerRegistry.properties.loginServer
output adminUserEnabled bool = containerRegistry.properties.adminUserEnabled
