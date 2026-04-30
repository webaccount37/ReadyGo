#!/usr/bin/env bash
# Seed Key Vault secrets consumed by Container Apps (see modules/aca.bicep).
# Creates each secret only if missing, unless FORCE_KV_CONFIG=1 (overwrite from env).
#
# Usage (after a deployment with deployContainerApps=false, same deployment name):
#   export SEED_AZURE_TENANT_ID=...
#   export SEED_AZURE_CLIENT_ID=...   # Entra API app (backend SSO) client id
#   export SEED_CORS_ORIGINS='["https://..."]'   # optional
#   export SEED_OTEL_ENVIRONMENT=production     # optional
#   export SEED_AZURE_REDIRECT_URI='https://api.../api/v1/auth/callback'  # optional
#   ./infra/seed-keyvault-config.sh <resource-group> <deployment-name>
#
set -euo pipefail

RG="${1:?usage: $0 <resource-group> <deployment-name>}"
DEPLOYMENT_NAME="${2:?usage: $0 <resource-group> <deployment-name>}"

OUT=$(az deployment group show -g "$RG" -n "$DEPLOYMENT_NAME" --query properties.outputs -o json)
KV=$(echo "$OUT" | jq -r '.keyVaultName.value')
NP=$(echo "$OUT" | jq -r '.namePrefix.value')
ST=$(echo "$OUT" | jq -r '.storageAccountName.value')
MI=$(echo "$OUT" | jq -r '.backendManagedIdentityClientId.value')
KVURI=$(echo "$OUT" | jq -r '.keyVaultUri.value')

REDIS_URL="redis://${NP}-redis:6379/0"
CORS="${SEED_CORS_ORIGINS:-[\"https://example.invalid\"]}"
TENANT="${SEED_AZURE_TENANT_ID:?export SEED_AZURE_TENANT_ID}"
CLIENT="${SEED_AZURE_CLIENT_ID:?export SEED_AZURE_CLIENT_ID}"
OTEL="${SEED_OTEL_ENVIRONMENT:-production}"
if [[ -z "${OTEL// }" ]]; then OTEL=production; fi
REDIRECT="${SEED_AZURE_REDIRECT_URI:-https://placeholder.invalid/api/v1/auth/callback}"
if [[ -z "${REDIRECT// }" ]]; then REDIRECT="https://placeholder.invalid/api/v1/auth/callback"; fi

ensure() {
  local name="$1" val="$2"
  if [[ "${FORCE_KV_CONFIG:-0}" == "1" ]]; then
    az keyvault secret set --vault-name "$KV" --name "$name" --value "$val" >/dev/null
    echo "KV secret set (forced): $name"
    return
  fi
  if az keyvault secret show --vault-name "$KV" --name "$name" &>/dev/null; then
    echo "KV secret exists (skip): $name"
  else
    az keyvault secret set --vault-name "$KV" --name "$name" --value "$val" >/dev/null
    echo "KV secret created: $name"
  fi
}

ensure redis-url "$REDIS_URL"
ensure cors-origins "$CORS"
ensure azure-storage-account-name "$ST"
ensure azure-managed-identity-client-id "$MI"
ensure azure-tenant-id "$TENANT"
ensure azure-client-id "$CLIENT"
ensure azure-key-vault-url "$KVURI"
ensure otel-environment "$OTEL"
ensure azure-redirect-uri "$REDIRECT"

echo "Done. Edit these secrets in Azure Portal anytime; re-run with FORCE_KV_CONFIG=1 to push values from CI/env again."
