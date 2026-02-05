# Authentication Architecture

This document describes the centralized authentication architecture for the ReadyGo platform.

## Overview

Authentication is **mandatory** for all application screens and API endpoints (except health checks and auth endpoints). The architecture is designed to be:

- **Centralized**: Single source of truth for authentication logic
- **Consistent**: Same authentication mechanism everywhere
- **Maintainable**: Changes to auth logic happen in one place
- **Type-safe**: Proper TypeScript/Python typing throughout

## Frontend Architecture

### Authentication Guard (`components/auth/auth-guard.tsx`)

The `AuthGuard` component is the **single point of enforcement** for frontend authentication:

- **Location**: Applied at `app/(routes)/layout.tsx`
- **Purpose**: Protects all routes under `(routes)` automatically
- **Behavior**:
  - Checks authentication status
  - Redirects to `/auth/login` if not authenticated
  - Preserves intended destination via `returnUrl` query parameter
  - Allows public routes (like `/auth/*`) without authentication

**Usage**: No need to add to individual pages - it's applied at the layout level.

```typescript
// app/(routes)/layout.tsx
<AuthGuard>
  <MainLayout>{children}</MainLayout>
</AuthGuard>
```

### Auth Context (`hooks/useAuth.ts`)

Centralized authentication state management:

- Provides `useAuth()` hook for accessing auth state
- Manages token storage in localStorage
- Handles OAuth callback flow
- Exposes: `user`, `isAuthenticated`, `isLoading`, `login()`, `logout()`

**Usage**:
```typescript
const { user, isAuthenticated, logout } = useAuth();
```

### API Client (`lib/fetchClient.ts`)

Automatically includes authentication token in all API requests:

- Reads `access_token` from localStorage
- Adds `Authorization: Bearer <token>` header to all requests
- No need to manually add headers - it's automatic

## Backend Architecture

### Authentication Middleware (`app/api/v1/middleware.py`)

**Single source of truth** for backend authentication:

- `require_authentication()` dependency validates tokens
- Checks employee exists and is active
- Returns authenticated `Employee` object
- Used consistently across all protected routes

**Usage**:
```python
from app.api.v1.middleware import require_authentication

@router.get("/endpoint")
async def my_endpoint(
    current_employee: Employee = Depends(require_authentication)
):
    # current_employee is guaranteed to be authenticated and active
    ...
```

### Router Configuration (`app/api/v1/router.py`)

Authentication is applied at the **router level**:

- Public routes: `health`, `auth` (no authentication)
- Protected routes: All others (authentication required via dependency)

```python
# Public
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

# Protected - authentication enforced via dependency
api_router.include_router(
    employees.router,
    prefix="/employees",
    dependencies=[Depends(require_authentication)],
)
```

### Benefits of This Architecture

1. **Single Point of Change**: Update auth logic in one place (`middleware.py` or `auth-guard.tsx`)
2. **Consistent Behavior**: All routes behave the same way
3. **Type Safety**: TypeScript/Python types ensure correct usage
4. **Easy to Audit**: Can see all protected routes in `router.py`
5. **No Copy-Paste**: Authentication logic is not duplicated

## Authentication Flow

1. **User visits any page** → `AuthGuard` checks authentication
2. **Not authenticated** → Redirects to `/auth/login`
3. **User clicks "Sign in"** → Redirects to Entra ID
4. **User authenticates** → Entra ID redirects to `/auth/callback`
5. **Backend exchanges code** → Returns JWT token
6. **Frontend stores token** → Redirects to intended destination
7. **All API requests** → Include `Authorization: Bearer <token>` header
8. **Backend validates token** → Returns authenticated `Employee`

## Public Routes

Routes that **do not require** authentication:

- `/health` - Health check endpoint
- `/auth/*` - Authentication endpoints (login, callback, logout)

All other routes **require** authentication.

## Adding New Routes

### Frontend

1. Add route under `app/(routes)/` - automatically protected by `AuthGuard`
2. No additional code needed - authentication is automatic

### Backend

1. Create endpoint file in `app/api/v1/endpoints/`
2. Add router to `app/api/v1/router.py` with authentication dependency:

```python
api_router.include_router(
    my_new_router,
    prefix="/my-new-route",
    dependencies=[Depends(require_authentication)],
)
```

3. Use `require_authentication` in endpoint if you need the current employee:

```python
from app.api.v1.middleware import require_authentication

@router.get("/endpoint")
async def my_endpoint(
    current_employee: Employee = Depends(require_authentication)
):
    ...
```

## Security Considerations

1. **Tokens expire**: Default 30 minutes (configurable)
2. **Token storage**: localStorage (consider httpOnly cookies for production)
3. **HTTPS required**: Always use HTTPS in production
4. **Employee status**: Only active employees can authenticate
5. **Token validation**: Every API request validates the token

## Migration Notes

- Old `get_current_employee` from `app.deps.auth` still works (backward compatibility)
- Old `get_current_employee_optional` removed - authentication is now mandatory
- All routes now require authentication by default

## Troubleshooting

### Frontend: "Redirect loop to login"

- Check that token is being stored: `localStorage.getItem('access_token')`
- Verify `AuthGuard` is not blocking public routes
- Check browser console for errors

### Backend: "401 Unauthorized"

- Verify token is being sent: Check request headers
- Check token is valid: Not expired, correct format
- Verify Employee record exists and is active

### "Employee not found"

- Ensure Employee record exists with matching email
- Check Employee status is `"active"`
- Verify email matches exactly (case-sensitive)
