// =============================================================================
// AZURE AI FOUNDRY MODULE
// =============================================================================
// Creates Azure AI Foundry Service with model deployments and project

@description('Resource prefix for naming')
param resourcePrefix string

@description('Azure region')
param location string

@description('Resource tags')
param tags object = {}

// Variables
var aiFoundryName = '${resourcePrefix}-aifoundry'
var aiProjectName = '${aiFoundryName}-proj'

// Azure AI Foundry Service
resource aiFoundry 'Microsoft.CognitiveServices/accounts@2025-04-01-preview' = {
  name: aiFoundryName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  properties: {
    // required to work in AI Foundry
    allowProjectManagement: true 

    // Defines developer API endpoint subdomain
    customSubDomainName: aiFoundryName

    disableLocalAuth: false
  }
  tags: tags
}

// AI Foundry Project
resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2025-04-01-preview' = {
  name: aiProjectName
  parent: aiFoundry
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
  tags: tags
}

// GPT-4o Model Deployment
resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: aiFoundry
  name: 'gpt-4o'
  sku: {
    capacity: 50
    name: 'GlobalStandard'
  }
  properties: {
    model: {
      name: 'gpt-4o'
      format: 'OpenAI'
      version: '2024-11-20'
    }
  }
  tags: tags
}

// GPT-4o-mini Model Deployment
resource gpt4oMiniDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: aiFoundry
  name: 'gpt-4o-mini'
  dependsOn: [
    gpt4oDeployment
  ]
  sku: {
    capacity: 50
    name: 'GlobalStandard'
  }
  properties: {
    model: {
      name: 'gpt-4o-mini'
      format: 'OpenAI'
      version: '2024-07-18'
    }
  }
  tags: tags
}


// Text Embedding 3 Small Model Deployment
resource textEmbedding3SmallDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-04-01-preview' = {
  parent: aiFoundry
  name: 'text-embedding-3-small'
  dependsOn: [
    gpt4oMiniDeployment
  ]
  sku: {
    capacity: 250
    name: 'GlobalStandard'
  }
  properties: {
    model: {
      name: 'text-embedding-3-small'
      format: 'OpenAI'
      version: '1'
    }
  }
  tags: tags
}

// Outputs
output serviceId string = aiFoundry.id
output serviceName string = aiFoundry.name
output endpoint string = aiFoundry.properties.endpoint
output projectId string = aiProject.id
output projectName string = aiProject.name
