# Entra ID SSO Setup Guide

This guide explains how to set up Single Sign-On (SSO) using Microsoft Entra ID (Azure AD) for the ReadyGo platform.

## Overview

The ReadyGo platform uses Entra ID SSO to authenticate users. All employees must have:
1. A valid Entra ID account with email login
2. An Employee record in the ReadyGo database (linked by email)

## Setup Instructions

### 1. Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: ReadyGo Platform
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: 
     - Type: Web
     - URI: `http://localhost:8000/api/v1/auth/callback` (development)
     - For production: `https://your-domain.com/api/v1/auth/callback`
5. Click **Register**

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Delegated permissions**
3. Add the following permissions:
   - `User.Read` (to read user profile)
4. Click **Add permissions**
5. Click **Grant admin consent** (if you have admin rights)

### 3. Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and set expiration
4. Click **Add**
5. **IMPORTANT**: Copy the secret value immediately (you won't be able to see it again)

### 4. Configure Environment Variables

**Create a `.env` file in the `backend` directory** (if it doesn't already exist) and add the following Entra ID configuration:

**Location**: `backend/.env`

```env
# Entra ID (Azure AD) SSO Configuration
AZURE_TENANT_ID=your-tenant-id-here
AZURE_CLIENT_ID=your-client-id-here
AZURE_CLIENT_SECRET=your-client-secret-here
AZURE_REDIRECT_URI=http://localhost:8000/api/v1/auth/callback
AZURE_AUTHORITY=https://login.microsoftonline.com
# AZURE_SCOPES can be JSON array or comma-separated
AZURE_SCOPES=["User.Read"]
# Or: AZURE_SCOPES=User.Read
```

**Note**: If you already have a `.env` file in the `backend` directory, just add the Entra ID configuration section to it. The `.env` file is typically gitignored for security reasons.

You can find these values in your Azure App Registration:
- **Tenant ID**: Found in the app registration overview page
- **Client ID**: Found in the app registration overview page (Application ID)
- **Client Secret**: The secret you created in step 3

### 5. Install Dependencies

```bash
cd backend
poetry install
```

This will install the `msal` library required for Entra ID authentication.

## Employee Provisioning

### Question 1: Do I need to create all employee accounts manually?

**Answer**: Yes, you need to create Employee records in the ReadyGo database. However, you have two options:

#### Option A: Manual Creation (Current Implementation)

1. Create Employee records via the API or admin interface
2. Ensure the `email` field matches the employee's Entra ID email exactly
3. Set `status` to `"active"` for employees who should be able to log in

**Example API call:**
```bash
POST /api/v1/employees
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@yourcompany.com",  # Must match Entra ID email
  "employee_type": "full-time",
  "status": "active",
  "internal_cost_rate": 100.0,
  "internal_bill_rate": 150.0,
  "external_bill_rate": 200.0,
  "start_date": "2024-01-01"
}
```

#### Option B: Auto-Provisioning (Future Enhancement)

We can implement automatic employee provisioning where:
- When a user successfully authenticates with Entra ID but no Employee record exists
- The system automatically creates a basic Employee record
- Admin can then complete the employee profile with rates, delivery center, etc.

**To enable auto-provisioning**, we would need to modify `auth_service.py` to create employees automatically. Let me know if you'd like this feature.

### Question 2: Ensure SSO works for all Ready employees

**Answer**: Yes, SSO will work for all Ready employees who:
1. Have a valid Entra ID account with email login
2. Have an Employee record in ReadyGo with matching email
3. Have `status` set to `"active"`

## Authentication Flow

1. **User initiates login**: Frontend redirects to `/api/v1/auth/login`
2. **Redirect to Entra ID**: User is redirected to Microsoft login page
3. **User authenticates**: User enters credentials in Microsoft login page
4. **Callback**: Microsoft redirects back to `/api/v1/auth/callback` with authorization code
5. **Token exchange**: Backend exchanges code for access token
6. **User lookup**: Backend looks up Employee record by email
7. **JWT creation**: Backend creates JWT token for the session
8. **Response**: Frontend receives JWT token and user info

## Protecting Routes

To protect API routes, use the `get_current_employee` dependency:

```python
from app.deps.auth import get_current_employee
from app.models.employee import Employee

@router.get("/protected-endpoint")
async def protected_endpoint(
    current_employee: Employee = Depends(get_current_employee)
):
    # This endpoint requires authentication
    # current_employee is the authenticated Employee object
    return {"message": f"Hello {current_employee.email}"}
```

## Frontend Integration

### Login Flow

1. Redirect user to: `GET /api/v1/auth/login?redirect_uri=<your-frontend-url>`
2. User authenticates with Entra ID
3. Handle callback: `GET /api/v1/auth/callback?code=...&state=...`
4. Store JWT token from response
5. Include token in subsequent requests: `Authorization: Bearer <token>`

### Example Frontend Code

```typescript
// Initiate login
const login = () => {
  window.location.href = 'http://localhost:8000/api/v1/auth/login?redirect_uri=http://localhost:3000/dashboard';
};

// Handle callback (on callback page)
const handleCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (code) {
    const response = await fetch('http://localhost:8000/api/v1/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    
    const data = await response.json();
    // Store token
    localStorage.setItem('access_token', data.token.access_token);
    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
};

// Make authenticated requests
const apiCall = async () => {
  const token = localStorage.getItem('access_token');
  const response = await fetch('http://localhost:8000/api/v1/protected-endpoint', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.json();
};
```

## Troubleshooting

### "Employee record not found"
- Ensure the Employee record exists with matching email
- Check that email in Employee record exactly matches Entra ID email (case-sensitive)

### "Employee account is not active"
- Set Employee `status` to `"active"` in the database

### "Failed to acquire access token"
- Verify Azure App Registration configuration
- Check that client secret hasn't expired
- Ensure redirect URI matches exactly

### "Invalid authentication token"
- Token may have expired (default: 30 minutes)
- User needs to log in again

## Security Considerations

1. **HTTPS in Production**: Always use HTTPS in production
2. **Token Storage**: Store JWT tokens securely (httpOnly cookies recommended)
3. **Token Expiration**: Tokens expire after 30 minutes (configurable)
4. **CSRF Protection**: State parameter provides CSRF protection
5. **Employee Status**: Only active employees can authenticate

## Docker Configuration

If you're running the application with Docker, the `docker-compose.yaml` is configured to automatically load environment variables from `backend/.env`.

### Docker Setup Steps

1. **Create `.env` file** in the `backend` directory with all your environment variables (including Entra ID config)

2. **Update `AZURE_REDIRECT_URI`** in your `.env` file based on your setup:
   - **Development**: `http://localhost:8000/api/v1/auth/callback`
   - **Production**: `https://your-domain.com/api/v1/auth/callback`

3. **The docker-compose.yaml will automatically**:
   - Load all variables from `backend/.env` via `env_file`
   - Override specific variables for Docker networking (like `DATABASE_URL`)

4. **Start your containers**:
   ```bash
   cd config
   docker-compose up -d
   ```

### Important Notes for Docker

- The `.env` file is **not** copied into the Docker image (it's in `.dockerignore` for security)
- Docker Compose reads the `.env` file from your host filesystem
- Make sure your `AZURE_REDIRECT_URI` matches how you access the application:
  - If accessing via `localhost:8000` → use `http://localhost:8000/api/v1/auth/callback`
  - If accessing via domain → use `https://your-domain.com/api/v1/auth/callback`

### Verifying Environment Variables in Docker

To verify your environment variables are loaded correctly:

```bash
# Check environment variables in running container
docker exec readygo-backend env | grep AZURE

# Or check specific variable
docker exec readygo-backend printenv AZURE_TENANT_ID
```

## SharePoint document folders (Opportunity integration)

ReadyGo can link each opportunity to a folder in a document library on a SharePoint team site (for example **Active Projects**). Provisioning uses **Microsoft Graph with application permissions**; browsing files in the app uses **delegated** Graph permissions in the signed-in user’s context (same Entra tenant).

### Azure App Registration changes

1. In **API permissions** → **Microsoft Graph**:
   - **Application permissions** (admin consent): For **creating document libraries** via `POST .../lists`, add **`Sites.Manage.All`** (matches Microsoft’s wording for create/delete libraries and lists). **`Sites.ReadWrite.All`** is often added too; some tenants return **403** on list create with ReadWrite alone—see **Graph 403 on POST .../lists** below. Alternatively **`Sites.Selected`** (least privilege) after you **grant this app write** on the Active Projects site.
   - **Delegated permissions** (admin consent): **`Files.ReadWrite.All`** (or **`Sites.ReadWrite.All`**) if users should **upload files, create folders, and overwrite** from the Documents tab; use **`Files.Read.All`** / **`Sites.Read.All`** for **read-only** listing if you prefer least privilege.
2. Under **Authentication** → **Platform configurations** → **Single-page application**:
   - Add redirect URI: `http://localhost:3000` (and your production web origin). This is used by **@azure/msal-browser** on the Documents tab (popup flow).
3. The **Web** redirect URI for the backend (`/api/v1/auth/callback`) stays as-is for SSO.

### Backend environment (`backend/.env`)

```env
# Set true when Graph app permissions and site are configured
SHAREPOINT_INTEGRATION_ENABLED=false
SHAREPOINT_HOSTNAME=readymanagementsolutions.sharepoint.com
SHAREPOINT_SITE_PATH=sites/ActiveProjects
# document_library (default) = Pattern B: one document library per opportunity (shows under Site Contents).
# folder_inside_library = Pattern A: folder inside SHAREPOINT_LIBRARY_NAME.
SHAREPOINT_PROVISIONING_MODE=document_library
# Used only for folder_inside_library:
SHAREPOINT_LIBRARY_NAME=Documents
SHAREPOINT_PROJECTS_PARENT_PATH=
# Optional: when retrying provision moves the opportunity from a folder in one drive (e.g. Documents)
# to a different document library, migrate that folder's contents into the new library root.
# none (default) | move (single location) | copy (keep originals under Documents)
SHAREPOINT_FOLDER_MIGRATION_MODE=none
# Pattern B: after linking a document library, add left-nav link via SharePoint REST (see Quick Launch below)
SHAREPOINT_ADD_LIBRARY_TO_QUICK_LAUNCH=true
```

Uses the same **`AZURE_TENANT_ID`**, **`AZURE_CLIENT_ID`**, and **`AZURE_CLIENT_SECRET`** as SSO for the app-only Graph client. Optional Quick Launch-only certificate (see below): **`AZURE_SP_REST_CLIENT_CERTIFICATE_PATH`**, **`AZURE_SP_REST_CLIENT_CERTIFICATE_PASSWORD`**.

**Navigation (Quick Launch):** Microsoft Graph cannot update the left-hand menu. When **`SHAREPOINT_ADD_LIBRARY_TO_QUICK_LAUNCH=true`** (default), the backend calls **SharePoint REST** (`/_api/web/navigation/QuickLaunch`) after each successful **document library** link/create.

**Required for Quick Launch (separate from Graph):** A token for `https://{SHAREPOINT_HOSTNAME}/.default` has audience **`00000003-0000-0ff1-ce00-000000000000`** (Office 365 SharePoint Online). Entra will issue that token even if you only consented **Microsoft Graph** permissions, but the JWT will have **empty `roles`** — SharePoint then returns **401** on `_api`, and ReadyGo logs `Quick Launch skipped: SharePoint token … roles=None`.

**Common mistake:** Your API permissions table shows **two sections** in the portal: permissions are grouped by **API name**. If **`Sites.Manage.All`**, **`Sites.FullControl.All`**, or **`Sites.ReadWrite.All`** appear **only** under **Microsoft Graph (10)** (or similar), that is **not** enough. Those apply to `graph.microsoft.com`, not to `*.sharepoint.com/_api`. You need the **same kind** of permission listed again under a **second** API: **Office 365 SharePoint Online**.

Add SharePoint (not Graph) permissions like this:

1. **App registration** → **API permissions** → **Add a permission**.
2. Switch to the **APIs my organization uses** tab (do **not** stop on the default “Microsoft Graph” screen).
3. Search **`SharePoint`** → select **Office 365 SharePoint Online** (application id **`00000003-0000-0ff1-ce00-000000000000`**).
4. **Application permissions** → enable **`Sites.Manage.All`** or **`Sites.FullControl.All`** (either is fine for navigation REST).
5. **Add permissions**, then **Grant admin consent for [tenant]**.
6. Confirm the table now has **two** expandable rows: **Microsoft Graph** and **Office 365 SharePoint Online**, with at least one **Application** permission under SharePoint Online showing **Granted**.
7. Restart the backend container/process, then **Retry link to SharePoint** on an opportunity so Quick Launch runs again.

**401 on `_api` even when the SharePoint token has `roles`:** SharePoint Online commonly **rejects app-only tokens obtained with a client secret** for legacy REST (`/_api`), while **Microsoft Graph** accepts the same app with a secret. Community and Microsoft Q&A report success only after switching to **certificate-based** client credentials for the SharePoint host token. ReadyGo supports this without changing your Graph provisioning (which can keep using `AZURE_CLIENT_SECRET`):

1. In Entra → your app → **Certificates & secrets** → **Certificates** → **Upload** a public key (create a PFX locally with `openssl` or PowerShell, or use your org’s process).
2. In **`backend/.env`** set:
   - **`AZURE_SP_REST_CLIENT_CERTIFICATE_PATH`** — absolute path to the **PFX** file (in Docker, mount a volume and point to e.g. `/run/secrets/spo_quicklaunch.pfx`).
   - **`AZURE_SP_REST_CLIENT_CERTIFICATE_PASSWORD`** — PFX password if any (empty if none).
3. Restart the backend, then **Retry link to SharePoint** again.

$pwd = ConvertTo-SecureString -String "Ready2026!" -Force -AsPlainText
$cert = New-SelfSignedCertificate -Subject "CN=ReadyGo SharePoint REST" -CertStoreLocation "Cert:\" -KeyExportPolicy Exportable -KeySpec KeyExchange -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(2)
Export-PfxCertificate -Cert $cert -FilePath .\app.pfx -Password $pwd
Export-Certificate -Cert $cert -FilePath .\app.cer

When `AZURE_SP_REST_CLIENT_CERTIFICATE_PATH` is set, ReadyGo uses **only** that certificate to mint the SharePoint host token for Quick Launch (no secret fallback for that call).

Backend **`AZURE_SCOPES`** / **`User.Read`** does **not** affect this flow; Quick Launch uses client credentials and the SharePoint host scope only.

If Quick Launch is disabled or you skip SharePoint Online permissions, pin links manually via **Edit** next to the nav.

**Switched from folder to document library:** Opportunities that were provisioned earlier may still point at a **folder inside Documents**. Use **Retry link to SharePoint** on the opportunity Documents tab (available even when a link already exists—**Refresh** only reloads the file list) or call `POST /api/v1/opportunities/{id}/sharepoint/provision` after deploying `SHAREPOINT_PROVISIONING_MODE=document_library` so the app creates or links the **document library** and updates stored `webUrl` / drive ids.

**Optional file migration:** Set `SHAREPOINT_FOLDER_MIGRATION_MODE=move` to **move** each child from the old folder into the new library root (single copy; the old project folder under Documents may remain empty until you delete it). Use `copy` to **duplicate** files into the new library and leave the originals in Documents. Migration runs only when the stored `sharepoint_drive_id` differs from the new library’s drive (cross-library). If migration fails, the new link is still saved and `sharepoint_provisioning_error` records the failure.

### Frontend environment

Set in `.env.local` or Docker build args (must be `NEXT_PUBLIC_*` for the browser):

```env
NEXT_PUBLIC_AZURE_CLIENT_ID=<same app client id>
NEXT_PUBLIC_AZURE_TENANT_ID=<tenant id>
# Comma-separated. Read-only: Files.Read.All or Sites.Read.All. Upload / new folder: Files.ReadWrite.All or Sites.ReadWrite.All
NEXT_PUBLIC_GRAPH_SCOPES=Files.ReadWrite.All
```

### Database

Run Alembic migrations (e.g. from Docker: `docker compose -f config/docker-compose.yaml exec backend poetry run alembic upgrade head`) so `opportunities` gains SharePoint columns.

### Backfill existing opportunities

With `SHAREPOINT_INTEGRATION_ENABLED=true`, call:

`POST /api/v1/opportunities/sharepoint/provision-stale?limit=200`

(Authenticated; same JWT as other API calls.)

### SharePoint provisioning: Graph 401 / `generalException`

If logs show `GET https://graph.microsoft.com/v1.0/sites/...` → **401** (often with `"generalException"` in the JSON), the backend **did** obtain an access token, but that token has **no application permission** to read that SharePoint site.

1. Open the **same** app registration used for `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`.
2. **API permissions** → **Microsoft Graph** → **Application permissions** (not Delegated):
   - Add **`Sites.ReadWrite.All`**, **or** use **`Sites.Selected`** and complete Microsoft’s steps to grant this app **write** access to `https://readymanagementsolutions.sharepoint.com/sites/ActiveProjects` (Sites.Selected alone without a site grant behaves like no access).
3. Click **Grant admin consent for \<your tenant\>** and confirm the permission shows as granted.
4. Wait a few minutes, then retry **Retry link to SharePoint** (or reprovision).

**Common mistake:** Only **`Files.Read.All`** or **`User.Read`** under *Delegated* permissions does **not** authorize server-side folder provisioning. That requires **Application** permissions (or a different design such as running provisioning as a signed-in user).

### SharePoint provisioning: Graph 403 on `POST .../sites/.../lists`

If logs show **`accessDenied`** on **`POST https://graph.microsoft.com/v1.0/sites/.../lists`**, the app token is valid but is **not allowed to create lists** on that site.

**Why the Documents tab can work while provisioning still returns 403:** The SPA uses **delegated** Graph (MSAL in the browser, **your user’s** token). The backend uses **application** Graph (**client credentials**: client id + **client secret**, no signed-in user). Those are **two different tokens** with **two different permission models**. Loading folders/files only shows that **delegated** permissions (e.g. **`Files.Read.All`**, **`Sites.Read.All`**, or delegated **`Sites.ReadWrite.All`**) are granted and that the user can read that location. It does **not** prove that the **app-only** token used for `POST .../lists` contains **`Sites.ReadWrite.All`** in the **`roles`** claim, or that your tenant allows that **daemon** operation. So “I can browse Documents in the app” does **not** rule out a wrong backend secret, a missing **Application** role in the token, or a policy that blocks **app-only** writes.

**Cause A — `Sites.Selected` without a write grant:** You added the **Sites.Selected** application permission and clicked **Grant admin consent**, but you never granted this **client application** **write** (or full control) on **Active Projects**. A **read-only** site permission is enough for some `GET` calls but **not** for creating a document library.

**Fix A (recommended for production):** Grant the app **write** access to the site. Typical approach: Microsoft Graph **[Create permission](https://learn.microsoft.com/en-us/graph/api/site-post-permissions)** — `POST /sites/{site-id}/permissions` with `roles: ["write"]` (or `fullcontrol`) and your app’s `clientId` in `grantedToIdentities`. The caller’s token often needs a strong app permission (e.g. **`Sites.FullControl.All`**) or you use SharePoint admin / PnP flows your tenant allows; see Microsoft’s **Sites.Selected** guidance. Use the **same** `site-id` Graph uses in your logs (the full `hostname,guid,guid` form is fine). After granting, wait a few minutes and retry **Retry link to SharePoint**.

**Cause B — Wrong application permission for *creating* libraries:** Microsoft’s [Create list](https://learn.microsoft.com/en-us/graph/api/list-create) API lists **Application** **`Sites.Manage.All`** as the *least* privileged permission and **`Sites.ReadWrite.All`** as higher privileged—but the [permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) text differs: **`Sites.Manage.All` (application)** explicitly allows the app to “**create or delete document libraries and lists**,” while **`Sites.ReadWrite.All` (application)** is described as operating on “**documents and list items**.” In practice, **`POST .../sites/.../lists`** (document library provisioning) may return **403** even when the app-only token’s **`roles`** include **`Sites.ReadWrite.All`** only. **Fix:** In the same app registration, add **Application** permission **`Sites.Manage.All`**, grant admin consent, wait a few minutes, restart the backend, and retry.

**Quick unblock:** Add **Application** **`Sites.Manage.All`** (recommended for list/library create). You can keep **`Sites.ReadWrite.All`** as well; both may appear in the token’s **`roles`** array.

### 403 on `POST .../lists` **even though** Application `Sites.ReadWrite.All` shows “Granted”

We verified against a running **Docker** backend: the client-credentials token can include **`roles`: `["Sites.ReadWrite.All"]`** and **`POST .../lists`** still returns **403**. That rules out “wrong `AZURE_CLIENT_ID`” and “permission missing from token” for that scenario. The next step is **Application** **`Sites.Manage.All`** (see **Cause B** above) and/or tenant SharePoint policy.

Your Entra screenshot can also be “correct” yet Graph still returns **403** if the **token** does not match what you think (wrong app/tenant/secret)—use the checklist below to confirm.

1. **Same app as `.env`:** In the app registration **Overview**, copy **Application (client) ID**. It must match **`AZURE_CLIENT_ID`** in `backend/.env` (and in Docker: `docker compose ... exec backend printenv AZURE_CLIENT_ID`). A second “staging” or old registration is a frequent mismatch.
2. **Same tenant:** **`AZURE_TENANT_ID`** must be the directory where you granted admin consent (“Ready Management Solutions”).
3. **Current client secret:** If the secret was rotated, the old value in `.env` must be updated; restart the backend container/process after any change.
4. **Verify the token’s `roles`:** With client credentials, acquire a token for scope `https://graph.microsoft.com/.default` (same as the backend). Decode the JWT at [jwt.ms](https://jwt.ms). Under **Claims**, **`roles`** should include **`Sites.ReadWrite.All`**. If `roles` is missing or empty, Entra consent and the app id used to get the token do not line up.
5. **Propagation:** After adding or consenting application permissions, wait **15–30 minutes** and restart the backend, then retry.
6. **Tenant / SharePoint policy:** Some organizations restrict which apps can use SharePoint APIs. Work with your M365/SharePoint admin to confirm nothing blocks **this** enterprise application from **write** access to site content (admin center policies, “block / allow” lists for apps, etc.).

If **`roles`** contains **`Sites.ReadWrite.All`** but **403 persists**, the issue is almost always **tenant or SharePoint-side policy** on that site or library creation—not ReadyGo code.

## Next Steps

1. Set up Azure App Registration
2. Configure environment variables in `backend/.env`
3. If using Docker, verify variables are loaded correctly
4. Create Employee records for all Ready employees
5. Test SSO login flow
6. Update frontend to use SSO authentication
7. Protect API routes with authentication dependency

## Production (Azure Container Apps)

For Consult Cortex deployments on Azure Container Apps, register the API redirect URI as `https://<your-api-fqdn>/api/v1/auth/callback` (from Bicep outputs) and set backend `CORS_ORIGINS` to include the deployed frontend URL. See [infra/README.md](infra/README.md) for infrastructure and GitHub Actions OIDC setup.

## Support

If you encounter issues:
1. Check Azure App Registration configuration
2. Verify environment variables are set correctly
3. Check Employee records exist and are active
4. Review application logs for detailed error messages
