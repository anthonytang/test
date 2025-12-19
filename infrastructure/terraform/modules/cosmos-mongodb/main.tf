# Cosmos DB MongoDB vCore Module
# Creates Azure Cosmos DB for MongoDB vCore with proper configuration

resource "azurerm_cosmosdb_mongo_cluster" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-mongodb"
  resource_group_name = var.resource_group_name
  location            = var.location

  administrator_login_password = var.administrator_login_password

  tags = var.tags
}

# MongoDB cluster node
resource "azurerm_cosmosdb_mongo_cluster_node" "main" {
  name                = "node-1"
  mongo_cluster_id    = azurerm_cosmosdb_mongo_cluster.main.id
  sku_name            = var.sku_name
  disk_size_gb        = var.disk_size_gb
  node_count          = var.node_count

  # High availability configuration
  dynamic "zone" {
    for_each = var.enable_high_availability ? [1, 2, 3] : [1]
    content {
      zone_name = "zone-${zone.value}"
    }
  }
}

# Database creation
resource "azurerm_cosmosdb_mongo_database" "main" {
  name                = var.database_name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_mongo_cluster.main.name
}

# Collection creation
resource "azurerm_cosmosdb_mongo_collection" "main" {
  name                = var.collection_name
  resource_group_name = var.resource_group_name
  account_name        = azurerm_cosmosdb_mongo_cluster.main.name
  database_name       = azurerm_cosmosdb_mongo_database.main.name

  # Vector search index configuration
  dynamic "index" {
    for_each = var.enable_vector_search ? [1] : []
    content {
      keys   = ["embedding"]
      unique = false
      # Note: Vector index must be created via Azure Portal or MongoDB Compass
      # with cosmosSearch options
    }
  }

  # Shard key for distributed collections
  dynamic "shard_key" {
    for_each = var.enable_sharding ? [1] : []
    content {
      shard_key = "user_id"
    }
  }
}

# Private endpoint (if enabled)
resource "azurerm_private_endpoint" "mongodb" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-mongodb-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "mongodb-psc"
    private_connection_resource_id = azurerm_cosmosdb_mongo_cluster.main.id
    is_manual_connection           = false
    subresource_names              = ["mongodbServer"]
  }

  private_dns_zone_group {
    name                 = "mongodb-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Firewall rule for App Services (if private endpoints not enabled)
resource "azurerm_cosmosdb_mongo_cluster_firewall_rule" "app_service" {
  count              = var.enable_private_endpoints ? 0 : 1
  name               = "allow-app-service"
  mongo_cluster_id   = azurerm_cosmosdb_mongo_cluster.main.id
  start_ip_address   = var.app_service_subnet_prefix
  end_ip_address     = var.app_service_subnet_prefix
}

# Backup policy
resource "azurerm_backup_policy_vm" "mongodb_backup" {
  count               = var.enable_backup ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-mongodb-backup"
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
