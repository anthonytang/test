# Security Module
# Creates Key Vault, Managed Identities, and RBAC assignments

# Key Vault
resource "azurerm_key_vault" "main" {
  name                        = "${var.customer_prefix}-${var.project_name}-${var.environment}-kv"
  location                    = var.location
  resource_group_name         = var.resource_group_name
  enabled_for_disk_encryption = true
  tenant_id                   = var.tenant_id
  soft_delete_retention_days  = var.soft_delete_retention_days
  purge_protection_enabled    = var.purge_protection_enabled
  sku_name                   = var.key_vault_sku

  # Network rules
  dynamic "network_acls" {
    for_each = var.enable_private_endpoints ? [1] : []
    content {
      default_action = "Deny"
      bypass         = "AzureServices"
    }
  }

  # Access policies for managed identities
  dynamic "access_policy" {
    for_each = var.managed_identity_ids
    content {
      tenant_id = var.tenant_id
      object_id = access_policy.value

      key_permissions = [
        "Get", "List", "Create", "Delete", "Update", "Import", "Backup", "Restore", "Recover"
      ]

      secret_permissions = [
        "Get", "List", "Set", "Delete", "Backup", "Restore", "Recover"
      ]

      certificate_permissions = [
        "Get", "List", "Create", "Delete", "Update", "Import", "Backup", "Restore", "Recover"
      ]

      storage_permissions = [
        "Get", "List", "Set", "Delete", "Backup", "Restore", "Recover"
      ]
    }
  }

  tags = var.tags
}

# Private endpoint for Key Vault (if enabled)
resource "azurerm_private_endpoint" "key_vault" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-kv-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "key-vault-psc"
    private_connection_resource_id = azurerm_key_vault.main.id
    is_manual_connection           = false
    subresource_names              = ["vault"]
  }

  private_dns_zone_group {
    name                 = "key-vault-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Managed Identity for App Services
resource "azurerm_user_assigned_identity" "app_services" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-app-mi"
  resource_group_name = var.resource_group_name
  location            = var.location

  tags = var.tags
}

# Key Vault secrets for application configuration
resource "azurerm_key_vault_secret" "cosmos_postgresql_connection" {
  name         = "cosmos-postgresql-connection"
  value        = var.cosmos_postgresql_connection_string
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "cosmos_mongodb_connection" {
  name         = "cosmos-mongodb-connection"
  value        = var.cosmos_mongodb_connection_string
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "storage_connection_string" {
  name         = "storage-connection-string"
  value        = var.storage_connection_string
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "azure_openai_api_key" {
  name         = "azure-openai-api-key"
  value        = var.azure_openai_api_key
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "azure_openai_endpoint" {
  name         = "azure-openai-endpoint"
  value        = var.azure_openai_endpoint
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_key_vault_secret" "azure_ad_client_secret" {
  name         = "azure-ad-client-secret"
  value        = var.azure_ad_client_secret
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

# RBAC assignments for managed identities
resource "azurerm_role_assignment" "app_services_storage_blob_data_contributor" {
  scope                = var.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app_services.principal_id
}

resource "azurerm_role_assignment" "app_services_key_vault_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app_services.principal_id
}

resource "azurerm_role_assignment" "app_services_cosmos_data_contributor" {
  count                = var.cosmos_postgresql_cluster_id != "" ? 1 : 0
  scope                = var.cosmos_postgresql_cluster_id
  role_definition_name = "Cosmos DB Built-in Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app_services.principal_id
}

resource "azurerm_role_assignment" "app_services_cosmos_mongodb_data_contributor" {
  count                = var.cosmos_mongodb_cluster_id != "" ? 1 : 0
  scope                = var.cosmos_mongodb_cluster_id
  role_definition_name = "Cosmos DB Built-in Data Contributor"
  principal_id         = azurerm_user_assigned_identity.app_services.principal_id
}

# Key Vault access policy for App Services managed identity
resource "azurerm_key_vault_access_policy" "app_services" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = var.tenant_id
  object_id    = azurerm_user_assigned_identity.app_services.principal_id

  key_permissions = [
    "Get", "List"
  ]

  secret_permissions = [
    "Get", "List"
  ]

  certificate_permissions = [
    "Get", "List"
  ]
}
