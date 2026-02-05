# Fix: Invalid Client Secret Error

## Problem
You're seeing this error:
```
Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, 
not the client secret ID
```

## Root Cause
You copied the **Secret ID** instead of the **Secret Value** from Azure Portal.

## Solution

### Step 1: Get the Correct Client Secret Value

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Select your app registration (ReadyGo Platform)
4. Go to **Certificates & secrets**
5. Look at your existing client secret:
   - If it shows "Value" column with "Hidden" or "***" → The secret value is no longer visible
   - You need to create a **new** client secret

### Step 2: Create a New Client Secret

1. In **Certificates & secrets**, click **+ New client secret**
2. Add a description (e.g., "ReadyGo Production Secret")
3. Choose expiration (recommend 12-24 months)
4. Click **Add**
5. **IMPORTANT**: Copy the **Value** immediately (you won't be able to see it again!)
   - It will look like: `abc123~XYZ789...` (a long string)
   - Do NOT copy the "Secret ID" (which looks like a GUID)

### Step 3: Update Your .env File

In your `backend/.env` file, update:

```env
AZURE_CLIENT_SECRET=your-actual-secret-value-here
```

**Important**: 
- The secret value is a long string (usually 40+ characters)
- It may contain special characters like `~`, `-`, `_`, etc.
- Do NOT include quotes around it
- Make sure there are no extra spaces

### Step 4: Restart Your Backend

After updating the `.env` file:

```bash
# If running with Docker
docker-compose restart backend

# If running locally
# Stop and restart your backend server
```

### Step 5: Test Again

Try logging in again. The error should be resolved.

## How to Tell the Difference

- **Secret ID**: Looks like a GUID/UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **Secret Value**: A long random string (e.g., `abc~XYZ123-456_789...`)

## Security Best Practices

1. **Never commit secrets to git** - Your `.env` file should be in `.gitignore`
2. **Rotate secrets regularly** - Set expiration dates and rotate before they expire
3. **Use different secrets for different environments** - Dev, staging, production
4. **Store production secrets securely** - Use Azure Key Vault or similar for production

## Troubleshooting

### Still Getting the Error?

1. **Verify the secret value**:
   - Make sure you copied the entire value (it's usually quite long)
   - Check for any hidden characters or spaces
   - Ensure no quotes are included in the .env file

2. **Check the secret hasn't expired**:
   - In Azure Portal, check the expiration date
   - Create a new secret if it's expired

3. **Verify environment variables are loaded**:
   ```bash
   # In Docker
   docker exec readygo-backend printenv AZURE_CLIENT_SECRET
   
   # Should show your secret value (first few characters)
   ```

4. **Check for typos**:
   - Compare the first and last few characters of what you copied
   - Make sure there are no line breaks in the secret

### If You Lost the Secret Value

If you didn't copy the secret value when you created it:
1. You **cannot** retrieve it - Azure doesn't store it
2. You **must** create a new client secret
3. Delete the old one if you're not using it (for security)

## Example .env Entry

```env
# Correct format
AZURE_CLIENT_SECRET=abc~XYZ123-456_789.def/ghi=jkl+mno

# Wrong formats (don't do this)
AZURE_CLIENT_SECRET="abc~XYZ123..."  # No quotes
AZURE_CLIENT_SECRET= a1b2c3d4-e5f6-7890-abcd-ef1234567890  # This is Secret ID, not Value
AZURE_CLIENT_SECRET=abc~XYZ123...  # Extra spaces
```
