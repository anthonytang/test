output "app_service_plan_id" {
  description = "ID of the App Service Plan"
  value       = azurerm_service_plan.main.id
}

output "app_service_plan_name" {
  description = "Name of the App Service Plan"
  value       = azurerm_service_plan.main.name
}

output "backend_app_service_id" {
  description = "ID of the backend App Service"
  value       = azurerm_linux_web_app.backend.id
}

output "backend_app_service_name" {
  description = "Name of the backend App Service"
  value       = azurerm_linux_web_app.backend.name
}

output "backend_app_service_url" {
  description = "URL of the backend App Service"
  value       = "https://${azurerm_linux_web_app.backend.default_hostname}"
}

output "backend_app_service_identity" {
  description = "Managed identity of the backend App Service"
  value       = azurerm_linux_web_app.backend.identity[0]
}

output "frontend_app_service_id" {
  description = "ID of the frontend App Service"
  value       = azurerm_linux_web_app.frontend.id
}

output "frontend_app_service_name" {
  description = "Name of the frontend App Service"
  value       = azurerm_linux_web_app.frontend.name
}

output "frontend_app_service_url" {
  description = "URL of the frontend App Service"
  value       = "https://${azurerm_linux_web_app.frontend.default_hostname}"
}

output "frontend_app_service_identity" {
  description = "Managed identity of the frontend App Service"
  value       = azurerm_linux_web_app.frontend.identity[0]
}

output "backend_application_insights_id" {
  description = "ID of the backend Application Insights"
  value       = azurerm_application_insights.backend.id
}

output "backend_application_insights_key" {
  description = "Instrumentation key for backend Application Insights"
  value       = azurerm_application_insights.backend.instrumentation_key
  sensitive   = true
}

output "frontend_application_insights_id" {
  description = "ID of the frontend Application Insights"
  value       = azurerm_application_insights.frontend.id
}

output "frontend_application_insights_key" {
  description = "Instrumentation key for frontend Application Insights"
  value       = azurerm_application_insights.frontend.instrumentation_key
  sensitive   = true
}

output "staging_slots" {
  description = "Staging slots created (if enabled)"
  value = var.enable_staging_slots ? {
    backend_staging_id  = azurerm_linux_web_app_slot.backend_staging[0].id
    frontend_staging_id = azurerm_linux_web_app_slot.frontend_staging[0].id
  } : {}
}
