// =============================================================================
// COSMOS DB POSTGRESQL MODULE
// =============================================================================
// Creates Azure Cosmos DB for PostgreSQL cluster

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

@description('Enable private endpoints')
param enablePrivateEndpoints bool = false

@description('Database name')
param databaseName string = 'studio'

@description('PostgreSQL version')
param postgresqlVersion string = '16'

@description('Enable geo backup')
param enableGeoBackup bool = false

// Variables
var clusterName = '${resourcePrefix}-postgres'
// Use valid SKU combinations for different environments
var coordinatorVcoreCount = environment == 'prod' ? 2 : 2  // 2 vCores for Burstable
var coordinatorStorageQuotaInMb = environment == 'prod' ? 131072 : 131072  // 128 GiB = 131072 MB
var nodeCount = 0  // Single node deployment
var enableHA = false  // No HA for cost savings
var nodeVcoreCount = 4  // Not used since nodeCount = 0
var nodeStorageQuotaInMb = 524288  // Not used since nodeCount = 0
var coordinatorEdition = 'BurstableGeneralPurpose'  // Burstable for all environments

// Cosmos DB for PostgreSQL Cluster  
resource cosmosPostgresCluster 'Microsoft.DBforPostgreSQL/serverGroupsv2@2023-03-02-preview' = {
  name: clusterName
  location: location
  tags: tags
  properties: {
    databaseName: databaseName
    administratorLogin: 'citus'
    administratorLoginPassword: administratorLoginPassword
    enableHa: enableHA
    enableGeoBackup: enableGeoBackup
    postgresqlVersion: postgresqlVersion
    coordinatorVCores: coordinatorVcoreCount
    coordinatorStorageQuotaInMb: coordinatorStorageQuotaInMb
    coordinatorServerEdition: coordinatorEdition
    nodeCount: nodeCount
    nodeVCores: nodeVcoreCount
    nodeStorageQuotaInMb: nodeStorageQuotaInMb
    nodeServerEdition: 'MemoryOptimized'
    nodeEnablePublicIpAccess: !enablePrivateEndpoints
  }
}

// Firewall rule to allow Azure services
resource firewallRule 'Microsoft.DBforPostgreSQL/serverGroupsv2/firewallRules@2022-11-08' = {
  parent: cosmosPostgresCluster
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}
resource allowAllIps 'Microsoft.DBforPostgreSQL/serverGroupsv2/firewallRules@2022-11-08' = {
  parent: cosmosPostgresCluster
  name: 'AllowAll'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// Outputs
output clusterId string = cosmosPostgresCluster.id
output clusterName string = cosmosPostgresCluster.name
output connectionString string = 'host=${cosmosPostgresCluster.properties.serverNames[0].fullyQualifiedDomainName};port=5432;database=${databaseName};username=citus;password=${administratorLoginPassword};sslmode=require'
output serverName string = cosmosPostgresCluster.properties.serverNames[0].fullyQualifiedDomainName
output databaseName string = databaseName