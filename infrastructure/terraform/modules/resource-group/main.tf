# Resource Group Module
# Creates a resource group with standardized naming and tagging

resource "azurerm_resource_group" "main" {
  name     = "${var.customer_prefix}-${var.project_name}-${var.environment}-rg"
  location = var.location

  tags = merge(
    {
      environment     = var.environment
      customer        = var.customer_prefix
      project         = var.project_name
      deployment_date = formatdate("YYYY-MM-DD", timestamp())
      managed_by      = "terraform"
    },
    var.additional_tags
  )

  lifecycle {
    ignore_changes = [
      tags["deployment_date"]
    ]
  }
}
