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

variable "app_service_plan_sku" {
  description = "SKU for App Service Plan"
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

variable "backend_app_settings" {
  description = "App settings for backend App Service"
  type        = map(string)
  default     = {}
}

variable "frontend_app_settings" {
  description = "App settings for frontend App Service"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
