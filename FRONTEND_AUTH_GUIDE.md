# Frontend Authentication Guide

This guide explains how to check if SSO is working and verify your login status in the ReadyGo application UI.

## How to Know If You're Logged In

### 1. **Visual Indicators in the Sidebar**

When you're logged in, you'll see:

- **User Information** at the bottom of the sidebar:
  - Your name (or email if name is not available)
  - Your email address
  - A "Sign out" button

- **If NOT logged in**, you'll see:
  - "Not signed in" message
  - A "Sign in" button

### 2. **Login Flow**

1. **Navigate to any page** - If you're not logged in, you'll be redirected to `/auth/login`
2. **Click "Sign in with Microsoft"** button
3. **You'll be redirected to Microsoft Entra ID** login page
4. **Enter your corporate credentials**
5. **After successful login**, you'll be redirected back to the app
6. **Your user info will appear** in the sidebar

### 3. **Check Authentication Status Programmatically**

If you're building custom components, you can check auth status using the `useAuth` hook:

```typescript
import { useAuth } from "@/hooks/useAuth";

function MyComponent() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return (
    <div>
      <p>Welcome, {user?.name || user?.email}!</p>
      <p>Employee ID: {user?.employee_id}</p>
    </div>
  );
}
```

### 4. **Browser Console Check**

Open your browser's developer console (F12) and check:

```javascript
// Check if token exists
localStorage.getItem('access_token')

// Check user info
JSON.parse(localStorage.getItem('user_info') || 'null')
```

### 5. **Network Tab Verification**

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Make any API request (e.g., navigate to Employees page)
4. Check the request headers - you should see:
   ```
   Authorization: Bearer <your-token>
   ```

## Troubleshooting

### "Not signed in" but I just logged in?

1. **Check browser console** for errors
2. **Verify token is stored**: `localStorage.getItem('access_token')`
3. **Clear cache and try again**
4. **Check if token expired** (tokens expire after 30 minutes by default)

### Redirected to login page repeatedly?

1. **Check backend logs** for authentication errors
2. **Verify your Employee record exists** in the database with matching email
3. **Check Employee status** - must be `"active"`
4. **Verify Entra ID configuration** in backend `.env` file

### "Employee record not found" error?

- Your email in Entra ID must match an Employee record in the database
- Contact your administrator to create your Employee account
- Ensure the email matches exactly (case-sensitive)

## API Authentication

All API requests automatically include your authentication token. The `fetchClient` automatically adds:

```
Authorization: Bearer <your-token>
```

If you see 401 Unauthorized errors:
1. Your token may have expired - log in again
2. Check that the token is being sent in request headers
3. Verify backend authentication is working

## Logging Out

To log out:

1. **Click "Sign out"** button in the sidebar, OR
2. **Navigate to** `/auth/login` and click logout, OR
3. **Clear localStorage**:
   ```javascript
   localStorage.removeItem('access_token');
   localStorage.removeItem('user_info');
   window.location.href = '/auth/login';
   ```

## Protected Routes

To protect a route (require authentication), wrap it with `ProtectedRoute`:

```typescript
import { ProtectedRoute } from "@/components/auth/protected-route";

export default function MyPage() {
  return (
    <ProtectedRoute>
      <div>This content requires authentication</div>
    </ProtectedRoute>
  );
}
```

## Quick Status Check

**Fastest way to check if you're logged in:**

1. Look at the **bottom of the sidebar** - you should see your name/email
2. If you see "Not signed in" → you're not logged in
3. If you see your name → you're logged in ✅

## Testing SSO Flow

1. **Start fresh**: Clear localStorage or use incognito mode
2. **Navigate to** `http://localhost:3000` (or your frontend URL)
3. **You should be redirected** to `/auth/login`
4. **Click "Sign in with Microsoft"**
5. **Complete Microsoft login**
6. **You should be redirected back** and see your user info in sidebar
7. **Navigate to any page** - should work without redirecting to login

## Common Issues

### Issue: "Authentication failed" error

**Solution**: 
- Check backend logs
- Verify Entra ID configuration
- Ensure Employee record exists

### Issue: Token not being sent with requests

**Solution**:
- Check `fetchClient.ts` - should include Authorization header
- Verify token is in localStorage
- Check browser console for errors

### Issue: Infinite redirect loop

**Solution**:
- Clear localStorage
- Check backend authentication endpoint
- Verify redirect URIs match in Azure App Registration

## Need Help?

If you're still having issues:

1. Check browser console for errors
2. Check backend logs
3. Verify all environment variables are set correctly
4. Ensure Employee record exists and is active
5. Test with a different browser or incognito mode
