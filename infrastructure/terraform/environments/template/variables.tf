# Template Variables
# All configurable parameters for the studio infrastructure deployment

# Customer and Project Configuration
variable "customer_prefix" {
  description = "Customer prefix for resource naming (3-10 characters, alphanumeric)"
  type        = string
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9]{3,10}$", var.customer_prefix))
    error_message = "Customer prefix must be 3-10 alphanumeric characters."
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "studio"
  
  validation {
    condition     = length(var.project_name) > 0 && length(var.project_name) <= 20
    error_message = "Project name must be between 1 and 20 characters."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "eastus"
  
  validation {
    condition     = contains([
      "eastus", "eastus2", "southcentralus", "westus2", "westus3",
      "australiaeast", "southeastasia", "northeurope", "swedencentral", "uksouth",
      "westeurope", "centralus", "northcentralus", "westcentralus", "canadacentral",
      "canadaeast", "brazilsouth", "centralindia", "japaneast", "koreacentral"
    ], var.location)
    error_message = "Location must be a valid Azure region."
  }
}

variable "additional_tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

# Azure AD Configuration
variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
}

variable "azure_ad_client_id" {
  description = "Azure AD application client ID"
  type        = string
}

variable "azure_ad_client_secret" {
  description = "Azure AD application client secret"
  type        = string
  sensitive   = true
}

# Azure OpenAI Configuration
variable "azure_openai_api_key" {
  description = "Azure OpenAI API key"
  type        = string
  sensitive   = true
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI endpoint URL"
  type        = string
}

variable "azure_openai_sku" {
  description = "Azure OpenAI SKU"
  type        = string
  default     = "S0"
  
  validation {
    condition     = contains(["S0", "S1", "S2", "S3"], var.azure_openai_sku)
    error_message = "Azure OpenAI SKU must be one of: S0, S1, S2, S3."
  }
}

variable "deploy_gpt4" {
  description = "Deploy GPT-4 model"
  type        = bool
  default     = true
}

variable "deploy_gpt35" {
  description = "Deploy GPT-3.5 Turbo model"
  type        = bool
  default     = true
}

variable "deploy_embedding" {
  description = "Deploy text-embedding-ada-002 model"
  type        = bool
  default     = true
}

variable "gpt4_model_name" {
  description = "GPT-4 model name"
  type        = string
  default     = "gpt-4"
}

variable "gpt35_model_name" {
  description = "GPT-3.5 Turbo model name"
  type        = string
  default     = "gpt-35-turbo"
}

variable "embedding_model_name" {
  description = "Embedding model name"
  type        = string
  default     = "text-embedding-ada-002"
}

variable "gpt4_capacity" {
  description = "GPT-4 deployment capacity"
  type        = number
  default     = 10
  
  validation {
    condition     = var.gpt4_capacity >= 1 && var.gpt4_capacity <= 100
    error_message = "GPT-4 capacity must be between 1 and 100."
  }
}

variable "gpt35_capacity" {
  description = "GPT-3.5 Turbo deployment capacity"
  type        = number
  default     = 20
  
  validation {
    condition     = var.gpt35_capacity >= 1 && var.gpt35_capacity <= 100
    error_message = "GPT-3.5 Turbo capacity must be between 1 and 100."
  }
}

variable "embedding_capacity" {
  description = "Embedding model deployment capacity"
  type        = number
  default     = 30
  
  validation {
    condition     = var.embedding_capacity >= 1 && var.embedding_capacity <= 100
    error_message = "Embedding capacity must be between 1 and 100."
  }
}

variable "enable_content_safety" {
  description = "Enable Azure Content Safety"
  type        = bool
  default     = false
}

variable "enable_ai_search" {
  description = "Enable Azure AI Search"
  type        = bool
  default     = false
}

# App Service Configuration
variable "app_service_plan_sku" {
  description = "App Service Plan SKU"
  type        = string
  default     = "P1v3"
  
  validation {
    condition     = contains([
      "B1", "B2", "B3", "P1v2", "P2v2", "P3v2", "P1v3", "P2v3", "P3v3",
      "S1", "S2", "S3", "P1v2", "P2v2", "P3v2"
    ], var.app_service_plan_sku)
    error_message = "App Service Plan SKU must be a valid SKU."
  }
}

variable "enable_staging_slots" {
  description = "Enable staging slots for App Services"
  type        = bool
  default     = true
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins for App Services"
  type        = list(string)
  default     = ["*"]
}

# Cosmos DB Configuration
variable "cosmos_postgresql_password" {
  description = "Cosmos DB PostgreSQL administrator password"
  type        = string
  sensitive   = true
}

variable "cosmos_postgresql_app_password" {
  description = "Cosmos DB PostgreSQL application user password"
  type        = string
  sensitive   = true
}

variable "cosmos_postgresql_vcore_count" {
  description = "Cosmos DB PostgreSQL coordinator vCore count"
  type        = number
  default     = 4
  
  validation {
    condition     = contains([2, 4, 8, 16, 32], var.cosmos_postgresql_vcore_count)
    error_message = "PostgreSQL vCore count must be one of: 2, 4, 8, 16, 32."
  }
}

variable "cosmos_postgresql_node_count" {
  description = "Cosmos DB PostgreSQL worker node count"
  type        = number
  default     = 0
  
  validation {
    condition     = var.cosmos_postgresql_node_count >= 0 && var.cosmos_postgresql_node_count <= 20
    error_message = "PostgreSQL node count must be between 0 and 20."
  }
}

variable "cosmos_mongodb_password" {
  description = "Cosmos DB MongoDB administrator password"
  type        = string
  sensitive   = true
}

variable "cosmos_mongodb_sku" {
  description = "Cosmos DB MongoDB SKU"
  type        = string
  default     = "M30"
  
  validation {
    condition     = can(regex("^M[0-9]+$", var.cosmos_mongodb_sku))
    error_message = "MongoDB SKU must be in format M followed by numbers (e.g., M30, M50)."
  }
}

variable "cosmos_mongodb_disk_size" {
  description = "Cosmos DB MongoDB disk size in GB"
  type        = number
  default     = 128
  
  validation {
    condition     = var.cosmos_mongodb_disk_size >= 32 && var.cosmos_mongodb_disk_size <= 2048
    error_message = "MongoDB disk size must be between 32 and 2048 GB."
  }
}

variable "cosmos_mongodb_node_count" {
  description = "Cosmos DB MongoDB node count"
  type        = number
  default     = 1
  
  validation {
    condition     = var.cosmos_mongodb_node_count >= 1 && var.cosmos_mongodb_node_count <= 20
    error_message = "MongoDB node count must be between 1 and 20."
  }
}

# Storage Configuration
variable "storage_account_tier" {
  description = "Storage account tier"
  type        = string
  default     = "Standard"
  
  validation {
    condition     = contains(["Standard", "Premium"], var.storage_account_tier)
    error_message = "Storage account tier must be Standard or Premium."
  }
}

variable "storage_account_replication" {
  description = "Storage account replication type"
  type        = string
  default     = "LRS"
  
  validation {
    condition     = contains(["LRS", "GRS", "RAGRS", "ZRS", "GZRS", "RAGZRS"], var.storage_account_replication)
    error_message = "Storage account replication must be a valid replication type."
  }
}

variable "enable_storage_backup" {
  description = "Enable backup container in storage account"
  type        = bool
  default     = true
}

# Container Registry Configuration
variable "container_registry_sku" {
  description = "Container Registry SKU"
  type        = string
  default     = "Basic"
  
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.container_registry_sku)
    error_message = "Container Registry SKU must be Basic, Standard, or Premium."
  }
}

# Network Configuration
variable "enable_private_endpoints" {
  description = "Enable private endpoints for Azure services"
  type        = bool
  default     = true
}

variable "enable_high_availability" {
  description = "Enable high availability for databases"
  type        = bool
  default     = false
}

# Monitoring Configuration
variable "log_analytics_sku" {
  description = "Log Analytics workspace SKU"
  type        = string
  default     = "PerGB2018"
  
  validation {
    condition     = contains(["Free", "PerNode", "PerGB2018", "Standalone", "CapacityReservation"], var.log_analytics_sku)
    error_message = "Log Analytics SKU must be a valid SKU."
  }
}

variable "log_retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 30
  
  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 2555
    error_message = "Log retention days must be between 1 and 2555."
  }
}

variable "enable_container_insights" {
  description = "Enable Container Insights solution"
  type        = bool
  default     = true
}

variable "enable_vm_insights" {
  description = "Enable VM Insights solution"
  type        = bool
  default     = false
}

variable "alert_email_addresses" {
  description = "Email addresses for alert notifications"
  type        = map(string)
  default     = {}
}

variable "alert_webhook_urls" {
  description = "Webhook URLs for alert notifications"
  type        = map(string)
  default     = {}
}

variable "enable_app_service_alerts" {
  description = "Enable App Service monitoring alerts"
  type        = bool
  default     = true
}

variable "app_service_cpu_threshold" {
  description = "CPU usage threshold for App Service alerts (%)"
  type        = number
  default     = 80
  
  validation {
    condition     = var.app_service_cpu_threshold >= 1 && var.app_service_cpu_threshold <= 100
    error_message = "CPU threshold must be between 1 and 100."
  }
}

variable "app_service_memory_threshold" {
  description = "Memory usage threshold for App Service alerts (%)"
  type        = number
  default     = 80
  
  validation {
    condition     = var.app_service_memory_threshold >= 1 && var.app_service_memory_threshold <= 100
    error_message = "Memory threshold must be between 1 and 100."
  }
}

variable "enable_database_alerts" {
  description = "Enable database monitoring alerts"
  type        = bool
  default     = true
}

variable "database_connections_threshold" {
  description = "Database connections threshold for alerts"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.database_connections_threshold >= 1
    error_message = "Database connections threshold must be at least 1."
  }
}

variable "enable_log_alerts" {
  description = "Enable log-based alerts"
  type        = bool
  default     = true
}

variable "application_errors_threshold" {
  description = "Application errors threshold for log alerts"
  type        = number
  default     = 10
  
  validation {
    condition     = var.application_errors_threshold >= 1
    error_message = "Application errors threshold must be at least 1."
  }
}

variable "enable_diagnostic_settings" {
  description = "Enable diagnostic settings for resources"
  type        = bool
  default     = true
}

variable "enable_cost_alerts" {
  description = "Enable cost management alerts"
  type        = bool
  default     = true
}

variable "monthly_budget_amount" {
  description = "Monthly budget amount for cost alerts"
  type        = number
  default     = 1000
  
  validation {
    condition     = var.monthly_budget_amount >= 1
    error_message = "Monthly budget amount must be at least 1."
  }
}

# Backup Configuration
variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
  
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention days must be between 1 and 365."
  }
}
