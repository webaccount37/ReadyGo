targetScope = 'resourceGroup'

@description('Logical environment (e.g. staging, prod).')
param environmentName string

@description('Azure region.')
param location string = resourceGroup().location

@description('PostgreSQL admin user.')
param postgresAdminLogin string = 'consultcortex'

@secure()
@description('PostgreSQL admin password.')
param postgresAdminPassword string

@secure()
@description('Backend SECRET_KEY (JWT signing).')
param appSecretKey string

@secure()
@description('Entra ID application client secret for the backend app registration.')
param azureClientSecret string

@description('Container image tags (without registry prefix).')
param backendImageTag string = 'latest'
param frontendImageTag string = 'latest'

@description('Enable Key Vault purge protection (recommended for production).')
param enableKeyVaultPurgeProtection bool = false

@description('When false, deploys all infrastructure except Container Apps so a post-step can create the DB app user and database-url secret in Key Vault.')
param deployContainerApps bool = true

var token = take(uniqueString(subscription().id, resourceGroup().id, environmentName, location), 8)
var namePrefix = toLower('cc-${environmentName}-${token}')
var keyVaultName = take('kv-cc-${environmentName}-${token}', 24)
var storageAccountName = take(replace('stcc${token}${environmentName}', '-', ''), 24)
var acrName = take(replace('acrcc${token}', '-', ''), 50)
var postgresServerName = take(replace('pg-cc-${token}', '-', ''), 63)

module law 'modules/logAnalytics.bicep' = {
  name: 'law-${namePrefix}'
  params: {
    location: location
    namePrefix: namePrefix
  }
}

module pg 'modules/postgres.bicep' = {
  name: 'pg-${namePrefix}'
  params: {
    location: location
    postgresServerName: postgresServerName
    postgresAdminLogin: postgresAdminLogin
    postgresAdminPassword: postgresAdminPassword
    databaseName: 'readygo'
  }
}

module kv 'modules/keyVault.bicep' = {
  name: 'kv-${namePrefix}'
  params: {
    location: location
    keyVaultName: keyVaultName
    enablePurgeProtection: enableKeyVaultPurgeProtection
    appSecretKey: appSecretKey
    azureClientSecret: azureClientSecret
  }
  dependsOn: [
    pg
  ]
}

module st 'modules/storage.bicep' = {
  name: 'st-${namePrefix}'
  params: {
    location: location
    storageAccountName: storageAccountName
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr-${namePrefix}'
  params: {
    location: location
    acrName: acrName
  }
}

module id 'modules/identity.bicep' = {
  name: 'id-${namePrefix}'
  params: {
    location: location
    identityName: '${namePrefix}-backend-mi'
  }
}

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var kvSecretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var blobContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource acrRes 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
  dependsOn: [
    acr
  ]
}

resource kvRes 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  dependsOn: [
    kv
  ]
}

resource stRes 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
  dependsOn: [
    st
  ]
}

resource pgRes 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' existing = {
  name: postgresServerName
  dependsOn: [
    pg
  ]
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, acrName, '${namePrefix}-backend-mi', 'acrPull')
  scope: acrRes
  properties: {
    roleDefinitionId: acrPullRole
    principalId: id.outputs.identityPrincipalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    acr
    id
  ]
}

resource kvSecretsAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, keyVaultName, '${namePrefix}-backend-mi', 'kvSecrets')
  scope: kvRes
  properties: {
    roleDefinitionId: kvSecretsUserRole
    principalId: id.outputs.identityPrincipalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    kv
    id
  ]
}

resource blobContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, storageAccountName, '${namePrefix}-backend-mi', 'blobContrib')
  scope: stRes
  properties: {
    roleDefinitionId: blobContributorRole
    principalId: id.outputs.identityPrincipalId
    principalType: 'ServicePrincipal'
  }
  dependsOn: [
    st
    id
  ]
}

module aca 'modules/aca.bicep' = if (deployContainerApps) {
  name: 'aca-${namePrefix}'
  params: {
    location: location
    namePrefix: namePrefix
    lawCustomerId: law.outputs.lawCustomerId
    lawSharedKey: law.outputs.lawSharedKey
    acrLoginServer: acr.outputs.acrLoginServer
    backendImage: '${acr.outputs.acrLoginServer}/backend:${backendImageTag}'
    frontendImage: '${acr.outputs.acrLoginServer}/frontend:${frontendImageTag}'
    backendIdentityId: id.outputs.identityId
    keyVaultUri: kv.outputs.keyVaultUri
  }
  dependsOn: [
    acrPullAssignment
    kvSecretsAssignment
    blobContributorAssignment
  ]
}

resource diagKv 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${namePrefix}-kv-diag'
  scope: kvRes
  properties: {
    workspaceId: law.outputs.lawId
    logs: [
      {
        category: 'AuditEvent'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
  dependsOn: [
    kv
    kvRes
  ]
}

resource diagPg 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${namePrefix}-pg-diag'
  scope: pgRes
  properties: {
    workspaceId: law.outputs.lawId
    logs: [
      {
        category: 'PostgreSQLLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
  dependsOn: [
    pg
    pgRes
  ]
}

resource diagSt 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${namePrefix}-st-diag'
  scope: stRes
  properties: {
    workspaceId: law.outputs.lawId
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
    ]
  }
  dependsOn: [
    st
    stRes
  ]
}

output namePrefix string = namePrefix
output keyVaultUri string = kv.outputs.keyVaultUri
output keyVaultName string = kv.outputs.keyVaultName
output acrLoginServer string = acr.outputs.acrLoginServer
#disable-next-line BCP318
output backendUrl string = deployContainerApps ? 'https://${aca.outputs.backendFqdn}' : ''
#disable-next-line BCP318
output frontendUrl string = deployContainerApps ? 'https://${aca.outputs.frontendFqdn}' : ''
output postgresFqdn string = pg.outputs.postgresFqdn
output postgresServerName string = postgresServerName
output storageAccountName string = st.outputs.storageAccountName
output backendManagedIdentityClientId string = id.outputs.identityClientId
