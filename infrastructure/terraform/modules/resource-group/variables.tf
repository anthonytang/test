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
