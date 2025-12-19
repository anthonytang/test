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
  description = "Administrator password for MongoDB cluster"
  type        = string
  sensitive   = true
}

variable "sku_name" {
  description = "SKU name for MongoDB cluster node"
  type        = string
  default     = "M30"
  
  validation {
    condition     = can(regex("^M[0-9]+$", var.sku_name))
    error_message = "SKU name must be in format M followed by numbers (e.g., M30, M50)."
  }
}

variable "disk_size_gb" {
  description = "Disk size in GB for MongoDB cluster node"
  type        = number
  default     = 128
  
  validation {
    condition     = var.disk_size_gb >= 32 && var.disk_size_gb <= 2048
    error_message = "Disk size must be between 32 and 2048 GB."
  }
}

variable "node_count" {
  description = "Number of nodes in the MongoDB cluster"
  type        = number
  default     = 1
  
  validation {
    condition     = var.node_count >= 1 && var.node_count <= 20
    error_message = "Node count must be between 1 and 20."
  }
}

variable "database_name" {
  description = "Name of the database to create"
  type        = string
  default     = "vectordb"
}

variable "collection_name" {
  description = "Name of the collection to create"
  type        = string
  default     = "documents"
}

variable "enable_high_availability" {
  description = "Enable high availability with multiple zones"
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

variable "enable_vector_search" {
  description = "Enable vector search index configuration"
  type        = bool
  default     = true
}

variable "enable_sharding" {
  description = "Enable sharding for distributed collections"
  type        = bool
  default     = false
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
