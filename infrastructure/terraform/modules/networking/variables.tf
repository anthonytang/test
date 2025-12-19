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

variable "address_space" {
  description = "Address space for the virtual network"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "app_service_subnet_prefix" {
  description = "Address prefix for App Service subnet"
  type        = list(string)
  default     = ["10.0.1.0/24"]
}

variable "private_endpoints_subnet_prefix" {
  description = "Address prefix for Private Endpoints subnet"
  type        = list(string)
  default     = ["10.0.2.0/24"]
}

variable "databases_subnet_prefix" {
  description = "Address prefix for Databases subnet"
  type        = list(string)
  default     = ["10.0.3.0/24"]
}

variable "enable_private_endpoints" {
  description = "Enable private endpoints for Azure services"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
