# Consult Cortex — Azure infrastructure

This folder contains Bicep templates for a single resource group deployment: Log Analytics + Application Insights, Key Vault (secrets + RBAC), Storage (blob containers for expense receipts and account documents), Azure Container Registry, PostgreSQL Flexible Server (public network with Azure-services firewall rule for Container Apps), user-assigned managed identity for the backend, and Azure Container Apps (API, web UI, Redis).

For **private PostgreSQL + VNet-integrated Container Apps**, see the optional module [`modules/network.bicep`](modules/network.bicep) (not wired into `main.bicep` by default); extending `main.bicep` is a documented next step.

## Prerequisites

- Azure CLI (`az`) and Bicep (`az bicep install`)
- An Azure **resource group** (example: `rg-consultcortex-staging-eastus2`)
- Entra ID app registration for the backend (SSO) — see [ENTRA_ID_SSO_SETUP.md](../ENTRA_ID_SSO_SETUP.md). For production, add redirect URIs using the deployed API FQDN from Bicep outputs (`.../api/v1/auth/callback`).
- The identity you use with **`az login`** when running [`deploy-from-env.ps1`](deploy-from-env.ps1) must have **Key Vault data-plane** access on the environment’s vault (e.g. **Key Vault Secrets Officer** on that Key Vault). **Resource group Contributor** alone is not enough when the vault uses RBAC authorization.

  **Grant your own user (PowerShell)** — resolve the vault name from the same deployment name you use in `deploy-from-env.ps1` (default `consultcortex-main`), then assign the role:

  ```powershell
  $rg     = "rg-consultcortex-staging"
  $deploy = "consultcortex-main"   # same as -DeploymentName on deploy-from-env.ps1
  $kv     = az deployment group show -g $rg -n $deploy --query "properties.outputs.keyVaultName.value" -o tsv
  $scope  = az keyvault show -g $rg -n $kv --query id -o tsv
  $me     = az ad signed-in-user show --query id -o tsv
  az role assignment create --role "Key Vault Secrets Officer" --assignee $me --scope $scope
  ```

  If `keyVaultName` is empty, phase 1 may not have succeeded yet — list vaults in the group: `az keyvault list -g $rg -o table`.

## Deploy from `backend/.env` (recommended)

Use [deploy-from-env.ps1](deploy-from-env.ps1) for a **two-phase** deploy: infrastructure first, then a dedicated PostgreSQL app user and **`database-url`** (plus `postgres-app-login`, `postgres-app-password`, `postgres-admin-password`) in Key Vault, **optional** local Alembic (skipped if no Python/Poetry), then Container Apps. **Alembic revision files live in the backend image**; the API container runs **`alembic upgrade head` on every start** ([`backend/start.sh`](../backend/start.sh)) so migrations apply in Azure when new images roll out.

Before the second Bicep phase, the script ensures **`backend:<tag>`** and **`frontend:<tag>`** exist in your ACR (defaults **`latest`**). If a tag is missing, it runs **`az acr build`** from this repo (can take several minutes and uses ACR build quota). Pass **`-SkipAcrImageBuild`** to only verify tags and fail if they are absent (e.g. CI or when images were built elsewhere). Use **`-BackendImageTag`** / **`-FrontendImageTag`** for tags that already exist in the registry.

From repo root (after `az login`):

```powershell
.\infra\deploy-from-env.ps1 -ResourceGroup rg-consultcortex-staging -EnvironmentName staging
```

Reads from `backend/.env`: **`AZURE_TENANT_ID`**, **`AZURE_CLIENT_ID`**, **`AZURE_CLIENT_SECRET`** (required); **`CORS_ORIGINS`** (optional); **`SECRET_KEY`** and **`POSTGRES_ADMIN_PASSWORD`** (optional — if missing, the script reuses **`postgres-admin-password`** from Key Vault when the deployment already exists, otherwise generates once; add to `.env` afterward if you rely on them locally).

On first run it creates a unique DB login `ccapp_*` and password. **Every run** (including re-runs) runs **`ALTER ROLE … PASSWORD`** for that login when it already exists, or **`CREATE ROLE`** when it is missing, so Key Vault and the server stay aligned (this fixes cases where secrets were written but role creation failed or was skipped). **Re-runs** reuse **`postgres-app-login`** / **`postgres-app-password`** from Key Vault so credentials are not rotated accidentally; use **`-RegeneratePostgresAppUser`** to generate a new `ccapp_*` pair and update the vault.

Ensures database **`readygo`** exists (`CREATE DATABASE` is a no-op if Bicep already created it), grants on `readygo`, **optionally** runs Alembic on your machine when `backend/.venv` or Poetry is available (otherwise skips with a warning), and updates Key Vault secrets used by the API container. **`-SkipAlembic`** skips that local step entirely. The backend container **`start.sh`** always runs Alembic on boot against Azure (second pass is harmless).

**Local vs Azure config:** On your machine, keep using [`../backend/.env`](../backend/.env) with Docker Compose (`env_file` + bind mount of `../backend` → `/app`). [`../backend/.dockerignore`](../backend/.dockerignore) keeps `.env` **out of the image layers** so cloud builds stay clean; at runtime in Compose the mounted file is still there, and [`../backend/app/core/config.py`](../backend/app/core/config.py) loads `.env` **only when that file exists**. In Azure Container Apps, **no** `.env` file — settings come from **Key Vault** (below) via `secretRef`.

## Container Apps: Key Vault–backed settings

[`modules/aca.bicep`](modules/aca.bicep) maps every listed value into the API container as environment variables sourced from **Key Vault references** (managed identity). The **frontend** container uses the **same** user-assigned identity only so it can **pull images from ACR** (it does not mount Key Vault secrets). Edit secrets in the **Azure Portal** (Key Vault → Secrets) without changing Git or build scripts. Initial values are **seeded** by [`deploy-from-env.ps1`](deploy-from-env.ps1) (from your local `.env` for one-time / refresh) or by [`seed-keyvault-config.sh`](seed-keyvault-config.sh) in CI; existing secrets are **left unchanged** unless you use `-RefreshKeyVaultConfig` or `FORCE_KV_CONFIG=1`.

| Key Vault secret name | Container env var |
|------------------------|---------------------|
| `database-url` | `DATABASE_URL` |
| `secret-key` | `SECRET_KEY` |
| `azure-client-secret` | `AZURE_CLIENT_SECRET` |
| `redis-url` | `REDIS_URL` |
| `cors-origins` | `CORS_ORIGINS` |
| `azure-storage-account-name` | `AZURE_STORAGE_ACCOUNT_NAME` |
| `azure-managed-identity-client-id` | `AZURE_MANAGED_IDENTITY_CLIENT_ID` |
| `azure-tenant-id` | `AZURE_TENANT_ID` |
| `azure-client-id` | `AZURE_CLIENT_ID` |
| `azure-key-vault-url` | `AZURE_KEY_VAULT_URL` |
| `otel-environment` | `OTEL_ENVIRONMENT` |
| `azure-redirect-uri` | `AZURE_REDIRECT_URI` |

`postgres-app-login`, `postgres-app-password`, and `postgres-admin-password` remain in Key Vault for operations but are not mounted as env vars on the API container.

SharePoint and other optional app settings still use Pydantic defaults unless you add more secrets and extend the Bicep template. See [ENTRA_ID_SSO_SETUP.md](../ENTRA_ID_SSO_SETUP.md) for redirect URIs (`azure-redirect-uri`).

### `asyncpg.exceptions.InvalidPasswordError` for user `ccapp_*`

The API uses **`database-url`** in Key Vault (SQLAlchemy URL with the `ccapp_*` login). That login must exist on the flexible server with the same password as **`postgres-app-password`**. Older **`deploy-from-env.ps1`** versions only ran **`CREATE ROLE`** when Key Vault had no app secrets yet, so if the first bootstrap failed after secrets were written—or secrets were created manually—the vault could reference a user that was never created. **Re-run** [`deploy-from-env.ps1`](deploy-from-env.ps1) with the same resource group and deployment name (omit **`-RegeneratePostgresAppUser`** to keep existing KV credentials): the script now **syncs** the role on every run (**`ALTER ROLE … PASSWORD`** or **`CREATE ROLE`**). Then restart the API Container App revision if it does not pick up secrets automatically. To abandon the current `ccapp_*` pair and mint a new one, use **`-RegeneratePostgresAppUser`** (updates `database-url`, `postgres-app-login`, and `postgres-app-password`).

## First-time deployment (resource group scope)

1. Create the resource group (name and region are yours):

   ```bash
   az group create --name rg-consultcortex-staging --location eastus2
   ```

2. Deploy the stack (pass **secure** parameters at the CLI; do not commit secrets). Bicep no longer takes CORS / Entra IDs as parameters — those live in Key Vault (seed with [`deploy-from-env.ps1`](deploy-from-env.ps1) or [`seed-keyvault-config.sh`](seed-keyvault-config.sh) after a `deployContainerApps=false` deployment).

   ```bash
   az deployment group create \
     --resource-group rg-consultcortex-staging \
     --template-file infra/main.bicep \
     --name consultcortex-staging-1 \
     --parameters environmentName=staging \
     --parameters deployContainerApps=false \
     --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
     --parameters appSecretKey="$APP_SECRET_KEY" \
     --parameters azureClientSecret="$AZURE_CLIENT_SECRET"
   ```

   Then seed Key Vault app-configuration secrets (see script header for env vars), set `database-url` (e.g. run `deploy-from-env.ps1` for Postgres bootstrap), and redeploy with `deployContainerApps=true`.

3. If the **first** deployment fails because Container Apps cannot pull images yet, build images into the new ACR and redeploy the same command (incremental deployment updates revisions):

   ```bash
   ACR=$(az acr list -g rg-consultcortex-staging --query "[0].name" -o tsv)
   az acr build -r "$ACR" --image backend:manual --file backend/Dockerfile ./backend
   az acr build -r "$ACR" --image frontend:manual --file frontend/Dockerfile \
     --build-arg NEXT_PUBLIC_API_URL= \
     ./frontend
   az deployment group create ... --parameters backendImageTag=manual --parameters frontendImageTag=manual
   ```

4. Note template outputs: `backendUrl`, `frontendUrl`, `acrLoginServer`, `keyVaultUri`, `backendManagedIdentityClientId`, `postgresFqdn`.

## Second environment (templating)

1. Create another resource group (or reuse subscription with a new `environmentName`).
2. Re-run `az deployment group create` with a new `environmentName` (e.g. `prod`) and updated image tags; change CORS, redirect URI, etc. in **Key Vault secrets** (or use `-RefreshKeyVaultConfig` once from `deploy-from-env.ps1`).
3. Register the same Entra app or a separate one; update redirect URIs for the new API URL.

Copy [`parameters/staging.sample.json`](parameters/staging.sample.json) to a **local** file (e.g. `staging.json`, gitignored) for non-secret parameters only; keep secrets on the CLI with `--parameters secret=...` or use Key Vault references from a pipeline.

## GitHub Actions (OIDC)

Workflow: [`.github/workflows/deploy-azure.yml`](../.github/workflows/deploy-azure.yml) (`workflow_dispatch`). It deploys **twice** with the same deployment name: first `deployContainerApps=false`, then runs [`seed-keyvault-config.sh`](seed-keyvault-config.sh), then `deployContainerApps=true`. **Prerequisite:** Key Vault must already contain **`database-url`** (and Postgres app user) from a prior [`deploy-from-env.ps1`](deploy-from-env.ps1) run or manual setup — the workflow does not create the flexible-server app user.

The GitHub OIDC identity needs permission to **set secrets** on the vault (e.g. **Key Vault Secrets Officer** on that Key Vault).

**Repository secrets**

| Secret | Purpose |
|--------|---------|
| `AZURE_CLIENT_ID` | Federated credential **application (client) ID** for GitHub Actions (not the Consult Cortex API app id). |
| `AZURE_TENANT_ID` | Directory (tenant) id. |
| `AZURE_SUBSCRIPTION_ID` | Target subscription. |
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL admin password. |
| `APP_SECRET_KEY` | JWT signing key (also written to KV `secret-key` by Bicep on deploy). |
| `AZURE_CLIENT_SECRET` | Entra app client secret for the **API** app (KV `azure-client-secret`). |
| `AZURE_ENTRA_APP_CLIENT_ID` | Entra **API** application (client) id (seeded into KV `azure-client-id`). |

**Repository variables (optional)**

| Variable | Purpose |
|----------|---------|
| `CORS_ORIGINS_JSON` | JSON array string for KV `cors-origins` when seeding (default placeholder if unset). |
| `OTEL_ENVIRONMENT` | e.g. `production` → KV `otel-environment`. |
| `AZURE_REDIRECT_URI` | API callback URL → KV `azure-redirect-uri`. |
| `FORCE_KV_CONFIG` | Set to `1` to overwrite seeded config secrets from CI on each run (default leave unset). |

Configure federated identity on the **GitHub Actions** app registration: federated credential subject `repo:ORG/REPO:ref:refs/heads/main` (or environment), issuer `https://token.actions.githubusercontent.com`. Grant that identity **Contributor** (or scoped roles) on the resource group.

## Alembic (clean baseline)

Database migrations are a single revision [`../backend/alembic/versions/81e5098b1836_initial_schema.py`](../backend/alembic/versions/81e5098b1836_initial_schema.py). Legacy scripts are archived under [`../backend/alembic/legacy_archive_pre_cloud/`](../backend/alembic/legacy_archive_pre_cloud/).

Run migrations in CI or locally with:

```bash
cd backend && poetry run alembic upgrade head
```

In Docker:

```bash
docker compose -f config/docker-compose.yaml run --rm --no-deps \
  -e DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/readygo \
  backend alembic upgrade head
```

## Operational notes

- **Redis** on Container Apps is a **separate** `Microsoft.App/containerApps` resource from the API. Incremental ARM deploys update **per resource**; if the Redis spec in Bicep is unchanged, Redis is usually **not** given a new revision when only backend/frontend image tags change (confirm with `az deployment group what-if`). The deploy script does **not** delete Redis between runs. Redis is still **single-replica and in-memory** (`appendonly` off); **any** restart clears data—use **Azure Cache for Redis** if you need durable or HA cache for production.
- **PostgreSQL** is deployed with public access and the `AllowAllWindowsAzureIps` firewall rule so Azure services (including Container Apps) can connect. Tighten to private access for production if required.
- **Blob access**: the backend user-assigned identity receives **Storage Blob Data Contributor**. Leave `AZURE_STORAGE_ACCOUNT_KEY` unset and set `AZURE_MANAGED_IDENTITY_CLIENT_ID` to the **user-assigned** identity’s client id (template output `backendManagedIdentityClientId`) so `DefaultAzureCredential` selects that identity (distinct from Entra app `AZURE_CLIENT_ID` used for SSO).
