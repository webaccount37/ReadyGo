@description('Azure region for networking resources.')
param location string = resourceGroup().location

@description('Stable prefix for resource names (lowercase alphanumeric).')
param namePrefix string

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.50.0.0/16'
      ]
    }
  }
}

resource subnetAca 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: 'aca'
  properties: {
    addressPrefix: '10.50.2.0/23'
    delegations: [
      {
        name: 'aca-delegation'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output acaSubnetId string = subnetAca.id
