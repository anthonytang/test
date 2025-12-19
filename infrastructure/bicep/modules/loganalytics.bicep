// modules/loganalytics.bicep
// Creates or updates a Log Analytics workspace.

@description('Name of the Log Analytics workspace')
param workspaceName string

@description('Location of the workspace')
param location string

@description('Optional tags to apply to the workspace')
param tags object = {}

@description('Retention in days for logs (default 30)')
param retentionInDays int = 30

@description('SKU of the workspace')
@allowed([
  'Free'
  'PerNode'
  'PerGB2018'
  'Standalone'
  'CapacityReservation'
])
param sku string = 'PerGB2018'

// The resource group comes from the deployment scope
resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: sku
    }
    retentionInDays: retentionInDays
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// Useful outputs for other modules / scripts
output workspaceId string = workspace.id
output workspaceNameOut string = workspace.name
output workspaceCustomerId string = workspace.properties.customerId
