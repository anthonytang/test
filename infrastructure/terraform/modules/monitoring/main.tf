# Monitoring Module
# Creates comprehensive monitoring infrastructure

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-law"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.log_analytics_sku
  retention_in_days   = var.log_retention_days

  tags = var.tags
}

# Log Analytics Solution for Container Insights
resource "azurerm_log_analytics_solution" "container_insights" {
  count                 = var.enable_container_insights ? 1 : 0
  solution_name         = "ContainerInsights"
  location              = var.location
  resource_group_name   = var.resource_group_name
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/ContainerInsights"
  }

  tags = var.tags
}

# Log Analytics Solution for VM Insights
resource "azurerm_log_analytics_solution" "vm_insights" {
  count                 = var.enable_vm_insights ? 1 : 0
  solution_name         = "VMInsights"
  location              = var.location
  resource_group_name   = var.resource_group_name
  workspace_resource_id = azurerm_log_analytics_workspace.main.id
  workspace_name        = azurerm_log_analytics_workspace.main.name

  plan {
    publisher = "Microsoft"
    product   = "OMSGallery/VMInsights"
  }

  tags = var.tags
}

# Action Group for alerts
resource "azurerm_monitor_action_group" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-ag"
  resource_group_name = var.resource_group_name
  short_name          = "main-ag"

  dynamic "email_receiver" {
    for_each = var.alert_email_addresses
    content {
      name                    = "email-${email_receiver.key}"
      email_address          = email_receiver.value
      use_common_alert_schema = true
    }
  }

  dynamic "webhook_receiver" {
    for_each = var.alert_webhook_urls
    content {
      name                    = "webhook-${webhook_receiver.key}"
      service_uri            = webhook_receiver.value
      use_common_alert_schema = true
    }
  }

  tags = var.tags
}

# Metric Alert for App Service CPU
resource "azurerm_monitor_metric_alert" "app_service_cpu" {
  count               = var.enable_app_service_alerts ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-app-cpu-alert"
  resource_group_name = var.resource_group_name
  scopes               = var.app_service_ids
  description          = "Alert when App Service CPU usage is high"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "CpuPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = var.app_service_cpu_threshold

    dimension {
      name     = "InstanceId"
      operator = "Include"
      values   = ["*"]
    }
  }

  window_size        = "PT15M"
  frequency          = "PT5M"
  severity           = 2

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = var.tags
}

# Metric Alert for App Service Memory
resource "azurerm_monitor_metric_alert" "app_service_memory" {
  count               = var.enable_app_service_alerts ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-app-memory-alert"
  resource_group_name = var.resource_group_name
  scopes               = var.app_service_ids
  description          = "Alert when App Service memory usage is high"

  criteria {
    metric_namespace = "Microsoft.Web/sites"
    metric_name      = "MemoryPercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = var.app_service_memory_threshold

    dimension {
      name     = "InstanceId"
      operator = "Include"
      values   = ["*"]
    }
  }

  window_size        = "PT15M"
  frequency          = "PT5M"
  severity           = 2

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = var.tags
}

# Metric Alert for Database connections
resource "azurerm_monitor_metric_alert" "database_connections" {
  count               = var.enable_database_alerts ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-db-connections-alert"
  resource_group_name = var.resource_group_name
  scopes               = var.database_ids
  description          = "Alert when database connections are high"

  criteria {
    metric_namespace = "Microsoft.DocumentDB/databaseAccounts"
    metric_name      = "TotalRequests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = var.database_connections_threshold
  }

  window_size        = "PT15M"
  frequency          = "PT5M"
  severity           = 2

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = var.tags
}

# Log Alert for Application Errors
resource "azurerm_monitor_scheduled_query_rules_alert" "application_errors" {
  count               = var.enable_log_alerts ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-app-errors-alert"
  resource_group_name = var.resource_group_name
  location            = var.location
  description         = "Alert when application errors exceed threshold"

  data_source_id = azurerm_log_analytics_workspace.main.id

  query = <<-QUERY
    AppTraces
    | where SeverityLevel == 3
    | summarize count() by bin(TimeGenerated, 5m)
    | where count_ > ${var.application_errors_threshold}
  QUERY

  schedule {
    frequency_in_minutes = 5
    time_window_in_minutes = 5
  }

  trigger {
    operator  = "GreaterThan"
    threshold = 0
  }

  action {
    action_group = [azurerm_monitor_action_group.main.id]
  }

  tags = var.tags
}

# Diagnostic Settings for App Services
resource "azurerm_monitor_diagnostic_setting" "app_service_backend" {
  count              = var.enable_diagnostic_settings ? 1 : 0
  name               = "${var.customer_prefix}-${var.project_name}-${var.environment}-backend-diag"
  target_resource_id = var.backend_app_service_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  log {
    category = "AppServiceHTTPLogs"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }

  log {
    category = "AppServiceConsoleLogs"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }

  log {
    category = "AppServiceAppLogs"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "app_service_frontend" {
  count              = var.enable_diagnostic_settings ? 1 : 0
  name               = "${var.customer_prefix}-${var.project_name}-${var.environment}-frontend-diag"
  target_resource_id = var.frontend_app_service_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  log {
    category = "AppServiceHTTPLogs"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }

  log {
    category = "AppServiceConsoleLogs"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }

  metric {
    category = "AllMetrics"
    enabled  = true

    retention_policy {
      enabled = true
      days    = var.log_retention_days
    }
  }
}

# Cost Management Alert
resource "azurerm_consumption_budget_resource_group" "main" {
  count           = var.enable_cost_alerts ? 1 : 0
  name            = "${var.customer_prefix}-${var.project_name}-${var.environment}-budget"
  resource_group_id = var.resource_group_id

  amount     = var.monthly_budget_amount
  time_grain = "Monthly"

  notification {
    enabled        = true
    threshold      = 90.0
    operator       = "GreaterThan"
    contact_emails = var.alert_email_addresses
  }

  notification {
    enabled        = true
    threshold      = 100.0
    operator       = "GreaterThan"
    contact_emails = var.alert_email_addresses
  }
}
