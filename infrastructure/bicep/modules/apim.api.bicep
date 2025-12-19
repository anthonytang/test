//
// apim.api.bicep
// Creates an API + JWT policy + wildcard operations in API Management
// and attaches the API to the 'unlimited' product.
//

@description('Name of the API Management service')
param apimName string

@description('Internal API ID (e.g., "studio-api")')
param apiId string

@description('Display name of the API')
param displayName string

@description('Route prefix for the API ("" means root)')
param path string

@description('Backend service URL (App Service / Function URL), e.g. https://my-backend.azurewebsites.net')
param serviceUrl string

@description('Entra ID tenant ID (GUID)')
param tenantId string

@description('Primary audience for JWT')
param audience string

@description('Client ID of the SPA / frontend app (second allowed audience)')
param clientId string

// ----------------------------------------------------------
// Existing APIM service
// ----------------------------------------------------------
resource apim 'Microsoft.ApiManagement/service@2022-08-01' existing = {
  name: apimName
}

// ----------------------------------------------------------
// API that fronts your backend
// ----------------------------------------------------------
resource api 'Microsoft.ApiManagement/service/apis@2022-08-01' = {
  name: apiId
  parent: apim
  properties: {
    displayName: displayName
    path: path
    serviceUrl: serviceUrl
    protocols: [
      'https'
    ]
  }
}

// ----------------------------------------------------------
// Load XML policy template and inject dynamic values
// ----------------------------------------------------------
var rawPolicy = loadTextContent('../policies/apim.policy.xml')
var policyWithTenant = replace(rawPolicy, '__TENANT_ID__', tenantId)
var policyWithAudience = replace(policyWithTenant, '__AUDIENCE__', audience)
var finalPolicy = replace(policyWithAudience, '__CLIENT_ID__', clientId)

// Per-API policy (JWT validation + forward to backend)
resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2022-08-01' = {
  name: 'policy'
  parent: api
  properties: {
    format: 'xml'
    value: finalPolicy
  }
}

// ----------------------------------------------------------
// Wildcard operations
// ----------------------------------------------------------
resource opGet 'Microsoft.ApiManagement/service/apis/operations@2022-08-01' = {
  name: 'get-all'
  parent: api
  properties: {
    displayName: 'Wildcard GET'
    method: 'GET'
    urlTemplate: '/{*path}'
    templateParameters: [
      {
        name: 'path'
        required: false
        type: 'string'
      }
    ]
    request: {}
    responses: [
      {
        statusCode: 200
      }
    ]
  }
}

resource opPost 'Microsoft.ApiManagement/service/apis/operations@2022-08-01' = {
  name: 'post-all'
  parent: api
  properties: {
    displayName: 'Wildcard POST'
    method: 'POST'
    urlTemplate: '/{*path}'
    templateParameters: [
      {
        name: 'path'
        required: false
        type: 'string'
      }
    ]
    request: {}
    responses: [
      {
        statusCode: 200
      }
    ]
  }
}

resource opPut 'Microsoft.ApiManagement/service/apis/operations@2022-08-01' = {
  name: 'put-all'
  parent: api
  properties: {
    displayName: 'Wildcard PUT'
    method: 'PUT'
    urlTemplate: '/{*path}'
    templateParameters: [
      {
        name: 'path'
        required: false
        type: 'string'
      }
    ]
    request: {}
    responses: [
      {
        statusCode: 200
      }
    ]
  }
}

resource opDelete 'Microsoft.ApiManagement/service/apis/operations@2022-08-01' = {
  name: 'delete-all'
  parent: api
  properties: {
    displayName: 'Wildcard DELETE'
    method: 'DELETE'
    urlTemplate: '/{*path}'
    templateParameters: [
      {
        name: 'path'
        required: false
        type: 'string'
      }
    ]
    request: {}
    responses: [
      {
        statusCode: 200
      }
    ]
  }
}

// ----------------------------------------------------------
// Attach this API to the "unlimited" product
// ----------------------------------------------------------

// Existing "unlimited" product in APIM (created by apim.bicep)
resource unlimitedProduct 'Microsoft.ApiManagement/service/products@2022-08-01' existing = {
  name: 'unlimited'
  parent: apim
}

// Association: /service/{apimName}/products/unlimited/apis/{apiId}
resource unlimitedProductApi 'Microsoft.ApiManagement/service/products/apis@2022-08-01' = {
  name: apiId
  parent: unlimitedProduct
}
