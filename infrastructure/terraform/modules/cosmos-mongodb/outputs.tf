output "cluster_id" {
  description = "ID of the MongoDB cluster"
  value       = azurerm_cosmosdb_mongo_cluster.main.id
}

output "cluster_name" {
  description = "Name of the MongoDB cluster"
  value       = azurerm_cosmosdb_mongo_cluster.main.name
}

output "cluster_fqdn" {
  description = "FQDN of the MongoDB cluster"
  value       = azurerm_cosmosdb_mongo_cluster.main.fqdn
}

output "database_id" {
  description = "ID of the created database"
  value       = azurerm_cosmosdb_mongo_database.main.id
}

output "database_name" {
  description = "Name of the created database"
  value       = azurerm_cosmosdb_mongo_database.main.name
}

output "collection_id" {
  description = "ID of the created collection"
  value       = azurerm_cosmosdb_mongo_collection.main.id
}

output "collection_name" {
  description = "Name of the created collection"
  value       = azurerm_cosmosdb_mongo_collection.main.name
}

output "connection_string" {
  description = "Connection string for the MongoDB cluster"
  value       = "mongodb+srv://${azurerm_cosmosdb_mongo_cluster.main.administrator_login}@${azurerm_cosmosdb_mongo_cluster.main.name}.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000"
  sensitive   = true
}

output "connection_string_with_password" {
  description = "Connection string with password for the MongoDB cluster"
  value       = "mongodb+srv://${azurerm_cosmosdb_mongo_cluster.main.administrator_login}:${var.administrator_login_password}@${azurerm_cosmosdb_mongo_cluster.main.name}.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000"
  sensitive   = true
}

output "private_endpoint_id" {
  description = "ID of the private endpoint (if enabled)"
  value       = var.enable_private_endpoints ? azurerm_private_endpoint.mongodb[0].id : null
}

output "firewall_rule_id" {
  description = "ID of the firewall rule (if private endpoints not enabled)"
  value       = var.enable_private_endpoints ? null : azurerm_cosmosdb_mongo_cluster_firewall_rule.app_service[0].id
}

output "backup_policy_id" {
  description = "ID of the backup policy (if enabled)"
  value       = var.enable_backup ? azurerm_backup_policy_vm.mongodb_backup[0].id : null
}

output "node_configuration" {
  description = "Configuration of the MongoDB cluster nodes"
  value = {
    sku_name     = azurerm_cosmosdb_mongo_cluster_node.main.sku_name
    disk_size_gb = azurerm_cosmosdb_mongo_cluster_node.main.disk_size_gb
    node_count   = azurerm_cosmosdb_mongo_cluster_node.main.node_count
  }
}
