# Docker Environment Variables Setup

Quick reference guide for setting up environment variables with Docker.

## Quick Setup

1. **Create `.env` file** in the `backend` directory:
   ```bash
   cd backend
   touch .env
   ```

2. **Add your Entra ID configuration** to `backend/.env`:
   ```env
   # Entra ID (Azure AD) SSO Configuration
   AZURE_TENANT_ID=your-tenant-id-here
   AZURE_CLIENT_ID=your-client-id-here
   AZURE_CLIENT_SECRET=your-client-secret-here
   AZURE_REDIRECT_URI=http://localhost:8000/api/v1/auth/callback
   AZURE_AUTHORITY=https://login.microsoftonline.com
   AZURE_SCOPES=["User.Read"]
   
   # Other required variables
   SECRET_KEY=your-secret-key-here
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/readygo
   REDIS_URL=redis://localhost:6379/0
   ```

3. **Start Docker containers**:
   ```bash
   cd config
   docker-compose up -d
   ```

## How It Works

The `docker-compose.yaml` file is configured to:
- **Load all variables** from `backend/.env` using `env_file`
- **Override specific variables** for Docker networking (like `DATABASE_URL` pointing to the `postgres` service)

## Environment Variable Format

### Simple Strings
```env
AZURE_TENANT_ID=12345678-1234-1234-1234-123456789abc
AZURE_CLIENT_ID=87654321-4321-4321-4321-cba987654321
```

### Lists (JSON format)
```env
# JSON array format (recommended)
AZURE_SCOPES=["User.Read"]
CORS_ORIGINS=["http://localhost:3000","http://localhost:3001"]

# Or comma-separated (also supported)
AZURE_SCOPES=User.Read
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Verifying Variables in Docker

### Check all Azure variables:
```bash
docker exec readygo-backend env | grep AZURE
```

### Check specific variable:
```bash
docker exec readygo-backend printenv AZURE_TENANT_ID
```

### Check if application can read config:
```bash
docker exec readygo-backend python -c "from app.core.config import settings; print(settings.AZURE_TENANT_ID)"
```

## Important Notes

1. **`backend/.dockerignore` excludes `.env` from the image build** so `docker build` / `az acr build` does not bake secrets into layers. **Docker Compose** still uses your repo file via `env_file: ../backend/.env` and the bind mount `../backend:/app`, so at **runtime** the container sees `/app/.env` from your machine.
2. **Pydantic** loads `.env` only when that file exists ([`backend/app/core/config.py`](backend/app/core/config.py)). In **Azure Container Apps**, there is no `.env` file — configuration comes from **Key Vault** references set in Bicep; edit secrets in the Azure Portal (see [`infra/README.md`](infra/README.md)).
3. **Redirect URI must match** how you access the app:
   - Local: `http://localhost:8000/api/v1/auth/callback`
   - Azure: set Key Vault secret `azure-redirect-uri` (and Entra app registration) to your API HTTPS callback URL.

## Frontend (`frontend/.env.local`) with Docker

Next.js **inlines** `NEXT_PUBLIC_*` when `npm run build` runs in the Docker **builder** stage. [`frontend/.dockerignore`](../frontend/.dockerignore) excludes generic `.env` / `.env.*` from the build context **except** `.env.local` (so local `docker compose build frontend` can still pick up `NEXT_PUBLIC_*` from your machine). **Do not** commit `frontend/.env.local` with secrets.

1. Create `frontend/.env.local` with at least:
   ```env
   NEXT_PUBLIC_AZURE_CLIENT_ID=...
   NEXT_PUBLIC_AZURE_TENANT_ID=...
   NEXT_PUBLIC_GRAPH_SCOPES=Files.ReadWrite.All
   ```
2. **Rebuild** the frontend image after any change to `.env.local`:
   ```bash
   cd config
   docker compose build --no-cache frontend
   docker compose up -d frontend
   ```
   A plain `up` without rebuild will keep the old client bundle without your new variables.

For **Azure** frontend images built in CI (`az acr build` without `.env.local`), pass the required `NEXT_PUBLIC_*` values as Docker **`--build-arg`** in the pipeline if needed.

## Troubleshooting

### Variables not loading?
- Check that `.env` file exists in `backend/` directory
- Verify `env_file` path in `docker-compose.yaml` is correct: `../backend/.env`
- Restart containers: `docker-compose restart backend`

### Wrong redirect URI?
- Update `AZURE_REDIRECT_URI` in `backend/.env`
- Update redirect URI in Azure App Registration to match
- Restart backend container

### Variables showing as empty?
- Check for typos in variable names (case-sensitive)
- Ensure no extra spaces around `=` sign
- Verify file encoding is UTF-8

## Production Considerations

For production deployments:
1. Use Docker secrets or external secret management (Azure Key Vault, AWS Secrets Manager)
2. Never commit `.env` files to version control
3. Use environment-specific `.env` files (`.env.production`, `.env.staging`)
4. Rotate secrets regularly, especially `AZURE_CLIENT_SECRET`
