# App Service Module
# Creates App Service Plan and two App Services (frontend and backend)

# App Service Plan
resource "azurerm_service_plan" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-plan"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.app_service_plan_sku

  tags = var.tags
}

# Backend App Service (FastAPI)
resource "azurerm_linux_web_app" "backend" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-backend"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  site_config {
    application_stack {
      python_version = "3.11"
    }
    
    always_on = true
    
    # Health check
    health_check_path = "/health"
    
    # CORS settings
    cors {
      allowed_origins = var.cors_allowed_origins
      support_credentials = true
    }
    
    # App settings
    application_stack {
      python_version = "3.11"
    }
  }

  # App settings from Key Vault
  dynamic "app_settings" {
    for_each = var.backend_app_settings
    content {
      name  = app_settings.key
      value = app_settings.value
    }
  }

  # Identity
  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# Frontend App Service (NextJS)
resource "azurerm_linux_web_app" "frontend" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-frontend"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  site_config {
    application_stack {
      node_version = "20"
    }
    
    always_on = true
    
    # Health check
    health_check_path = "/"
    
    # CORS settings
    cors {
      allowed_origins = var.cors_allowed_origins
      support_credentials = true
    }
    
    # App settings
    application_stack {
      node_version = "20"
    }
  }

  # App settings from Key Vault
  dynamic "app_settings" {
    for_each = var.frontend_app_settings
    content {
      name  = app_settings.key
      value = app_settings.value
    }
  }

  # Identity
  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# Staging slots for backend
resource "azurerm_linux_web_app_slot" "backend_staging" {
  count          = var.enable_staging_slots ? 1 : 0
  name           = "staging"
  app_service_id = azurerm_linux_web_app.backend.id

  site_config {
    application_stack {
      python_version = "3.11"
    }
    
    always_on = true
    health_check_path = "/health"
  }

  # Copy app settings from main app
  app_settings = var.backend_app_settings

  tags = var.tags
}

# Staging slots for frontend
resource "azurerm_linux_web_app_slot" "frontend_staging" {
  count          = var.enable_staging_slots ? 1 : 0
  name           = "staging"
  app_service_id = azurerm_linux_web_app.frontend.id

  site_config {
    application_stack {
      node_version = "20"
    }
    
    always_on = true
    health_check_path = "/"
  }

  # Copy app settings from main app
  app_settings = var.frontend_app_settings

  tags = var.tags
}

# Application Insights for Backend
resource "azurerm_application_insights" "backend" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-backend-ai"
  resource_group_name = var.resource_group_name
  location            = var.location
  application_type    = "web"

  tags = var.tags
}

# Application Insights for Frontend
resource "azurerm_application_insights" "frontend" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-frontend-ai"
  resource_group_name = var.resource_group_name
  location            = var.location
  application_type    = "web"

  tags = var.tags
}

# Link Application Insights to App Services
resource "azurerm_app_service_analytics_item" "backend_analytics" {
  name                    = "analytics"
  resource_group_name     = var.resource_group_name
  application_insights_id = azurerm_application_insights.backend.id
  item_type               = "query"
  content                 = "requests | where timestamp > ago(1h) | summarize count() by bin(timestamp, 1m)"
}

resource "azurerm_app_service_analytics_item" "frontend_analytics" {
  name                    = "analytics"
  resource_group_name     = var.resource_group_name
  application_insights_id = azurerm_application_insights.frontend.id
  item_type               = "query"
  content                 = "requests | where timestamp > ago(1h) | summarize count() by bin(timestamp, 1m)"
}
