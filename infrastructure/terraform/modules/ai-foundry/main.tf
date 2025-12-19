# AI Foundry Module
# Creates Azure OpenAI resources for AI capabilities

# Azure OpenAI Service
resource "azurerm_cognitive_account" "openai" {
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-openai"
  location            = var.location
  resource_group_name = var.resource_group_name
  kind                = "OpenAI"
  sku_name            = var.openai_sku_name

  # Network rules
  dynamic "network_acls" {
    for_each = var.enable_private_endpoints ? [1] : []
    content {
      default_action = "Deny"
      ip_rules      = var.allowed_ip_ranges
    }
  }

  # Identity
  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# Private endpoint for Azure OpenAI (if enabled)
resource "azurerm_private_endpoint" "openai" {
  count               = var.enable_private_endpoints ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-openai-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.private_endpoints_subnet_id

  private_service_connection {
    name                           = "openai-psc"
    private_connection_resource_id = azurerm_cognitive_account.openai.id
    is_manual_connection           = false
    subresource_names              = ["account"]
  }

  private_dns_zone_group {
    name                 = "openai-dns-zone-group"
    private_dns_zone_ids = var.private_dns_zone_ids
  }

  tags = var.tags
}

# Azure OpenAI Model Deployments
resource "azurerm_cognitive_deployment" "gpt4" {
  count                = var.deploy_gpt4 ? 1 : 0
  name                 = "gpt-4"
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = var.gpt4_model_name
    version = var.gpt4_model_version
  }

  scale {
    type     = "Standard"
    capacity = var.gpt4_capacity
  }

  tags = var.tags
}

resource "azurerm_cognitive_deployment" "gpt35" {
  count                = var.deploy_gpt35 ? 1 : 0
  name                 = "gpt-35-turbo"
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = var.gpt35_model_name
    version = var.gpt35_model_version
  }

  scale {
    type     = "Standard"
    capacity = var.gpt35_capacity
  }

  tags = var.tags
}

resource "azurerm_cognitive_deployment" "embedding" {
  count                = var.deploy_embedding ? 1 : 0
  name                 = "text-embedding-ada-002"
  cognitive_account_id = azurerm_cognitive_account.openai.id
  model {
    format  = "OpenAI"
    name    = var.embedding_model_name
    version = var.embedding_model_version
  }

  scale {
    type     = "Standard"
    capacity = var.embedding_capacity
  }

  tags = var.tags
}

# Application Insights for AI monitoring
resource "azurerm_application_insights" "ai" {
  count               = var.enable_ai_monitoring ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-ai-ai"
  resource_group_name = var.resource_group_name
  location            = var.location
  application_type    = "web"

  tags = var.tags
}

# AI Content Safety (if enabled)
resource "azurerm_cognitive_account" "content_safety" {
  count               = var.enable_content_safety ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-content-safety"
  location            = var.location
  resource_group_name = var.resource_group_name
  kind                = "ContentSafety"
  sku_name            = var.content_safety_sku

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# AI Search Service (if enabled)
resource "azurerm_search_service" "ai_search" {
  count               = var.enable_ai_search ? 1 : 0
  name                = "${var.customer_prefix}-${var.project_name}-${var.environment}-search"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.ai_search_sku
  replica_count       = var.ai_search_replica_count
  partition_count     = var.ai_search_partition_count

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# AI Search Index
resource "azurerm_search_service_index" "main" {
  count            = var.enable_ai_search ? 1 : 0
  name             = "main-index"
  search_service_id = azurerm_search_service.ai_search[0].id

  field {
    name  = "id"
    type  = "Edm.String"
    key   = true
    searchable = false
    filterable = false
    sortable = false
    facetable = false
  }

  field {
    name  = "content"
    type  = "Edm.String"
    searchable = true
    filterable = false
    sortable = false
    facetable = false
  }

  field {
    name  = "metadata"
    type  = "Edm.String"
    searchable = false
    filterable = true
    sortable = false
    facetable = true
  }

  field {
    name  = "vector"
    type  = "Collection(Edm.Single)"
    searchable = false
    filterable = false
    sortable = false
    facetable = false
  }

  vector_search {
    algorithm_configuration_name = "vector-config"
  }

  semantic_search {
    semantic_configuration_name = "semantic-config"
  }
}
