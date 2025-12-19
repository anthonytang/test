// =============================================================================
// COSMOS DB MONGODB MODULE
// =============================================================================
// Creates Azure Cosmos DB for MongoDB vCore cluster

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Environment (dev, staging, prod)')
param environment string

@secure()
@description('Administrator login password')
param administratorLoginPassword string

@description('Resource tags')
param tags object = {}

// @description('Enable private endpoints')
// param enablePrivateEndpoints bool = false

// @description('Subnet ID for private endpoints')
// param subnetId string = ''

// Variables
var clusterName = '${resourcePrefix}-mongo'
var skuName = environment == 'prod' ? 'M30' : (environment == 'staging' ? 'M40' : 'M30')  // Keep M30 for cost savings
var diskSizeGB = environment == 'prod' ? 128 : (environment == 'staging' ? 64 : 32)
var nodeCount = 1  // Always use 1 shard for cost savings

// Cosmos DB for MongoDB vCore Cluster
resource cosmosMongoCluster 'Microsoft.DocumentDB/mongoClusters@2025-04-01-preview' = {
  name: clusterName
  location: location
  tags: tags
  properties: {
    administrator: {
      userName: 'mongodbadmin'
      password: administratorLoginPassword
    }
    serverVersion: '8.0'
    compute: {
      tier: skuName
    }
    storage: {
      sizeGb: diskSizeGB
      type: 'PremiumSSD'
    }
    sharding: {
      shardCount: nodeCount
    }
    highAvailability: {
      targetMode: 'Disabled'  // Disable HA for all environments to save costs
    }
    backup: {}
    publicNetworkAccess: 'Enabled'
    dataApi: {
      mode: 'Disabled'
    }
    authConfig: {
      allowedModes: [
        'NativeAuth'
      ]
    }
    createMode: 'Default'
  }
}

// Firewall rules for connectivity
resource allowAzureServices 'Microsoft.DocumentDB/mongoClusters/firewallRules@2025-04-01-preview' = {
  parent: cosmosMongoCluster
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource allowAllIps 'Microsoft.DocumentDB/mongoClusters/firewallRules@2025-04-01-preview' = {
  parent: cosmosMongoCluster
  name: 'AllowAll'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// Private endpoint for MongoDB (if enabled) - COMMENTED OUT FOR TEST RUN
// resource mongoPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (enablePrivateEndpoints && !empty(subnetId)) {
//   name: '${clusterName}-pe'
//   location: location
//   tags: tags
//   properties: {
//     subnet: {
//       id: subnetId
//     }
//     privateLinkServiceConnections: [
//       {
//         name: '${clusterName}-pe-connection'
//         properties: {
//           privateLinkServiceId: cosmosMongoCluster.id
//           groupIds: ['MongoCluster']
//         }
//       }
//     ]
//   }
// }

// Outputs
output accountId string = cosmosMongoCluster.id
output clusterName string = cosmosMongoCluster.name
output connectionString string = cosmosMongoCluster.listConnectionStrings().connectionStrings[0].connectionString
output serverName string = cosmosMongoCluster.properties.connectionString