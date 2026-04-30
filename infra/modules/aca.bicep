param location string = resourceGroup().location
param namePrefix string
param lawCustomerId string
@secure()
param lawSharedKey string
param acrLoginServer string
param backendImage string
param frontendImage string
param backendIdentityId string
param keyVaultUri string

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: lawCustomerId
        sharedKey: lawSharedKey
      }
    }
  }
}

var redisName = '${namePrefix}-redis'
var backendName = '${namePrefix}-api'
var frontendName = '${namePrefix}-web'

resource redisApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: redisName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: false
        targetPort: 6379
        transport: 'Tcp'
      }
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      containers: [
        {
          name: 'redis'
          image: 'docker.io/library/redis:7-alpine'
          args: [
            'redis-server'
            '--appendonly'
            'no'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${backendIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          identity: backendIdentityId
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVaultUri}secrets/database-url'
          identity: backendIdentityId
        }
        {
          name: 'secret-key'
          keyVaultUrl: '${keyVaultUri}secrets/secret-key'
          identity: backendIdentityId
        }
        {
          name: 'azure-client-secret'
          keyVaultUrl: '${keyVaultUri}secrets/azure-client-secret'
          identity: backendIdentityId
        }
        {
          name: 'redis-url'
          keyVaultUrl: '${keyVaultUri}secrets/redis-url'
          identity: backendIdentityId
        }
        {
          name: 'cors-origins'
          keyVaultUrl: '${keyVaultUri}secrets/cors-origins'
          identity: backendIdentityId
        }
        {
          name: 'azure-storage-account-name'
          keyVaultUrl: '${keyVaultUri}secrets/azure-storage-account-name'
          identity: backendIdentityId
        }
        {
          name: 'azure-managed-identity-client-id'
          keyVaultUrl: '${keyVaultUri}secrets/azure-managed-identity-client-id'
          identity: backendIdentityId
        }
        {
          name: 'azure-tenant-id'
          keyVaultUrl: '${keyVaultUri}secrets/azure-tenant-id'
          identity: backendIdentityId
        }
        {
          name: 'azure-client-id'
          keyVaultUrl: '${keyVaultUri}secrets/azure-client-id'
          identity: backendIdentityId
        }
        {
          name: 'azure-key-vault-url'
          keyVaultUrl: '${keyVaultUri}secrets/azure-key-vault-url'
          identity: backendIdentityId
        }
        {
          name: 'otel-environment'
          keyVaultUrl: '${keyVaultUri}secrets/otel-environment'
          identity: backendIdentityId
        }
        {
          name: 'azure-redirect-uri'
          keyVaultUrl: '${keyVaultUri}secrets/azure-redirect-uri'
          identity: backendIdentityId
        }
      ]
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
      containers: [
        {
          name: 'backend'
          image: backendImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 15
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ]
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'SECRET_KEY'
              secretRef: 'secret-key'
            }
            {
              name: 'AZURE_CLIENT_SECRET'
              secretRef: 'azure-client-secret'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'CORS_ORIGINS'
              secretRef: 'cors-origins'
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              secretRef: 'azure-storage-account-name'
            }
            {
              name: 'AZURE_MANAGED_IDENTITY_CLIENT_ID'
              secretRef: 'azure-managed-identity-client-id'
            }
            {
              name: 'AZURE_TENANT_ID'
              secretRef: 'azure-tenant-id'
            }
            {
              name: 'AZURE_CLIENT_ID'
              secretRef: 'azure-client-id'
            }
            {
              name: 'AZURE_KEY_VAULT_URL'
              secretRef: 'azure-key-vault-url'
            }
            {
              name: 'OTEL_ENVIRONMENT'
              secretRef: 'otel-environment'
            }
            {
              name: 'AZURE_REDIRECT_URI'
              secretRef: 'azure-redirect-uri'
            }
          ]
        }
      ]
    }
  }
  dependsOn: [
    redisApp
  ]
}

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: frontendName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${backendIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      // Same user-assigned MI as backend: AcrPull on ACR (see main.bicep). Required to pull private images.
      registries: [
        {
          server: acrLoginServer
          identity: backendIdentityId
        }
      ]
    }
    template: {
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 20
            }
          ]
          env: [
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'BACKEND_URL'
              value: 'https://${backendApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'HOSTNAME'
              value: '0.0.0.0'
            }
          ]
        }
      ]
    }
  }
}

output environmentId string = env.id
output redisAppName string = redisApp.name
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn
