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

## Next Steps

1. Set up Azure App Registration
2. Configure environment variables in `backend/.env`
3. If using Docker, verify variables are loaded correctly
4. Create Employee records for all Ready employees
5. Test SSO login flow
6. Update frontend to use SSO authentication
7. Protect API routes with authentication dependency

## Support

If you encounter issues:
1. Check Azure App Registration configuration
2. Verify environment variables are set correctly
3. Check Employee records exist and are active
4. Review application logs for detailed error messages
