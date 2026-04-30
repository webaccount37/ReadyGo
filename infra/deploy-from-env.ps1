<#
.SYNOPSIS
  Deploy Consult Cortex from backend/.env (two-phase: core + DB app user in Key Vault, then Container Apps).

.DESCRIPTION
  Reads KEY=value lines from backend/.env (skips # comments).
  Uses: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, CORS_ORIGINS (optional), POSTGRES_ADMIN_PASSWORD (optional), SECRET_KEY (optional).
  Auto-generates missing: SECRET_KEY, POSTGRES_ADMIN_PASSWORD (only when not already in .env or Key Vault from a prior run), dedicated PostgreSQL app user + password (reused from Key Vault on re-runs unless -RegeneratePostgresAppUser; each run syncs that role on the server with ALTER PASSWORD or CREATE ROLE).
  Phase 1: Bicep deployContainerApps=false.
  Installs Azure CLI extension rdbms-connect if needed (required for az postgres flexible-server execute).
  Adds a temporary PostgreSQL firewall rule for this machine's public IPv4 via Azure REST (Bicep only allows Azure services via 0.0.0.0).
  Override IP: env CC_DEPLOY_POSTGRES_CLIENT_IP or parameter -PostgresClientIp. Rule is removed after DB bootstrap succeeds.
  Ensures database readygo exists (CREATE DATABASE if missing; no-op if already present).
  Ensures the app DB role exists and its password matches Key Vault on every run (ALTER PASSWORD when the role exists, CREATE ROLE when missing — fixes drift if secrets were written before CREATE succeeded or KV was seeded manually). New random `ccapp_*` credentials only when Key Vault has none or you pass -RegeneratePostgresAppUser. Applies grants on `readygo` each run (idempotent for that user). Writes Key Vault database + Postgres secrets only when missing or when values change; use -RefreshKvPostgresAdmin to force-write `postgres-admin-password`.
  Optionally runs **Alembic** on your machine against the Azure DB (when `backend/.venv` or Poetry is available) so migration errors surface before Container Apps roll. If neither is present, that step is **skipped** with a warning; the **API container still runs `alembic upgrade head` on startup** (`start.sh`). Use **-SkipAlembic** to always skip the local step (e.g. faster re-runs when the DB is already migrated).
  Phase 2: Bicep deployContainerApps=true (same deployment name). Before phase 2, ensures **backend** / **frontend** image tags exist in the deployment ACR (defaults **latest**): missing images are built with **`az acr build`** from this repo unless you pass **-SkipAcrImageBuild** (fail fast if tags are absent). Pass **-BackendImageTag** / **-FrontendImageTag** for existing tags. Container start.sh also runs alembic (idempotent second pass).

  App configuration for Azure is seeded into **Key Vault** (see script). The account used with `az login` needs **Key Vault Secrets Officer** (or equivalent data-plane access) on **that vault** to run `az keyvault secret show` / `set` — **Contributor on the resource group is not enough** when the vault uses RBAC. First run seeds from .env; existing secrets are skipped unless you pass **-RefreshKeyVaultConfig**.

  **Re-runs:** PostgreSQL admin password is taken from .env, else from Key Vault `postgres-admin-password` if the deployment already exists, else auto-generated once. App DB user/password are **reused** from Key Vault unless **-RegeneratePostgresAppUser**. Key Vault `database-url` / app / admin secrets are **not overwritten** when values are unchanged (avoids rotating credentials accidentally). Use **-RefreshKvPostgresAdmin** to push the current admin password into KV again.

  From repo root:
    .\infra\deploy-from-env.ps1 -ResourceGroup rg-consultcortex-staging -EnvironmentName staging
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ResourceGroup,
    [string] $EnvironmentName = "staging",
    [string] $Location = "eastus2",
    [string] $EnvPath = "",
    [string] $DeploymentName = "consultcortex-main",
    [string] $CorsOverride = "",
    [string] $BackendImageTag = "latest",
    [string] $FrontendImageTag = "latest",
    [string] $PostgresClientIp = "",
    [switch] $SkipAlembic,
    [switch] $SkipAcrImageBuild,
    [switch] $RefreshKeyVaultConfig,
    [switch] $RegeneratePostgresAppUser,
    [switch] $RefreshKvPostgresAdmin
)

$ErrorActionPreference = "Stop"
# PowerShell 7+: stderr from native commands (e.g. az deprecation warnings) otherwise becomes terminating with -Stop.
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Format-AzCliLine([object] $Line) {
    if ($Line -is [System.Management.Automation.ErrorRecord]) {
        $er = $Line
        $msg = $er.Exception.Message
        if (-not [string]::IsNullOrWhiteSpace($msg)) { return $msg }
        $t = $er.ToString()
        if (-not [string]::IsNullOrWhiteSpace($t)) { return $t }
        if ($null -ne $er.CategoryInfo) {
            $c = $er.CategoryInfo.ToString()
            if (-not [string]::IsNullOrWhiteSpace($c)) { return $c }
        }
        return 'ErrorRecord (no message; enable az --debug for details)'
    }
    return "$Line"
}

# Run `az` and merge stderr into text so SecretNotFound / warnings do not terminate under $ErrorActionPreference = Stop.
function Invoke-AzCliOutput([string[]] $Arguments) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        $lines = & az @Arguments 2>&1
        $ec = $LASTEXITCODE
        $text = ($lines | ForEach-Object { Format-AzCliLine $_ }) -join "`n"
        return [pscustomobject]@{ ExitCode = $ec; Output = $text }
    } finally {
        $ErrorActionPreference = $old
    }
}

# `az postgres flexible-server execute` writes benign messages (e.g. "WARNING: Successfully connected...") to stderr;
# PowerShell 7+ can surface those as terminating NativeCommandError when $ErrorActionPreference is Stop.
function Invoke-AzPostgresExecute([string] $Server, [string] $User, [string] $Password, [string] $Database, [string] $QueryText) {
    return Invoke-AzCliOutput @(
        'postgres', 'flexible-server', 'execute',
        '-n', $Server,
        '-u', $User,
        '-p', $Password,
        '--database-name', $Database,
        '--querytext', $QueryText
    )
}

function Get-AcrNameFromLoginServer([string] $LoginServer) {
    $s = $LoginServer.Trim().ToLowerInvariant()
    $suffix = '.azurecr.io'
    if (-not $s.EndsWith($suffix)) {
        throw "Unexpected ACR login server (expected *$suffix): $LoginServer"
    }
    return $s.Substring(0, $s.Length - $suffix.Length)
}

function Get-AcrRepositoryTags([string] $AcrName, [string] $Repository) {
    $r = Invoke-AzCliOutput @('acr', 'repository', 'show-tags', '--name', $AcrName, '--repository', $Repository, '-o', 'json')
    if ($r.ExitCode -ne 0) { return $null }
    try {
        $tags = $r.Output | ConvertFrom-Json
    } catch {
        return $null
    }
    if ($null -eq $tags) { return @() }
    if ($tags -isnot [System.Array]) { return @($tags) }
    return $tags
}

function Test-AcrRepositoryHasTag([string] $AcrName, [string] $Repository, [string] $Tag) {
    $tags = Get-AcrRepositoryTags $AcrName $Repository
    if ($null -eq $tags) { return $false }
    return $tags -contains $Tag
}

function Assert-AcrRepositoryHasTag([string] $AcrName, [string] $Repository, [string] $Tag) {
    $tags = Get-AcrRepositoryTags $AcrName $Repository
    if ($null -eq $tags) {
        throw "Cannot list tags for ACR repository '$Repository' in registry '$AcrName'. Check the registry name and that your 'az login' identity can read ACR. If the repository is new, omit -SkipAcrImageBuild so this script runs az acr build from the repo, or push images manually."
    }
    if ($tags -notcontains $Tag) {
        $listed = if ($tags.Count -gt 0) { ($tags | ForEach-Object { "$_" }) -join ', ' } else { '(none)' }
        throw "ACR '$AcrName' repository '$Repository' has no tag '$Tag'. Push that tag, pass -BackendImageTag / -FrontendImageTag, or omit -SkipAcrImageBuild to build automatically. Existing tags: $listed`nBackend: az acr build -r $AcrName --image backend:$Tag --file backend/Dockerfile backend`nFrontend: az acr build -r $AcrName --image frontend:$Tag --file frontend/Dockerfile frontend"
    }
}

function Invoke-AcrBuildBackend([string] $RepoRoot, [string] $AcrName, [string] $Tag) {
    $dockerfile = Join-Path $RepoRoot 'backend\Dockerfile'
    $context = Join-Path $RepoRoot 'backend'
    if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Dockerfile not found: $dockerfile" }
    Write-Host "=== az acr build: backend:$Tag (several minutes) ===" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        az acr build -r $AcrName --image "backend:$Tag" --file $dockerfile $context
        if ($LASTEXITCODE -ne 0) { throw "az acr build backend failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

function Invoke-AcrBuildFrontend([string] $RepoRoot, [string] $AcrName, [string] $Tag) {
    $dockerfile = Join-Path $RepoRoot 'frontend\Dockerfile'
    $context = Join-Path $RepoRoot 'frontend'
    if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Dockerfile not found: $dockerfile" }
    Write-Host "=== az acr build: frontend:$Tag (several minutes) ===" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        az acr build -r $AcrName --image "frontend:$Tag" --file $dockerfile $context
        if ($LASTEXITCODE -ne 0) { throw "az acr build frontend failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

function Ensure-AcrImagesForContainerApps(
    [string] $RepoRoot,
    [string] $AcrName,
    [string] $BackendTag,
    [string] $FrontendTag,
    [switch] $SkipAcrImageBuild
) {
    $autoBuild = -not $SkipAcrImageBuild
    Write-Host "=== Container Apps images (ACR '$AcrName') ===" -ForegroundColor Cyan
    if (Test-AcrRepositoryHasTag $AcrName 'backend' $BackendTag) {
        Write-Host "  backend:${BackendTag} already in ACR" -ForegroundColor DarkGray
    }
    elseif ($autoBuild) {
        Invoke-AcrBuildBackend $RepoRoot $AcrName $BackendTag
    }
    else {
        Assert-AcrRepositoryHasTag $AcrName 'backend' $BackendTag
    }

    if (Test-AcrRepositoryHasTag $AcrName 'frontend' $FrontendTag) {
        Write-Host "  frontend:${FrontendTag} already in ACR" -ForegroundColor DarkGray
    }
    elseif ($autoBuild) {
        Invoke-AcrBuildFrontend $RepoRoot $AcrName $FrontendTag
    }
    else {
        Assert-AcrRepositoryHasTag $AcrName 'frontend' $FrontendTag
    }

    Assert-AcrRepositoryHasTag $AcrName 'backend' $BackendTag
    Assert-AcrRepositoryHasTag $AcrName 'frontend' $FrontendTag
}

# `az rest` often writes failures only to stderr; native stderr can yield empty ErrorRecord.Message on Windows PowerShell.
function Invoke-AzCliRest([string] $Method, [string] $Uri, [string] $SubscriptionId, [string] $BodyJson = $null) {
    $stderrPath = Join-Path $env:TEMP ("cc-az-rest-err-{0}.txt" -f [Guid]::NewGuid().ToString('n'))
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $bodyPath = $null
    try {
        $useBody = -not [string]::IsNullOrWhiteSpace($BodyJson)
        if ($useBody) {
            $bodyPath = Join-Path $env:TEMP ("cc-az-rest-body-{0}.json" -f [Guid]::NewGuid().ToString('n'))
            [System.IO.File]::WriteAllText($bodyPath, $BodyJson, $utf8NoBom)
            $stdout = & az rest --method $Method --url $Uri --body "@$bodyPath" `
                --headers "Content-Type=application/json" `
                --subscription $SubscriptionId 2>$stderrPath
        } else {
            $stdout = & az rest --method $Method --url $Uri --subscription $SubscriptionId 2>$stderrPath
        }
        $ec = $LASTEXITCODE
        $errText = ''
        if (Test-Path -LiteralPath $stderrPath) {
            $errText = [System.IO.File]::ReadAllText($stderrPath)
        }
        $outText = if ($null -eq $stdout) { '' } elseif ($stdout -is [array]) { ($stdout | ForEach-Object { Format-AzCliLine $_ }) -join "`n" } else { Format-AzCliLine $stdout }
        $merged = @($outText.Trim(), $errText.Trim()) | Where-Object { $_ } | ForEach-Object { $_.Trim() }
        $text = $merged -join "`n"
        return [pscustomobject]@{ ExitCode = $ec; Output = $text }
    } finally {
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
        if ($null -ne $bodyPath) {
            Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Read-DotEnvFile([string] $Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Env file not found: $Path"
    }
    $dict = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $k = $line.Substring(0, $idx).Trim()
        $v = $line.Substring($idx + 1).Trim()
        if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
            $v = $v.Substring(1, $v.Length - 2).Replace('""', '"')
        }
        $dict[$k] = $v
    }
    $dict
}

function New-Alnum([int] $Length) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Get-Or([hashtable] $Map, [string] $Key, [string] $Default) {
    if ($Map.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Map[$Key])) { return $Map[$Key] }
    return $Default
}

function Get-DeployPublicIpv4([string] $Override) {
    if (-not [string]::IsNullOrWhiteSpace($Override)) { return $Override.Trim() }
    $envIp = [Environment]::GetEnvironmentVariable('CC_DEPLOY_POSTGRES_CLIENT_IP')
    if (-not [string]::IsNullOrWhiteSpace($envIp)) { return $envIp.Trim() }
    try {
        return (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 20).ToString().Trim()
    } catch {
        throw "Could not fetch your public IPv4 from api.ipify.org. Set CC_DEPLOY_POSTGRES_CLIENT_IP or pass -PostgresClientIp. $($_.Exception.Message)"
    }
}

function Get-AzureSubscriptionId() {
    $r = Invoke-AzCliOutput @('account', 'show', '--query', 'id', '-o', 'tsv')
    if ($r.ExitCode -ne 0) { throw "Could not read Azure subscription id: $($r.Output)" }
    return $r.Output.Trim()
}

function Set-PostgresDeployFirewallRule([string] $Rg, [string] $Server, [string] $Rule, [string] $Ip) {
    $sub = Get-AzureSubscriptionId
    $uri = "https://management.azure.com/subscriptions/$sub/resourceGroups/$Rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/$Server/firewallRules/$Rule" + '?api-version=2022-12-01'
    $bodyObj = [ordered]@{
        properties = [ordered]@{
            startIpAddress = $Ip
            endIpAddress   = $Ip
        }
    }
    $bodyJson = $bodyObj | ConvertTo-Json -Compress
    $r = Invoke-AzCliRest -Method 'put' -Uri $uri -SubscriptionId $sub -BodyJson $bodyJson
    if ($r.ExitCode -ne 0) {
        $uriPrev = "https://management.azure.com/subscriptions/$sub/resourceGroups/$Rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/$Server/firewallRules/$Rule" + '?api-version=2023-12-01-preview'
        $r2 = Invoke-AzCliRest -Method 'put' -Uri $uriPrev -SubscriptionId $sub -BodyJson $bodyJson
        if ($r2.ExitCode -ne 0) {
            $hint = "If this is RBAC, ensure your principal can write Microsoft.DBforPostgreSQL/flexibleServers/firewallRules on the server (e.g. Contributor on the resource group). az rest (2022-12-01): $($r.Output); az rest (2023-12-01-preview): $($r2.Output)"
            throw "Failed to set PostgreSQL firewall rule '$Rule' for ${Ip}. $hint"
        }
        return
    }
}

function Remove-PostgresDeployFirewallRule([string] $Rg, [string] $Server, [string] $Rule) {
    $sub = Get-AzureSubscriptionId
    $uri = "https://management.azure.com/subscriptions/$sub/resourceGroups/$Rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/$Server/firewallRules/$Rule" + '?api-version=2022-12-01'
    $r = Invoke-AzCliRest -Method 'delete' -Uri $uri -SubscriptionId $sub
    if ($r.ExitCode -eq 0) { return 0 }
    if ($r.Output -match '404|NotFound|ResourceNotFound') { return 0 }
    $uriPrev = "https://management.azure.com/subscriptions/$sub/resourceGroups/$Rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/$Server/firewallRules/$Rule" + '?api-version=2023-12-01-preview'
    $r2 = Invoke-AzCliRest -Method 'delete' -Uri $uriPrev -SubscriptionId $sub
    if ($r2.ExitCode -eq 0) { return 0 }
    if ($r2.Output -match '404|NotFound|ResourceNotFound') { return 0 }
    return $r2.ExitCode
}

function Test-KvSecretExists([string] $VaultName, [string] $Name) {
    $r = Invoke-AzCliOutput @('keyvault', 'secret', 'show', '--vault-name', $VaultName, '-n', $Name)
    return ($r.ExitCode -eq 0)
}

function Get-KvSecretPlain([string] $VaultName, [string] $Name, [switch] $ErrorOnForbidden) {
    $r = Invoke-AzCliOutput @('keyvault', 'secret', 'show', '--vault-name', $VaultName, '-n', $Name, '--query', 'value', '-o', 'tsv')
    if ($r.ExitCode -eq 0) { return $r.Output.Trim() }
    if ($ErrorOnForbidden -and ($r.Output -match 'Forbidden|not authorized|AuthorizationFailed')) {
        throw "Key Vault denied reading secret '$Name' on vault '$VaultName'. Assign **Key Vault Secrets Officer** on that vault to the principal used by 'az login'. See infra/README.md."
    }
    return $null
}

function Set-KvSecretIfChanged([string] $VaultName, [string] $Name, [string] $Value, [string] $Label) {
    $cur = Get-KvSecretPlain $VaultName $Name
    if ($null -ne $cur -and $cur -eq $Value) {
        Write-Host "  skip $Label (Key Vault unchanged)" -ForegroundColor DarkGray
        return
    }
    $setR = Invoke-AzCliOutput @('keyvault', 'secret', 'set', '--vault-name', $VaultName, '--name', $Name, '--value', $Value)
    if ($setR.ExitCode -ne 0) { throw "Failed to set Key Vault secret ${Name}: $($setR.Output)" }
    Write-Host "  set $Label" -ForegroundColor DarkGray
}

function Set-KvAppConfigurationSecrets(
    [string] $VaultName,
    [string] $ResourceGroup,
    [psobject] $DeploymentOutputs,
    [hashtable] $DotEnv,
    [string] $Cors,
    [string] $TenantId,
    [string] $ClientId,
    [bool] $Force
) {
    Write-Host "=== Key Vault app configuration (for Container Apps secretRef) ===" -ForegroundColor Cyan
    $np = $DeploymentOutputs.namePrefix.value
    $st = $DeploymentOutputs.storageAccountName.value
    $kvUri = $DeploymentOutputs.keyVaultUri.value
    $mi = $DeploymentOutputs.backendManagedIdentityClientId.value
    $redisUrl = "redis://${np}-redis:6379/0"
    $otel = Get-Or $DotEnv "OTEL_ENVIRONMENT" "production"
    $redirect = Get-Or $DotEnv "AZURE_REDIRECT_URI" "https://placeholder.invalid/api/v1/auth/callback"

    $pairs = [ordered]@{
        "redis-url"                          = $redisUrl
        "cors-origins"                         = $Cors
        "azure-storage-account-name"         = $st
        "azure-managed-identity-client-id"   = $mi
        "azure-tenant-id"                    = $TenantId
        "azure-client-id"                    = $ClientId
        "azure-key-vault-url"                = $kvUri
        "otel-environment"                   = $otel
        "azure-redirect-uri"                 = $redirect
    }
    foreach ($name in $pairs.Keys) {
        $val = $pairs[$name]
        if ($Force) {
            $setR = Invoke-AzCliOutput @('keyvault', 'secret', 'set', '--vault-name', $VaultName, '--name', $name, '--value', $val)
            if ($setR.ExitCode -ne 0) { throw "Failed to set Key Vault secret ${name}: $($setR.Output)" }
            Write-Host "  set $name (forced)" -ForegroundColor DarkGray
            continue
        }
        $showR = Invoke-AzCliOutput @('keyvault', 'secret', 'show', '--vault-name', $VaultName, '-n', $name)
        if ($showR.ExitCode -eq 0) {
            Write-Host "  skip $name (already exists)" -ForegroundColor DarkGray
            continue
        }
        if ($showR.Output -match 'Forbidden|not authorized|AuthorizationFailed|unauthorized') {
            $scopeR = Invoke-AzCliOutput @('keyvault', 'show', '-g', $ResourceGroup, '-n', $VaultName, '--query', 'id', '-o', 'tsv')
            $vaultScope = if ($scopeR.ExitCode -eq 0) { $scopeR.Output.Trim() } else { "(Key Vault '$VaultName' in resource group '$ResourceGroup')" }
            throw @"
Key Vault denied reading secret '$name' (data plane RBAC). Resource group Owner/Contributor does not include Key Vault secret access.

Grant the principal you use with 'az login' the role **Key Vault Secrets Officer** on the vault:

  az role assignment create --role 'Key Vault Secrets Officer' --assignee YOUR_EMAIL_OR_OBJECT_ID --scope '$vaultScope'

Or in Azure Portal: Key Vault '$VaultName' -> Access control (IAM) -> Add role assignment -> Key Vault Secrets Officer.

Resolve the vault name from your deployment: az deployment group show -g '$ResourceGroup' -n '$DeploymentName' --query properties.outputs.keyVaultName.value -o tsv

Then re-run this script. See: https://learn.microsoft.com/azure/key-vault/general/rbac-guide
"@
        }
        $createR = Invoke-AzCliOutput @('keyvault', 'secret', 'set', '--vault-name', $VaultName, '--name', $name, '--value', $val)
        if ($createR.ExitCode -ne 0) {
            throw "Failed to create Key Vault secret ${name}: $($createR.Output). If forbidden, assign **Key Vault Secrets Officer** on vault '$VaultName'."
        }
        Write-Host "  created $name" -ForegroundColor DarkGray
    }
}

function Invoke-BackendAlembicUpgrade([string] $DatabaseUrl, [string] $BackendDir) {
    Write-Host "=== Alembic upgrade head (backend, same as CI / start.sh) ===" -ForegroundColor Cyan
    $venvWin = Join-Path $BackendDir '.venv\Scripts\python.exe'
    $venvNix = Join-Path $BackendDir '.venv/bin/python'
    $pyVenv = if (Test-Path -LiteralPath $venvWin) { $venvWin } elseif (Test-Path -LiteralPath $venvNix) { $venvNix } else { $null }

    $prevDb = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
    $prevNative = $null
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $prevNative = $PSNativeCommandUseErrorActionPreference
        $PSNativeCommandUseErrorActionPreference = $false
    }
    $oldEa = $ErrorActionPreference
    Push-Location $BackendDir
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        $env:DATABASE_URL = $DatabaseUrl
        $exit = -1

        if ($null -ne $pyVenv) {
            Write-Host "Using $pyVenv -m alembic (backend/.venv)" -ForegroundColor DarkGray
            & $pyVenv -m alembic upgrade head
            $exit = $LASTEXITCODE
        }
        elseif (Get-Command poetry -ErrorAction SilentlyContinue) {
            & poetry run alembic upgrade head
            $exit = $LASTEXITCODE
        }
        else {
            $null = & py -m poetry --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                & py -m poetry run alembic upgrade head
                $exit = $LASTEXITCODE
            }
            else {
                $null = & python -m poetry --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    & python -m poetry run alembic upgrade head
                    $exit = $LASTEXITCODE
                }
            }
        }

        if ($exit -lt 0) {
            $skipAlembicMsg = @(
                "Skipping local Alembic: no backend/.venv Python and no Poetry on PATH (py/python -m poetry also unavailable).",
                "Deploy continues; the API container runs migrations on startup (backend/start.sh).",
                "To run migrations from this machine first, use 'poetry install' in backend/ or install Poetry, or pass -SkipAlembic to silence this warning when you always rely on the container."
            ) -join ' '
            Write-Warning $skipAlembicMsg
            return
        }
        if ($exit -ne 0) { throw "alembic upgrade head failed (exit $exit)" }
    } finally {
        $ErrorActionPreference = $oldEa
        if ($null -ne $prevNative) { $PSNativeCommandUseErrorActionPreference = $prevNative }
        if ($null -ne $prevDb -and $prevDb -ne "") {
            $env:DATABASE_URL = $prevDb
        } else {
            Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
        }
        Pop-Location
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $EnvPath) { $EnvPath = Join-Path $RepoRoot "backend\.env" }
$e = Read-DotEnvFile $EnvPath

$azureTenantId = Get-Or $e "AZURE_TENANT_ID" ""
$azureClientId = Get-Or $e "AZURE_CLIENT_ID" ""
$azureClientSecret = Get-Or $e "AZURE_CLIENT_SECRET" ""
$appSecretKey = Get-Or $e "SECRET_KEY" ""
$pgAdminPassword = Get-Or $e "POSTGRES_ADMIN_PASSWORD" ""
$cors = if ($CorsOverride) { $CorsOverride } else { Get-Or $e "CORS_ORIGINS" '["https://placeholder.invalid"]' }

if ([string]::IsNullOrWhiteSpace($azureTenantId)) { throw "AZURE_TENANT_ID missing in .env" }
if ([string]::IsNullOrWhiteSpace($azureClientId)) { throw "AZURE_CLIENT_ID missing in .env" }
if ([string]::IsNullOrWhiteSpace($azureClientSecret)) { throw "AZURE_CLIENT_SECRET missing in .env" }
if ([string]::IsNullOrWhiteSpace($appSecretKey)) { $appSecretKey = (New-Alnum 48) }

if ([string]::IsNullOrWhiteSpace($pgAdminPassword)) {
    $depJson = Invoke-AzCliOutput @('deployment', 'group', 'show', '-g', $ResourceGroup, '-n', $DeploymentName, '-o', 'json')
    if ($depJson.ExitCode -eq 0) {
        try {
            $d = $depJson.Output | ConvertFrom-Json
        } catch {
            $d = $null
        }
        if ($null -ne $d) {
            $preKv = $d.properties.outputs.keyVaultName.value
            if (-not [string]::IsNullOrWhiteSpace($preKv)) {
                $pgAdminPassword = Get-KvSecretPlain $preKv 'postgres-admin-password' -ErrorOnForbidden
            }
        }
    }
}
if ([string]::IsNullOrWhiteSpace($pgAdminPassword)) {
    $pgAdminPassword = (New-Alnum 24) + "Aa1!"
}

$Template = Join-Path $RepoRoot "infra\main.bicep"
if (-not (Test-Path -LiteralPath $Template)) { throw "Missing $Template" }

$null = az group create --name $ResourceGroup --location $Location 2>$null

$paramFile = Join-Path $env:TEMP ("cc-deploy-params-{0}.json" -f [Guid]::NewGuid().ToString("n"))
$paramBody = @{
    '$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters     = @{
        environmentName                = @{ value = $EnvironmentName }
        backendImageTag                = @{ value = $BackendImageTag }
        frontendImageTag               = @{ value = $FrontendImageTag }
        enableKeyVaultPurgeProtection  = @{ value = $false }
    }
}
$paramBody | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $paramFile -Encoding utf8

function Invoke-Phase([bool] $WithApps) {
    $flag = if ($WithApps) { "true" } else { "false" }
    Write-Host "=== Bicep deploy deployContainerApps=$flag ===" -ForegroundColor Cyan
    az deployment group create `
        --resource-group $ResourceGroup `
        --template-file $Template `
        --name $DeploymentName `
        --parameters "@$paramFile" `
        --parameters "postgresAdminPassword=$pgAdminPassword" `
        --parameters "appSecretKey=$appSecretKey" `
        --parameters "azureClientSecret=$azureClientSecret" `
        --parameters "deployContainerApps=$flag"
    if ($LASTEXITCODE -ne 0) { Remove-Item $paramFile -Force -ErrorAction SilentlyContinue; exit $LASTEXITCODE }
}

Invoke-Phase $false

Write-Host "=== PostgreSQL app user + Key Vault secrets ===" -ForegroundColor Cyan
Write-Host "Ensuring Azure CLI extension 'rdbms-connect' (provides: az postgres flexible-server execute)..." -ForegroundColor DarkGray
az extension add --name rdbms-connect --upgrade --yes
if ($LASTEXITCODE -ne 0) {
    Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
    throw "Failed to install/upgrade extension rdbms-connect. Install manually: az extension add --name rdbms-connect --yes"
}

$outJson = Invoke-AzCliOutput @('deployment', 'group', 'show', '-g', $ResourceGroup, '-n', $DeploymentName, '--query', 'properties.outputs', '-o', 'json')
if ($outJson.ExitCode -ne 0) {
    Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
    throw "Could not read deployment outputs for '$DeploymentName' in '$ResourceGroup': $($outJson.Output)"
}
$out = $outJson.Output | ConvertFrom-Json
$pgServer = $out.postgresServerName.value
$kvName = $out.keyVaultName.value
$pgFqdn = $out.postgresFqdn.value
$adminUser = "consultcortex"

$newAppCreds = $true
$pgAppUser = $null
$pgAppPassword = $null
if (-not $RegeneratePostgresAppUser) {
    $u = Get-KvSecretPlain $kvName 'postgres-app-login' -ErrorOnForbidden
    $pw = Get-KvSecretPlain $kvName 'postgres-app-password' -ErrorOnForbidden
    if (-not [string]::IsNullOrWhiteSpace($u) -and -not [string]::IsNullOrWhiteSpace($pw)) {
        $pgAppUser = $u
        $pgAppPassword = $pw
        $newAppCreds = $false
    }
}
if ($newAppCreds) {
    $pgAppUser = "ccapp_" + (New-Alnum 12)
    $pgAppPassword = New-Alnum 32
}

Set-KvAppConfigurationSecrets -VaultName $kvName -ResourceGroup $ResourceGroup -DeploymentOutputs $out -DotEnv $e -Cors $cors `
    -TenantId $azureTenantId -ClientId $azureClientId -Force:$([bool]$RefreshKeyVaultConfig)

$fwRuleName = 'deploy-from-env-client'
$clientIp = Get-DeployPublicIpv4 $PostgresClientIp
if ($clientIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw "PostgreSQL firewall requires an IPv4 address (got '$clientIp'). Set -PostgresClientIp or CC_DEPLOY_POSTGRES_CLIENT_IP."
}
if ($clientIp -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)') {
    Write-Warning "Client IP $clientIp is a private (RFC1918) address. PostgreSQL must allow a routable client IP for this bootstrap path; if connection fails, set -PostgresClientIp to your real public egress IP."
}
Write-Host "PostgreSQL: temporary firewall rule '$fwRuleName' -> $clientIp (removed after bootstrap succeeds)" -ForegroundColor DarkGray
Set-PostgresDeployFirewallRule $ResourceGroup $pgServer $fwRuleName $clientIp
Start-Sleep -Seconds 5

# Key Vault may list an app user that was never created (failed bootstrap) or whose password drifted.
# Sync server state to KV: ALTER PASSWORD if role exists, else CREATE ROLE.
Write-Host "Ensuring PostgreSQL app role exists and password matches Key Vault..." -ForegroundColor DarkGray
$pwEsc = $pgAppPassword.Replace("'", "''")
$alterSql = "ALTER ROLE ""$pgAppUser"" WITH LOGIN PASSWORD '$pwEsc'"
$ar = Invoke-AzPostgresExecute $pgServer $adminUser $pgAdminPassword 'postgres' $alterSql
if ($ar.ExitCode -eq 0) {
    Write-Host "  app role OK (password synced if role already existed)" -ForegroundColor DarkGray
} else {
    $errBlob = if ([string]::IsNullOrWhiteSpace($ar.Output)) { '' } else { $ar.Output.ToLowerInvariant() }
    if ($errBlob -match 'does not exist|undefined_object|42704') {
        $createSql = "CREATE ROLE ""$pgAppUser"" LOGIN PASSWORD '$pwEsc'"
        $cr = Invoke-AzPostgresExecute $pgServer $adminUser $pgAdminPassword 'postgres' $createSql
        if ($cr.ExitCode -ne 0) {
            Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
            throw "CREATE ROLE failed for '$pgAppUser': $($cr.Output)"
        }
        Write-Host "  created app role '$pgAppUser'" -ForegroundColor DarkGray
    } else {
        Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
        throw "Could not sync app role '$pgAppUser' (check POSTGRES_ADMIN_PASSWORD / firewall / server name). ALTER ROLE output: $($ar.Output)"
    }
}

Write-Host "Ensuring database readygo exists (no-op if already created by Bicep)..." -ForegroundColor DarkGray
$dbCreate = Invoke-AzPostgresExecute $pgServer $adminUser $pgAdminPassword 'postgres' 'CREATE DATABASE readygo'
if ($dbCreate.ExitCode -ne 0) {
    Write-Host "CREATE DATABASE readygo skipped (already exists or non-fatal)." -ForegroundColor DarkGray
    if (-not [string]::IsNullOrWhiteSpace($dbCreate.Output)) { Write-Host $dbCreate.Output -ForegroundColor DarkGray }
}

$grantDb = "GRANT CONNECT ON DATABASE readygo TO ""$pgAppUser"""
$gc = Invoke-AzPostgresExecute $pgServer $adminUser $pgAdminPassword 'postgres' $grantDb
if ($gc.ExitCode -ne 0) {
    Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
    throw "GRANT CONNECT on readygo failed (exit $($gc.ExitCode)): $($gc.Output)"
}

$grants = @(
    "GRANT USAGE ON SCHEMA public TO ""$pgAppUser"""
    "GRANT CREATE ON SCHEMA public TO ""$pgAppUser"""
    "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ""$pgAppUser"""
    "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ""$pgAppUser"""
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ""$pgAppUser"""
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ""$pgAppUser"""
)
foreach ($g in $grants) {
    $gr = Invoke-AzPostgresExecute $pgServer $adminUser $pgAdminPassword 'readygo' $g
    if ($gr.ExitCode -ne 0) {
        Remove-Item $paramFile -Force -ErrorAction SilentlyContinue
        throw "PostgreSQL grant failed (exit $($gr.ExitCode)): $g`n$($gr.Output)"
    }
}

Add-Type -AssemblyName System.Web
$encUser = [System.Web.HttpUtility]::UrlEncode($pgAppUser)
$encPass = [System.Web.HttpUtility]::UrlEncode($pgAppPassword)
$dbUrl = "postgresql+asyncpg://${encUser}:${encPass}@${pgFqdn}:5432/readygo?ssl=require"

$backendDir = Join-Path $RepoRoot "backend"
if (-not $SkipAlembic) {
    Invoke-BackendAlembicUpgrade -DatabaseUrl $dbUrl -BackendDir $backendDir
} else {
    Write-Host "=== Skipping Alembic (-SkipAlembic) ===" -ForegroundColor Yellow
}

Set-KvSecretIfChanged $kvName 'database-url' $dbUrl 'database-url'
Set-KvSecretIfChanged $kvName 'postgres-app-login' $pgAppUser 'postgres-app-login'
Set-KvSecretIfChanged $kvName 'postgres-app-password' $pgAppPassword 'postgres-app-password'
if ($RefreshKvPostgresAdmin) {
    $admR = Invoke-AzCliOutput @('keyvault', 'secret', 'set', '--vault-name', $kvName, '--name', 'postgres-admin-password', '--value', $pgAdminPassword)
    if ($admR.ExitCode -ne 0) { throw "Failed to set postgres-admin-password: $($admR.Output)" }
    Write-Host "  set postgres-admin-password (-RefreshKvPostgresAdmin)" -ForegroundColor DarkGray
} else {
    Set-KvSecretIfChanged $kvName 'postgres-admin-password' $pgAdminPassword 'postgres-admin-password'
}

Write-Host "Key Vault: database-url, postgres-app-login, postgres-app-password, postgres-admin-password (skipped when unchanged)" -ForegroundColor Green

Write-Host "Removing temporary PostgreSQL firewall rule '$fwRuleName'..." -ForegroundColor DarkGray
$fwDel = Remove-PostgresDeployFirewallRule $ResourceGroup $pgServer $fwRuleName
if ($fwDel -ne 0) {
    Write-Host "Warning: could not remove firewall rule '$fwRuleName' (exit $fwDel); delete it in the portal if you no longer need this machine's IP allowed." -ForegroundColor Yellow
}

$acrLogin = $out.acrLoginServer.value
$acrName = Get-AcrNameFromLoginServer $acrLogin
Ensure-AcrImagesForContainerApps -RepoRoot $RepoRoot -AcrName $acrName -BackendTag $BackendImageTag -FrontendTag $FrontendImageTag -SkipAcrImageBuild:$SkipAcrImageBuild

Invoke-Phase $true

Remove-Item $paramFile -Force -ErrorAction SilentlyContinue

Write-Host "`n=== Outputs ===" -ForegroundColor Cyan
az deployment group show -g $ResourceGroup -n $DeploymentName --query properties.outputs -o jsonc

Write-Host "`nIf SECRET_KEY or POSTGRES_ADMIN_PASSWORD were auto-generated, append them to backend/.env." -ForegroundColor Yellow
