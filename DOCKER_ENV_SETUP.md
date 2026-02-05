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

1. **`.env` file is NOT copied into Docker image** - it's excluded by `.dockerignore` for security
2. **Docker Compose reads from host filesystem** - your `backend/.env` file on your machine
3. **Redirect URI must match** how you access the app:
   - Local: `http://localhost:8000/api/v1/auth/callback`
   - Production: `https://your-domain.com/api/v1/auth/callback`

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
