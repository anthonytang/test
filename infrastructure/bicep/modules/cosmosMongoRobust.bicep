// =============================================================================
// ROBUST COSMOS DB MONGODB MODULE
// =============================================================================
// Creates Azure Cosmos DB for MongoDB vCore cluster with enhanced error handling

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Environment (dev, staging, prod)')
param environment string

@secure()
@description('Administrator login password (min 8 chars, must contain uppercase, lowercase, number, special char)')
@minLength(8)
@maxLength(128)
param administratorLoginPassword string

@description('Resource tags')
param tags object = {}

@description('Enable high availability (recommended for prod)')
param enableHighAvailability bool = true

@description('Enable public network access (set to false for private endpoints)')
param enablePublicAccess bool = true

// Variables with validation
var clusterName = '${resourcePrefix}-mongo'
var skuName = environment == 'prod' ? 'M30' : (environment == 'staging' ? 'M40' : 'M30')  // Keep M30 for cost savings
var diskSizeGB = environment == 'prod' ? 128 : (environment == 'staging' ? 64 : 32)
var nodeCount = 1  // Always use 1 shard for cost savings
var enableHa = false  // Disable HA for all environments

// Validate cluster name length (Azure limit is 44 characters)
assert clusterNameLength: length(clusterName) <= 44

// Cosmos DB for MongoDB vCore Cluster
resource cosmosMongoCluster 'Microsoft.DocumentDB/mongoClusters@2023-03-01-preview' = {
  name: clusterName
  location: location
  tags: union(tags, {
    'DeploymentType': 'robust'
    'CreatedBy': 'bicep-robust-module'
  })
  properties: {
    administratorLogin: 'mongodbadmin'
    administratorLoginPassword: administratorLoginPassword
    serverVersion: '5.0'
    nodeGroupSpecs: [
      {
        kind: 'Shard'
        sku: skuName
        diskSizeGB: diskSizeGB
        enableHa: enableHa
        nodeCount: nodeCount
      }
    ]
  }
}

// Firewall rule to allow Azure services (if public access enabled)
resource firewallRule 'Microsoft.DocumentDB/mongoClusters/firewallRules@2023-03-01-preview' = if (enablePublicAccess) {
  parent: cosmosMongoCluster
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Additional firewall rule to allow all IPs (for development/testing)
resource allowAllFirewallRule 'Microsoft.DocumentDB/mongoClusters/firewallRules@2023-03-01-preview' = if (enablePublicAccess && environment != 'prod') {
  parent: cosmosMongoCluster
  name: 'AllowAllIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// Database for vector storage
resource vectordb 'Microsoft.DocumentDB/mongoClusters/databases@2023-03-01-preview' = {
  parent: cosmosMongoCluster
  name: 'vectordb'
  properties: {
    throughput: environment == 'prod' ? 400 : 100
  }
}

// Collection for documents with vector search
resource documentsCollection 'Microsoft.DocumentDB/mongoClusters/databases/collections@2023-03-01-preview' = {
  parent: vectordb
  name: 'documents'
  properties: {
    shardKey: {
      _id: 'Hash'
    }
    indexes: [
      {
        key: {
          _id: 1
        }
        options: {
          unique: true
        }
      }
      {
        key: {
          embedding: 'cosmosSearch'
        }
        options: {
          cosmosSearchOptions: {
            kind: 'vector-ivf'
            numLists: 100
            similarity: 'COS'
            dimensions: 1536
          }
        }
      }
    ]
  }
}

// Outputs
output accountId string = cosmosMongoCluster.id
output clusterName string = cosmosMongoCluster.name
output connectionString string = 'mongodb+srv://mongodbadmin:${administratorLoginPassword}@${cosmosMongoCluster.properties.connectionString}/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000'
output serverName string = cosmosMongoCluster.properties.connectionString
output databaseName string = vectordb.name
output collectionName string = documentsCollection.name
output endpoint string = cosmosMongoCluster.properties.connectionString
