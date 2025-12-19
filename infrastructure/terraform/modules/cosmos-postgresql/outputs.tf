output "cluster_id" {
  description = "ID of the PostgreSQL cluster"
  value       = azurerm_cosmosdb_postgresql_cluster.main.id
}

output "cluster_name" {
  description = "Name of the PostgreSQL cluster"
  value       = azurerm_cosmosdb_postgresql_cluster.main.name
}

output "cluster_fqdn" {
  description = "FQDN of the PostgreSQL cluster"
  value       = azurerm_cosmosdb_postgresql_cluster.main.fqdn
}

output "database_id" {
  description = "ID of the created database"
  value       = azurerm_cosmosdb_postgresql_database.main.id
}

output "database_name" {
  description = "Name of the created database"
  value       = azurerm_cosmosdb_postgresql_database.main.name
}

output "connection_string" {
  description = "Connection string for the PostgreSQL cluster"
  value       = "postgresql://${azurerm_cosmosdb_postgresql_cluster.main.administrator_login}@${azurerm_cosmosdb_postgresql_cluster.main.fqdn}:5432/${azurerm_cosmosdb_postgresql_database.main.name}"
  sensitive   = true
}

output "connection_string_with_password" {
  description = "Connection string with password for the PostgreSQL cluster"
  value       = "postgresql://${azurerm_cosmosdb_postgresql_cluster.main.administrator_login}:${var.administrator_login_password}@${azurerm_cosmosdb_postgresql_cluster.main.fqdn}:5432/${azurerm_cosmosdb_postgresql_database.main.name}"
  sensitive   = true
}

output "app_role_connection_string" {
  description = "Connection string for the application role (if created)"
  value       = var.create_app_role ? "postgresql://${var.app_role_name}:${var.app_role_password}@${azurerm_cosmosdb_postgresql_cluster.main.fqdn}:5432/${azurerm_cosmosdb_postgresql_database.main.name}" : null
  sensitive   = true
}

output "private_endpoint_id" {
  description = "ID of the private endpoint (if enabled)"
  value       = var.enable_private_endpoints ? azurerm_private_endpoint.postgresql[0].id : null
}

output "firewall_rule_id" {
  description = "ID of the firewall rule (if private endpoints not enabled)"
  value       = var.enable_private_endpoints ? null : azurerm_cosmosdb_postgresql_firewall_rule.app_service[0].id
}

output "backup_policy_id" {
  description = "ID of the backup policy (if enabled)"
  value       = var.enable_backup ? azurerm_backup_policy_vm.postgresql_backup[0].id : null
}
