// modules/appservice.diagnostics.bicep
// Attach an App Service (Web App) to a Log Analytics workspace via diagnostic settings.

@description('Name of the App Service (site)')
param siteName string

@description('Log Analytics workspace resource ID')
param workspaceId string

// Existing App Service
resource site 'Microsoft.Web/sites@2022-09-01' existing = {
  name: siteName
}

// Diagnostic settings for this site
resource siteDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'logs-to-loganalytics' // must be unique per resource
  scope: site
  properties: {
    workspaceId: workspaceId

    // Enable the main log categories you care about
    logs: [
      // HTTP access logs
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      // Console logs (this is where your Python logger.* ends up)
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      // Application logs (if using App Service “App logs” feature)
      {
        category: 'AppServiceAppLogs'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]

    // Optionally enable metrics too
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}
