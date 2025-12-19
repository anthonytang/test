# Networking Module
# Creates virtual network, subnets, and network security groups

resource "azurerm_virtual_network" "main" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-vnet"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = var.address_space

  tags = var.tags
}

# Subnet for App Services
resource "azurerm_subnet" "app_service" {
  name                 = "app-service-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.app_service_subnet_prefix

  delegation {
    name = "app-service-delegation"
    
    service_delegation {
      name    = "Microsoft.Web/serverFarms"
      actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
    }
  }
}

# Subnet for Private Endpoints
resource "azurerm_subnet" "private_endpoints" {
  name                 = "private-endpoints-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.private_endpoints_subnet_prefix

  private_endpoint_network_policies_enabled = true
}

# Subnet for Databases (if private endpoints are enabled)
resource "azurerm_subnet" "databases" {
  count                = var.enable_private_endpoints ? 1 : 0
  name                 = "databases-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.databases_subnet_prefix

  private_endpoint_network_policies_enabled = true
}

# Network Security Group for App Services
resource "azurerm_network_security_group" "app_service" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-app-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = var.tags
}

# Security rule for HTTPS inbound
resource "azurerm_network_security_rule" "app_service_https" {
  name                        = "AllowHTTPSInbound"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "443"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.app_service.name
}

# Security rule for HTTP inbound (redirects to HTTPS)
resource "azurerm_network_security_rule" "app_service_http" {
  name                        = "AllowHTTPInbound"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "80"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.app_service.name
}

# Security rule for API communication between frontend and backend
resource "azurerm_network_security_rule" "app_service_api" {
  name                        = "AllowAPICommunication"
  priority                    = 120
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "8000"
  source_address_prefix       = var.app_service_subnet_prefix[0]
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.app_service.name
}

# Associate NSG with App Service subnet
resource "azurerm_subnet_network_security_group_association" "app_service" {
  subnet_id                 = azurerm_subnet.app_service.id
  network_security_group_id = azurerm_network_security_group.app_service.id
}

# Private DNS Zone for Azure Services
resource "azurerm_private_dns_zone" "azure_services" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "privatelink.azurewebsites.net"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

resource "azurerm_private_dns_zone" "cosmos_postgresql" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "privatelink.postgres.cosmos.azure.com"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

resource "azurerm_private_dns_zone" "cosmos_mongodb" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "privatelink.mongo.cosmos.azure.com"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

resource "azurerm_private_dns_zone" "storage" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

resource "azurerm_private_dns_zone" "key_vault" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "privatelink.vaultcore.azure.net"
  resource_group_name = var.resource_group_name

  tags = var.tags
}

# Link private DNS zones to virtual network
resource "azurerm_private_dns_zone_virtual_network_link" "azure_services" {
  count                 = var.enable_private_endpoints ? 1 : 0
  name                  = "azure-services-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.azure_services[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "cosmos_postgresql" {
  count                 = var.enable_private_endpoints ? 1 : 0
  name                  = "cosmos-postgresql-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.cosmos_postgresql[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "cosmos_mongodb" {
  count                 = var.enable_private_endpoints ? 1 : 0
  name                  = "cosmos-mongodb-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.cosmos_mongodb[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "storage" {
  count                 = var.enable_private_endpoints ? 1 : 0
  name                  = "storage-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.storage[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "key_vault" {
  count                 = var.enable_private_endpoints ? 1 : 0
  name                  = "key-vault-link"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.key_vault[0].name
  virtual_network_id    = azurerm_virtual_network.main.id

  tags = var.tags
}
