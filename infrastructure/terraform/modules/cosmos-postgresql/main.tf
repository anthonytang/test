# Cosmos DB PostgreSQL Module
# Creates Azure Cosmos DB for PostgreSQL with proper configuration

resource "azurerm_cosmosdb_postgresql_cluster" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-postgresql"
  resource_group_name = var.resource_group_name
  location            = var.location

  administrator_login_password = var.administrator_login_password
  coordinator_storage_quota_in_mb = var.coordinator_storage_quota_in_mb
  coordinator_vcore_count         = var.coordinator_vcore_count
  node_count                      = var.node_count

  # High availability configuration
  dynamic "coordinator_public_ip_access_enabled" {
    for_each = var.enable_high_availability ? [true] : []
    content {
      enabled = false
    }
  }

  # Private endpoint configuration
  dynamic "coordinator_public_ip_access_enabled" {
    for_each = var.enable_private_endpoints ? [true] : []
    content {
      enabled = false
    }
  }

  tags = var.tags
}

# Database creation
resource "azurerm_cosmosdb_postgresql_database" "main" {
  name                = var.database_name
  cluster_id          = azurerm_cosmosdb_postgresql_cluster.main.id
  charset             = "UTF8"
  collation           = "en_US.utf8"
}

# Firewall rule for App Services (if private endpoints not enabled)
resource "azurerm_cosmosdb_postgresql_firewall_rule" "app_service" {
  count              = var.enable_private_endpoints ? 0 : 1
  name               = "allow-app-service"
  cluster_id         = azurerm_cosmosdb_postgresql_cluster.main.id
  start_ip_address   = var.app_service_subnet_prefix
  end_ip_address     = var.app_service_subnet_prefix
}

# Private endpoint (if enabled)
resource "azurerm_private_endpoint" "postgresql" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-postgresql-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "postgresql-psc"
    private_connection_resource_id = azurerm_cosmosdb_postgresql_cluster.main.id
    is_manual_connection           = false
    subresource_names              = ["postgresqlServer"]
  }

  private_dns_zone_group {
    name                 = "postgresql-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Database initialization script (if provided)
resource "azurerm_cosmosdb_postgresql_role" "app_role" {
  count      = var.create_app_role ? 1 : 0
  name       = var.app_role_name
  cluster_id = azurerm_cosmosdb_postgresql_cluster.main.id
  password   = var.app_role_password

  tags = var.tags
}

# Backup policy
resource "azurerm_backup_policy_vm" "postgresql_backup" {
  count               = var.enable_backup ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-postgresql-backup"
  resource_group_name = var.resource_group_name
  recovery_vault_name = var.recovery_vault_name

  backup {
    frequency = "Daily"
    time      = "23:00"
  }

  retention_daily {
    count = var.backup_retention_days
  }

  tags = var.tags
}
