variable "customer_prefix" {
  description = "Customer prefix for resource naming"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "location" {
  description = "Azure region for resources"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "administrator_login_password" {
  description = "Administrator password for PostgreSQL cluster"
  type        = string
  sensitive   = true
}

variable "coordinator_storage_quota_in_mb" {
  description = "Storage quota for coordinator node in MB"
  type        = number
  default     = 131072 # 128 GB
}

variable "coordinator_vcore_count" {
  description = "vCore count for coordinator node"
  type        = number
  default     = 4
  
  validation {
    condition     = contains([2, 4, 8, 16, 32], var.coordinator_vcore_count)
    error_message = "Coordinator vCore count must be one of: 2, 4, 8, 16, 32."
  }
}

variable "node_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 0
  
  validation {
    condition     = var.node_count >= 0 && var.node_count <= 20
    error_message = "Node count must be between 0 and 20."
  }
}

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "citus"
}

variable "enable_high_availability" {
  description = "Enable high availability for the cluster"
  type        = bool
  default     = false
}

variable "enable_private_endpoints" {
  description = "Enable private endpoints for the cluster"
  type        = bool
  default     = true
}

variable "private_endpoints_subnet_id" {
  description = "Subnet ID for private endpoints"
  type        = string
  default     = ""
}

variable "private_dns_zone_ids" {
  description = "List of private DNS zone IDs"
  type        = list(string)
  default     = []
}

variable "app_service_subnet_prefix" {
  description = "App Service subnet prefix for firewall rules"
  type        = string
  default     = ""
}

variable "create_app_role" {
  description = "Create an application role for the database"
  type        = bool
  default     = true
}

variable "app_role_name" {
  description = "Name of the application role"
  type        = string
  default     = "appuser"
}

variable "app_role_password" {
  description = "Password for the application role"
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_backup" {
  description = "Enable backup for the cluster"
  type        = bool
  default     = true
}

variable "recovery_vault_name" {
  description = "Name of the recovery vault for backups"
  type        = string
  default     = ""
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
  
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention days must be between 1 and 365."
  }
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
