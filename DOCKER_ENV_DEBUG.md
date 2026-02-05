# Debugging Docker Environment Variables

## Quick Check Commands

Run these commands to verify what Docker is actually seeing:

### 1. Check if .env file is being read
```bash
cd config
docker-compose exec backend printenv | grep AZURE
```

### 2. Check specific variable
```bash
docker-compose exec backend printenv AZURE_CLIENT_SECRET
```

### 3. Check the debug endpoint (after restarting)
```bash
curl http://localhost:8000/api/v1/debug/auth-config
```

This will show:
- What values are actually loaded
- Length of client secret (to verify it's not empty)
- First/last few characters (to verify it's the right value)

## Common Issues

### Issue 1: Path Resolution
The `env_file` path in docker-compose.yaml is relative to where you run `docker-compose`:
- If you run from `config/` directory: `../backend/.env` is correct
- If you run from root: Use `backend/.env` instead

**Fix**: Always run docker-compose from the `config/` directory, OR update the path.

### Issue 2: Quotes in .env File
If your .env has quotes around values:
```env
# WRONG
AZURE_CLIENT_SECRET="abc~XYZ123..."

# CORRECT
AZURE_CLIENT_SECRET=abc~XYZ123...
```

**Fix**: Remove quotes from .env file values.

### Issue 3: Special Characters
Some special characters might need escaping, but usually not in .env files.

### Issue 4: Docker Not Reloading
Docker Compose caches environment variables. After changing .env:

```bash
# Stop containers
docker-compose down

# Rebuild (if needed)
docker-compose build backend

# Start again
docker-compose up -d
```

### Issue 5: Volume Mount Override
The volume mount `../backend:/app` might be causing issues if the .env file inside the container is different.

## Step-by-Step Debugging

1. **Verify .env file exists and is readable**:
   ```bash
   cat backend/.env | grep AZURE_CLIENT_SECRET
   ```

2. **Check what Docker sees**:
   ```bash
   docker-compose exec backend env | grep AZURE
   ```

3. **Check the debug endpoint**:
   ```bash
   curl http://localhost:8000/api/v1/debug/auth-config | jq
   ```

4. **Compare values**:
   - What's in your local .env file?
   - What Docker shows in `printenv`?
   - What the debug endpoint shows?

5. **If values don't match**:
   - Check for quotes in .env
   - Verify path in docker-compose.yaml
   - Restart containers completely
   - Check for typos or hidden characters

## Alternative: Use environment section directly

If `env_file` isn't working, you can temporarily add values directly to docker-compose.yaml:

```yaml
environment:
  AZURE_TENANT_ID: your-tenant-id
  AZURE_CLIENT_ID: your-client-id
  AZURE_CLIENT_SECRET: your-client-secret
  # ... other vars
```

**WARNING**: Don't commit secrets to docker-compose.yaml! This is just for debugging.

## Verify the Fix

After making changes:
1. Restart containers: `docker-compose restart backend`
2. Check debug endpoint: `curl http://localhost:8000/api/v1/debug/auth-config`
3. Try logging in again
