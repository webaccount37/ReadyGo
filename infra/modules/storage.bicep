param location string = resourceGroup().location
param storageAccountName string

resource st 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: st
  name: 'default'
}

resource containerExpense 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: 'expense-receipts'
  properties: {
    publicAccess: 'None'
  }
}

resource containerAccountDocs 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: 'account-documents'
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountId string = st.id
output storageAccountName string = st.name
output blobEndpoint string = st.properties.primaryEndpoints.blob
