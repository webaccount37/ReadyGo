param location string = resourceGroup().location
param identityName string

resource id 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

output identityId string = id.id
output identityPrincipalId string = id.properties.principalId
output identityClientId string = id.properties.clientId
