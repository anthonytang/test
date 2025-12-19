# Container Registry Module
# Creates Azure Container Registry with proper configuration

resource "azurerm_container_registry" "main" {
  name                = "${var.customer_prefix}${var.project_name}${var.environment}acr"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.sku
  admin_enabled       = var.admin_enabled

  # Georeplications for premium tier
  dynamic "georeplications" {
    for_each = var.sku == "Premium" ? var.georeplication_locations : []
    content {
      location                  = georeplications.value
      zone_redundancy_enabled  = var.zone_redundancy_enabled
      regional_endpoint_enabled = var.regional_endpoint_enabled
    }
  }

  # Network rule set for private endpoints
  dynamic "network_rule_set" {
    for_each = var.enable_private_endpoints ? [1] : []
    content {
      default_action = "Deny"
      
      dynamic "ip_rule" {
        for_each = var.allowed_ip_ranges
        content {
          action   = "Allow"
          ip_range = ip_rule.value
        }
      }
    }
  }

  # Retention policy
  dynamic "retention_policy" {
    for_each = var.enable_retention_policy ? [1] : []
    content {
      days    = var.retention_days
      enabled = true
    }
  }

  # Trust policy for signed images
  dynamic "trust_policy" {
    for_each = var.enable_trust_policy ? [1] : []
    content {
      enabled = true
    }
  }

  tags = var.tags
}

# Private endpoint (if enabled)
resource "azurerm_private_endpoint" "acr" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-acr-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "acr-psc"
    private_connection_resource_id = azurerm_container_registry.main.id
    is_manual_connection           = false
    subresource_names              = ["registry"]
  }

  private_dns_zone_group {
    name                 = "acr-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Webhook for CI/CD (if enabled)
resource "azurerm_container_registry_webhook" "main" {
  count               = var.enable_webhooks ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-acr-webhook"
  resource_group_name = var.resource_group_name
  registry_name       = azurerm_container_registry.main.name
  location            = var.location

  service_uri = var.webhook_service_uri

  actions = var.webhook_actions

  dynamic "custom_headers" {
    for_each = var.webhook_custom_headers
    content {
      name  = custom_headers.key
      value = custom_headers.value
    }
  }

  tags = var.tags
}

# Scope map for repository permissions
resource "azurerm_container_registry_scope_map" "pull" {
  count               = var.create_scope_maps ? 1 : 0
  name                = "pull-repositories"
  resource_group_name = var.resource_group_name
  registry_name       = azurerm_container_registry.main.name
  actions = [
    "repositories/repo1/content/read",
    "repositories/repo2/content/read"
  ]

  tags = var.tags
}

resource "azurerm_container_registry_scope_map" "push" {
  count               = var.create_scope_maps ? 1 : 0
  name                = "push-repositories"
  resource_group_name = var.resource_group_name
  registry_name       = azurerm_container_registry.main.name
  actions = [
    "repositories/repo1/content/write",
    "repositories/repo2/content/write"
  ]

  tags = var.tags
}

# Token for authentication
resource "azurerm_container_registry_token" "main" {
  count               = var.create_tokens ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-acr-token"
  resource_group_name = var.resource_group_name
  registry_name       = azurerm_container_registry.main.name

  scope_map_id = azurerm_container_registry_scope_map.pull[0].id

  tags = var.tags
}
