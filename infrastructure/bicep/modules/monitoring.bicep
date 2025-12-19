// =============================================================================
// MONITORING MODULE
// =============================================================================
// Creates alerts and monitoring for the infrastructure (optional)

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Alert email address')
param alertEmail string

@description('App Service Plan resource ID')
param appServicePlanId string

@description('Frontend App resource ID')
param frontendAppId string

@description('Backend App resource ID')
param backendAppId string

@description('Cosmos PostgreSQL cluster ID')
param cosmosPostgresId string

@description('Cosmos MongoDB account ID')
param cosmosMongoId string

@description('Storage Account resource ID')
param storageAccountId string

@description('Resource tags')
param tags object = {}

// Variables
var actionGroupName = '${resourcePrefix}-alerts'

// Action Group for email alerts
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'Global'
  tags: tags
  properties: {
    groupShortName: 'StudioAlert'
    enabled: true
    emailReceivers: [
      {
        name: 'Admin'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// App Service CPU Alert
resource appServiceCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${resourcePrefix}-appservice-cpu-alert'
  location: 'Global'
  tags: tags
  properties: {
    severity: 2
    enabled: true
    scopes: [
      appServicePlanId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'CPU Usage'
          metricName: 'CpuPercentage'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    description: 'Alert when App Service CPU usage is high'
  }
}

// App Service Memory Alert
resource appServiceMemoryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${resourcePrefix}-appservice-memory-alert'
  location: 'Global'
  tags: tags
  properties: {
    severity: 2
    enabled: true
    scopes: [
      appServicePlanId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Memory Usage'
          metricName: 'MemoryPercentage'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    description: 'Alert when App Service memory usage is high'
  }
}

// Frontend HTTP 5xx Errors Alert
resource frontendErrorAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${resourcePrefix}-frontend-errors-alert'
  location: 'Global'
  tags: tags
  properties: {
    severity: 1
    enabled: true
    scopes: [
      frontendAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HTTP 5xx Errors'
          metricName: 'Http5xx'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    description: 'Alert when frontend has HTTP 5xx errors'
  }
}

// Backend HTTP 5xx Errors Alert
resource backendErrorAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${resourcePrefix}-backend-errors-alert'
  location: 'Global'
  tags: tags
  properties: {
    severity: 1
    enabled: true
    scopes: [
      backendAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HTTP 5xx Errors'
          metricName: 'Http5xx'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    description: 'Alert when backend has HTTP 5xx errors'
  }
}

// Outputs
output actionGroupId string = actionGroup.id
output alertsCreated array = [
  appServiceCpuAlert.name
  appServiceMemoryAlert.name
  frontendErrorAlert.name
  backendErrorAlert.name
]