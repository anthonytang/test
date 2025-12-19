# Template Outputs
# Important information and URLs after deployment

output "resource_group_name" {
  description = "Name of the created resource group"
  value       = module.resource_group.resource_group_name
}

output "resource_group_id" {
  description = "ID of the created resource group"
  value       = module.resource_group.resource_group_id
}

output "resource_group_location" {
  description = "Location of the created resource group"
  value       = module.resource_group.resource_group_location
}

# =============================================================================
# APPLICATION ENDPOINTS
# =============================================================================

output "frontend_url" {
  description = "Frontend application URL"
  value       = module.app_service.frontend_app_service_url
}

output "backend_url" {
  description = "Backend API URL"
  value       = module.app_service.backend_app_service_url
}

output "frontend_staging_url" {
  description = "Frontend staging slot URL (if enabled)"
  value       = var.enable_staging_slots ? "${module.app_service.frontend_app_service_url}-staging" : "Staging slots not enabled"
}

output "backend_staging_url" {
  description = "Backend staging slot URL (if enabled)"
  value       = var.enable_staging_slots ? "${module.app_service.backend_app_service_url}-staging" : "Staging slots not enabled"
}

# =============================================================================
# DATABASE CONNECTION INFORMATION
# =============================================================================

output "cosmos_postgresql_cluster_name" {
  description = "Cosmos DB PostgreSQL cluster name"
  value       = module.cosmos_postgresql.cluster_name
}

output "cosmos_postgresql_fqdn" {
  description = "Cosmos DB PostgreSQL FQDN"
  value       = module.cosmos_postgresql.cluster_fqdn
}

output "cosmos_postgresql_database_name" {
  description = "Cosmos DB PostgreSQL database name"
  value       = module.cosmos_postgresql.database_name
}

output "cosmos_mongodb_cluster_name" {
  description = "Cosmos DB MongoDB cluster name"
  value       = module.cosmos_mongodb.cluster_name
}

output "cosmos_mongodb_fqdn" {
  description = "Cosmos DB MongoDB FQDN"
  value       = module.cosmos_mongodb.cluster_fqdn
}

output "cosmos_mongodb_database_name" {
  description = "Cosmos DB MongoDB database name"
  value       = module.cosmos_mongodb.database_name
}

output "cosmos_mongodb_collection_name" {
  description = "Cosmos DB MongoDB collection name"
  value       = module.cosmos_mongodb.collection_name
}

# =============================================================================
# STORAGE INFORMATION
# =============================================================================

output "storage_account_name" {
  description = "Storage account name"
  value       = module.storage_account.storage_account_name
}

output "storage_account_id" {
  description = "Storage account ID"
  value       = module.storage_account.storage_account_id
}

output "user_files_container_name" {
  description = "User files container name"
  value       = "user-files"
}

output "temp_files_container_name" {
  description = "Temporary files container name"
  value       = "temp-files"
}

# =============================================================================
# CONTAINER REGISTRY INFORMATION
# =============================================================================

output "container_registry_name" {
  description = "Container registry name"
  value       = module.container_registry.container_registry_name
}

output "container_registry_id" {
  description = "Container registry ID"
  value       = module.container_registry.container_registry_id
}

output "container_registry_login_server" {
  description = "Container registry login server"
  value       = module.container_registry.container_registry_login_server
}

# =============================================================================
# AI FOUNDRY INFORMATION
# =============================================================================

output "azure_openai_name" {
  description = "Azure OpenAI service name"
  value       = module.ai_foundry.azure_openai_name
}

output "azure_openai_endpoint" {
  description = "Azure OpenAI endpoint"
  value       = module.ai_foundry.azure_openai_endpoint
}

output "gpt4_deployment_name" {
  description = "GPT-4 deployment name (if enabled)"
  value       = var.deploy_gpt4 ? "gpt-4" : "GPT-4 not deployed"
}

output "gpt35_deployment_name" {
  description = "GPT-3.5 Turbo deployment name (if enabled)"
  value       = var.deploy_gpt35 ? "gpt-35-turbo" : "GPT-3.5 Turbo not deployed"
}

output "embedding_deployment_name" {
  description = "Embedding model deployment name (if enabled)"
  value       = var.deploy_embedding ? "text-embedding-ada-002" : "Embedding model not deployed"
}

# =============================================================================
# SECURITY INFORMATION
# =============================================================================

output "key_vault_name" {
  description = "Key Vault name"
  value       = module.security.key_vault_name
}

output "key_vault_id" {
  description = "Key Vault ID"
  value       = module.security.key_vault_id
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = module.security.key_vault_uri
}

output "managed_identity_name" {
  description = "Managed identity name for App Services"
  value       = module.security.managed_identity_name
}

output "managed_identity_id" {
  description = "Managed identity ID for App Services"
  value       = module.security.managed_identity_id
}

# =============================================================================
# MONITORING INFORMATION
# =============================================================================

output "log_analytics_workspace_name" {
  description = "Log Analytics workspace name"
  value       = module.monitoring.log_analytics_workspace_name
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = module.monitoring.log_analytics_workspace_id
}

output "backend_application_insights_name" {
  description = "Backend Application Insights name"
  value       = module.app_service.backend_application_insights_name
}

output "frontend_application_insights_name" {
  description = "Frontend Application Insights name"
  value       = module.app_service.frontend_application_insights_name
}

output "action_group_name" {
  description = "Monitoring action group name"
  value       = module.monitoring.action_group_name
}

# =============================================================================
# NETWORKING INFORMATION
# =============================================================================

output "virtual_network_name" {
  description = "Virtual network name"
  value       = module.networking.virtual_network_name
}

output "virtual_network_id" {
  description = "Virtual network ID"
  value       = module.networking.virtual_network_id
}

output "app_service_subnet_id" {
  description = "App Service subnet ID"
  value       = module.networking.app_service_subnet_id
}

output "private_endpoints_subnet_id" {
  description = "Private endpoints subnet ID"
  value       = module.networking.private_endpoints_subnet_id
}

output "private_endpoints_enabled" {
  description = "Whether private endpoints are enabled"
  value       = var.enable_private_endpoints
}

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================

output "deployment_summary" {
  description = "Summary of the deployed infrastructure"
  value = {
    customer_prefix = var.customer_prefix
    project_name    = var.project_name
    environment     = var.environment
    location        = var.location
    deployment_date = formatdate("YYYY-MM-DD HH:mm:ss", timestamp())
    
    resources = {
      resource_group     = module.resource_group.resource_group_name
      app_services       = 2
      databases          = 2
      storage_account    = module.storage_account.storage_account_name
      container_registry = module.container_registry.container_registry_name
      key_vault         = module.security.key_vault_name
      monitoring        = "enabled"
    }
    
    endpoints = {
      frontend = module.app_service.frontend_app_service_url
      backend  = module.app_service.backend_app_service_url
    }
    
    security = {
      private_endpoints = var.enable_private_endpoints
      managed_identities = "enabled"
      key_vault_secrets = "configured"
    }
    
    monitoring = {
      application_insights = "enabled"
      log_analytics       = "enabled"
      alerts              = "configured"
      cost_management     = var.enable_cost_alerts ? "enabled" : "disabled"
    }
  }
}

# =============================================================================
# NEXT STEPS
# =============================================================================

output "next_steps" {
  description = "Next steps after deployment"
  value = [
    "1. Configure Azure AD app registration redirect URIs:",
    "   - Frontend: ${module.app_service.frontend_app_service_url}/auth/callback",
    "   - Backend: ${module.app_service.backend_app_service_url}",
    "",
    "2. Update DNS records if using custom domains",
    "",
    "3. Configure CI/CD pipelines for container deployments",
    "   - Container Registry: ${module.container_registry.container_registry_login_server}",
    "",
    "4. Set up monitoring dashboards in Azure Portal",
    "   - Application Insights: ${module.app_service.backend_application_insights_name}",
    "   - Log Analytics: ${module.monitoring.log_analytics_workspace_name}",
    "",
    "5. Test application functionality:",
    "   - Frontend: ${module.app_service.frontend_app_service_url}",
    "   - Backend API: ${module.app_service.backend_app_service_url}",
    "",
    "6. Review security settings and network rules",
    "",
    "7. Configure backup schedules and retention policies",
    "",
    "8. Set up cost alerts and budget monitoring"
  ]
}
