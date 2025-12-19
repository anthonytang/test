// =============================================================================
// STORAGE ACCOUNT MODULE
// =============================================================================
// Creates Azure Storage Account with blob containers for file storage

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Environment (dev, staging, prod)')
param environment string

@description('Resource tags')
param tags object = {}

@description('Enable private endpoints')
param enablePrivateEndpoints bool = false

// @description('Subnet ID for private endpoints')
// param subnetId string = ''

// Variables - Add uniqueness suffix to avoid naming conflicts
var baseStorageName = replace('${resourcePrefix}storage', '-', '')
var uniqueSuffix = substring(uniqueString(resourceGroup().id, deployment().name), 0, 8)
var storageAccountName = '${baseStorageName}${uniqueSuffix}'
// Ensure storage account name is within 24 character limit and ends with unique suffix
var finalStorageAccountName = length(storageAccountName) > 24 ? '${substring(baseStorageName, 0, 16)}${uniqueSuffix}' : storageAccountName
var tier = environment == 'prod' ? 'Standard' : 'Standard'
var replication = environment == 'prod' ? 'GRS' : 'LRS'

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: finalStorageAccountName
  location: location
  tags: tags
  sku: {
    name: '${tier}_${replication}'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: enablePrivateEndpoints ? 'Deny' : 'Allow'
    }
    publicNetworkAccess: enablePrivateEndpoints ? 'Disabled' : 'Enabled'
  }
}

// Blob Service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

// User Files Container
resource userFilesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'user-files'
  properties: {
    publicAccess: 'None'
  }
}

// Temp Files Container
resource tempFilesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'temp-files'
  properties: {
    publicAccess: 'None'
  }
}

// Backups Container (if needed)
resource backupsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'backups'
  properties: {
    publicAccess: 'None'
  }
}

// Private endpoint for Storage Account (if enabled) - COMMENTED OUT FOR TEST RUN
// resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (enablePrivateEndpoints && !empty(subnetId)) {
//   name: '${storageAccountName}-pe'
//   location: location
//   tags: tags
//   properties: {
//     subnet: {
//       id: subnetId
//     }
//     privateLinkServiceConnections: [
//       {
//         name: '${storageAccountName}-pe-connection'
//         properties: {
//           privateLinkServiceId: storageAccount.id
//           groupIds: ['blob']
//         }
//       }
//     ]
//   }
// }

// Outputs
output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
output primaryEndpoint string = storageAccount.properties.primaryEndpoints.blob