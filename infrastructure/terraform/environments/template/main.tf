# Main Template Configuration
# This template deploys the complete studio infrastructure stack

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  backend "azurerm" {
    # Backend configuration will be provided during deployment
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# Resource Group
module "resource_group" {
  source = "../../modules/resource-group"

  customer_prefix = var.customer_prefix
  project_name    = var.project_name
  environment     = var.environment
  location        = var.location
  additional_tags = var.additional_tags
}

# Networking
module "networking" {
  source = "../../modules/networking"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  enable_private_endpoints = var.enable_private_endpoints
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group]
}

# Security (Key Vault and Managed Identities)
module "security" {
  source = "../../modules/security"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  tenant_id              = var.tenant_id
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.key_vault] : []
  managed_identity_ids   = []
  cosmos_postgresql_connection_string = ""
  cosmos_mongodb_connection_string = ""
  storage_connection_string = ""
  azure_openai_api_key  = var.azure_openai_api_key
  azure_openai_endpoint = var.azure_openai_endpoint
  azure_ad_client_secret = var.azure_ad_client_secret
  storage_account_id     = ""
  cosmos_postgresql_cluster_id = ""
  cosmos_mongodb_cluster_id = ""
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# Cosmos DB PostgreSQL
module "cosmos_postgresql" {
  source = "../../modules/cosmos-postgresql"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  administrator_login_password = var.cosmos_postgresql_password
  coordinator_vcore_count = var.cosmos_postgresql_vcore_count
  node_count             = var.cosmos_postgresql_node_count
  enable_high_availability = var.enable_high_availability
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.cosmos_postgresql] : []
  app_service_subnet_prefix = module.networking.app_service_subnet_id
  app_role_password      = var.cosmos_postgresql_app_password
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# Cosmos DB MongoDB
module "cosmos_mongodb" {
  source = "../../modules/cosmos-mongodb"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  administrator_login_password = var.cosmos_mongodb_password
  sku_name               = var.cosmos_mongodb_sku
  disk_size_gb           = var.cosmos_mongodb_disk_size
  node_count             = var.cosmos_mongodb_node_count
  enable_high_availability = var.enable_high_availability
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.cosmos_mongodb] : []
  app_service_subnet_prefix = module.networking.app_service_subnet_id
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# Storage Account
module "storage_account" {
  source = "../../modules/storage-account"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  account_tier           = var.storage_account_tier
  account_replication_type = var.storage_account_replication
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.storage] : []
  enable_cors            = true
  cors_allowed_origins   = ["*"]
  cors_allowed_methods   = ["GET", "POST", "PUT", "DELETE", "HEAD"]
  cors_allowed_headers   = ["*"]
  user_files_container_name = "user-files"
  temp_files_container_name = "temp-files"
  enable_backup_container = var.enable_storage_backup
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# Container Registry
module "container_registry" {
  source = "../../modules/container-registry"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  sku                    = var.container_registry_sku
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.azure_services] : []
  enable_retention_policy = true
  retention_days         = var.backup_retention_days
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# AI Foundry (Azure OpenAI)
module "ai_foundry" {
  source = "../../modules/ai-foundry"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  openai_sku_name        = var.azure_openai_sku
  enable_private_endpoints = var.enable_private_endpoints
  private_endpoints_subnet_id = module.networking.private_endpoints_subnet_id
  private_dns_zone_ids   = var.enable_private_endpoints ? [module.networking.private_dns_zones.azure_services] : []
  deploy_gpt4            = var.deploy_gpt4
  deploy_gpt35           = var.deploy_gpt35
  deploy_embedding       = var.deploy_embedding
  gpt4_model_name        = var.gpt4_model_name
  gpt35_model_name       = var.gpt35_model_name
  embedding_model_name   = var.embedding_model_name
  gpt4_capacity          = var.gpt4_capacity
  gpt35_capacity         = var.gpt35_capacity
  embedding_capacity     = var.embedding_capacity
  enable_content_safety  = var.enable_content_safety
  enable_ai_search       = var.enable_ai_search
  tags                   = module.resource_group.resource_group_tags

  depends_on = [module.resource_group, module.networking]
}

# App Services (Frontend and Backend)
module "app_service" {
  source = "../../modules/app-service"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  app_service_plan_sku   = var.app_service_plan_sku
  enable_staging_slots   = var.enable_staging_slots
  cors_allowed_origins   = var.cors_allowed_origins
  backend_app_settings   = {
    "AZURE_OPENAI_API_KEY"     = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/azure-openai-api-key/)"
    "AZURE_OPENAI_ENDPOINT"    = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/azure-openai-endpoint/)"
    "AZURE_OPENAI_API_VERSION" = "2025-01-01-preview"
    "COSMOS_POSTGRESQL_CONNECTION" = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/cosmos-postgresql-connection/)"
    "COSMOS_MONGODB_CONNECTION" = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/cosmos-mongodb-connection/)"
    "STORAGE_ACCOUNT_CONNECTION" = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/storage-connection-string/)"
    "AZURE_AD_TENANT_ID"       = var.tenant_id
    "AZURE_AD_CLIENT_ID"       = var.azure_ad_client_id
    "AZURE_AD_CLIENT_SECRET"   = "@Microsoft.KeyVault(SecretUri=${module.security.key_vault_uri}secrets/azure-ad-client-secret/)"
    "COSMOS_DATABASE_NAME"     = module.cosmos_postgresql.database_name
    "COSMOS_COLLECTION_NAME"   = module.cosmos_mongodb.collection_name
    "PGHOST"                   = module.cosmos_postgresql.cluster_fqdn
    "PGDATABASE"               = module.cosmos_postgresql.database_name
    "PGUSER"                   = "citus"
    "PGPASSWORD"               = var.cosmos_postgresql_password
    "AZURE_STORAGE_ACCOUNT_NAME" = module.storage_account.storage_account_name
    "AZURE_STORAGE_CONTAINER_NAME" = "user-files"
    "APPINSIGHTS_INSTRUMENTATIONKEY" = module.app_service.backend_application_insights_key
  }
  frontend_app_settings  = {
    "NEXT_PUBLIC_BACKEND_SERVER_URL" = module.app_service.backend_app_service_url
    "NEXT_PUBLIC_SITE_URL"          = module.app_service.frontend_app_service_url
    "NEXT_PUBLIC_AZURE_AD_CLIENT_ID" = var.azure_ad_client_id
    "NEXT_PUBLIC_AZURE_AD_TENANT_ID" = var.tenant_id
    "NEXT_PUBLIC_AZURE_AD_REDIRECT_URI" = "${module.app_service.frontend_app_service_url}/auth/callback"
    "NEXT_PUBLIC_AZURE_AD_AUTHORITY" = "https://login.microsoftonline.com/${var.tenant_id}"
    "AZURE_STORAGE_ACCOUNT_NAME" = module.storage_account.storage_account_name
    "AZURE_STORAGE_CONTAINER_NAME" = "user-files"
    "APPINSIGHTS_INSTRUMENTATIONKEY" = module.app_service.frontend_application_insights_key
  }
  tags                   = module.resource_group.resource_group_tags

  depends_on = [
    module.resource_group, 
    module.networking, 
    module.security, 
    module.cosmos_postgresql, 
    module.cosmos_mongodb, 
    module.storage_account,
    module.ai_foundry
  ]
}

# Monitoring
module "monitoring" {
  source = "../../modules/monitoring"

  customer_prefix         = var.customer_prefix
  project_name           = var.project_name
  environment            = var.environment
  location               = var.location
  resource_group_name    = module.resource_group.resource_group_name
  resource_group_id      = module.resource_group.resource_group_id
  log_analytics_sku      = var.log_analytics_sku
  log_retention_days     = var.log_retention_days
  enable_container_insights = var.enable_container_insights
  enable_vm_insights     = var.enable_vm_insights
  alert_email_addresses  = var.alert_email_addresses
  alert_webhook_urls     = var.alert_webhook_urls
  enable_app_service_alerts = var.enable_app_service_alerts
  app_service_ids        = [module.app_service.backend_app_service_id, module.app_service.frontend_app_service_id]
  app_service_cpu_threshold = var.app_service_cpu_threshold
  app_service_memory_threshold = var.app_service_memory_threshold
  enable_database_alerts = var.enable_database_alerts
  database_ids           = [module.cosmos_postgresql.cluster_id, module.cosmos_mongodb.cluster_id]
  database_connections_threshold = var.database_connections_threshold
  enable_log_alerts      = var.enable_log_alerts
  application_errors_threshold = var.application_errors_threshold
  enable_diagnostic_settings = var.enable_diagnostic_settings
  backend_app_service_id = module.app_service.backend_app_service_id
  frontend_app_service_id = module.app_service.frontend_app_service_id
  enable_cost_alerts     = var.enable_cost_alerts
  monthly_budget_amount  = var.monthly_budget_amount
  tags                   = module.resource_group.resource_group_tags

  depends_on = [
    module.resource_group, 
    module.app_service, 
    module.cosmos_postgresql, 
    module.cosmos_mongodb
  ]
}
