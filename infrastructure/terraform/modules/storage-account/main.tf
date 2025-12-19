# Storage Account Module
# Creates Azure Storage Account with proper configuration

resource "azurerm_storage_account" "main" {
  name                     = "${var.customer_prefix}${var.project_name}${var.environment}sa"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = var.account_tier
  account_replication_type = var.account_replication_type
  account_kind             = var.account_kind

  # Enable blob public access for frontend
  allow_nested_items_to_be_public = var.allow_public_access

  # Enable versioning
  versioning_enabled = var.enable_versioning

  # Enable change feed
  change_feed_enabled = var.enable_change_feed

  # Enable soft delete
  dynamic "blob_properties" {
    for_each = var.enable_soft_delete ? [1] : []
    content {
      delete_retention_policy {
        days = var.soft_delete_retention_days
      }
      
      versioning_enabled = var.enable_versioning
      change_feed_enabled = var.enable_change_feed
    }
  }

  # CORS rules for frontend access
  dynamic "blob_properties" {
    for_each = var.enable_cors ? [1] : []
    content {
      cors_rule {
        allowed_headers    = var.cors_allowed_headers
        allowed_methods    = var.cors_allowed_methods
        allowed_origins    = var.cors_allowed_origins
        exposed_headers    = var.cors_exposed_headers
        max_age_in_seconds = var.cors_max_age_in_seconds
      }
    }
  }

  # Network rules
  dynamic "network_rules" {
    for_each = var.enable_private_endpoints ? [1] : []
    content {
      default_action             = "Deny"
      bypass                     = ["AzureServices"]
      ip_rules                   = var.allowed_ip_ranges
      virtual_network_subnet_ids = var.allowed_subnet_ids
    }
  }

  # Lifecycle management
  dynamic "blob_properties" {
    for_each = var.enable_lifecycle_management ? [1] : []
    content {
      delete_retention_policy {
        days = var.soft_delete_retention_days
      }
      
      versioning_enabled = var.enable_versioning
      change_feed_enabled = var.enable_change_feed
      
      dynamic "container_delete_retention_policy" {
        for_each = var.container_soft_delete_retention_days > 0 ? [1] : []
        content {
          days = var.container_soft_delete_retention_days
        }
      }
    }
  }

  tags = var.tags
}

# Storage containers
resource "azurerm_storage_container" "user_files" {
  name                  = var.user_files_container_name
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = var.user_files_access_type
}

resource "azurerm_storage_container" "temp_files" {
  name                  = var.temp_files_container_name
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = var.temp_files_access_type
}

resource "azurerm_storage_container" "backups" {
  count                 = var.enable_backup_container ? 1 : 0
  name                  = var.backup_container_name
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# Private endpoint (if enabled)
resource "azurerm_private_endpoint" "storage" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-storage-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "storage-psc"
    private_connection_resource_id = azurerm_storage_account.main.id
    is_manual_connection           = false
    subresource_names              = ["blob"]
  }

  private_dns_zone_group {
    name                 = "storage-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Lifecycle management policy
resource "azurerm_storage_management_policy" "main" {
  count              = var.enable_lifecycle_management ? 1 : 0
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "lifecycle-rule"
    enabled = true

    filters {
      prefix_match = var.lifecycle_prefix_match
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = var.tier_to_cool_after_days
        tier_to_archive_after_days_since_modification_greater_than = var.tier_to_archive_after_days
        delete_after_days_since_modification_greater_than          = var.delete_after_days
      }
    }
  }
}

# Storage account access key rotation
resource "azurerm_storage_account_customer_managed_key" "main" {
  count               = var.enable_customer_managed_key ? 1 : 0
  storage_account_id  = azurerm_storage_account.main.id
  key_vault_id        = var.key_vault_id
  key_name            = var.key_name
  key_version         = var.key_version
}
