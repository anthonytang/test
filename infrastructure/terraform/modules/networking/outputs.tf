output "virtual_network_id" {
  description = "ID of the virtual network"
  value       = azurerm_virtual_network.main.id
}

output "virtual_network_name" {
  description = "Name of the virtual network"
  value       = azurerm_virtual_network.main.name
}

output "app_service_subnet_id" {
  description = "ID of the App Service subnet"
  value       = azurerm_subnet.app_service.id
}

output "private_endpoints_subnet_id" {
  description = "ID of the Private Endpoints subnet"
  value       = azurerm_subnet.private_endpoints.id
}

output "databases_subnet_id" {
  description = "ID of the Databases subnet (if enabled)"
  value       = var.enable_private_endpoints ? azurerm_subnet.databases[0].id : null
}

output "network_security_group_id" {
  description = "ID of the App Service network security group"
  value       = azurerm_network_security_group.app_service.id
}

output "private_dns_zones" {
  description = "Private DNS zones created (if private endpoints enabled)"
  value = var.enable_private_endpoints ? {
    azure_services   = azurerm_private_dns_zone.azure_services[0].id
    cosmos_postgresql = azurerm_private_dns_zone.cosmos_postgresql[0].id
    cosmos_mongodb    = azurerm_private_dns_zone.cosmos_mongodb[0].id
    storage           = azurerm_private_dns_zone.storage[0].id
    key_vault         = azurerm_private_dns_zone.key_vault[0].id
  } : {}
}
