//
// modules/apim.bicep
// Creates the API Management service and standard products.
// 

@description('Name of the API Management service')
param apimName string

@description('Location of the APIM service')
param location string

@description('Publisher email shown in APIM')
param publisherEmail string

@description('Publisher name shown in APIM')
param publisherName string

// APIM service
resource apim 'Microsoft.ApiManagement/service@2022-08-01' = {
  name: apimName
  location: location
  sku: {
    name: 'Developer'
    capacity: 1
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
  }
}

// Starter product
resource starterProduct 'Microsoft.ApiManagement/service/products@2022-08-01' = {
  name: '${apim.name}/starter'
  properties: {
    displayName: 'Starter'
    description: 'Subscribers will be able to run 5 calls/minute up to a maximum of 100 calls/week.'
    subscriptionRequired: true
    approvalRequired: false
    subscriptionsLimit: 1
    state: 'published'
  }
}

// Unlimited product
resource unlimitedProduct 'Microsoft.ApiManagement/service/products@2022-08-01' = {
  name: '${apim.name}/unlimited'
  properties: {
    displayName: 'Unlimited'
    description: 'Subscribers have completely unlimited access to the API. Administrator approval is required.'
    subscriptionRequired: true
    approvalRequired: true
    subscriptionsLimit: 1
    state: 'published'
  }
}

output apimNameOut string = apim.name
output apimResourceId string = apim.id
