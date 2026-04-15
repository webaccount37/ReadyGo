<#
.SYNOPSIS
  Creates an Azure Storage account + expense-receipts container and merges settings into backend/.env.

.DESCRIPTION
  Requires Azure CLI (az). Run `az login` first, or ensure backend/.env has AZURE_TENANT_ID, AZURE_CLIENT_ID,
  and AZURE_CLIENT_SECRET so this script can use `az login --service-principal` (the app needs permission
  to create storage in the target subscription, e.g. Contributor on the resource group).

.PARAMETER ResourceGroupName
  Resource group for the storage account (created if missing).

.PARAMETER Location
  Azure region (default eastus2).

.PARAMETER EnvFile
  Path to backend .env to update (default: repo/backend/.env).
#>
[CmdletBinding()]
param(
    [string] $ResourceGroupName = "readygo-dev-rg",
    [string] $Location = "eastus2",
    [string] $EnvFile = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $EnvFile) {
    $EnvFile = Join-Path $RepoRoot "backend\.env"
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Error "Env file not found: $EnvFile"
    exit 1
}
$EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

function Get-AzPath {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} "Microsoft SDKs\Azure\CLI2\wbin\az.cmd"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft SDKs\Azure\CLI2\wbin\az.cmd")
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    return "az"
}

$script:AzExe = Get-AzPath
function Invoke-AzCli {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]] $CliArgs)
    & $script:AzExe @CliArgs
    if ($LASTEXITCODE -ne 0) {
        $safe = $CliArgs | ForEach-Object {
            if ($_ -match '^-p=') { '-p=***' } else { $_ }
        }
        throw "az failed: $($safe -join ' ')"
    }
}

function Import-DotEnv([string] $path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    Get-Content -LiteralPath $path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $i = $line.IndexOf("=")
        if ($i -lt 1) { return }
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim()
        if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
        $map[$k] = $v
    }
    return $map
}

function Merge-EnvStorageKeys([string] $path, [hashtable] $storageVars) {
    $lines = @()
    if (Test-Path $path) { $lines = @(Get-Content -LiteralPath $path) }
    $keysToReplace = @("AZURE_STORAGE_ACCOUNT_NAME", "AZURE_STORAGE_ACCOUNT_KEY", "AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER")
    $filtered = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        $trim = $line.Trim()
        $skip = $false
        foreach ($k in $keysToReplace) {
            if ($trim -match "^\s*${k}\s*=") { $skip = $true; break }
        }
        if (-not $skip) { $filtered.Add($line) | Out-Null }
    }
    $block = @(
        "",
        "# Azure Blob Storage (expense receipts) - added by scripts/azure/provision-expense-blob-storage.ps1",
        "AZURE_STORAGE_ACCOUNT_NAME=$($storageVars['AZURE_STORAGE_ACCOUNT_NAME'])",
        "AZURE_STORAGE_ACCOUNT_KEY=$($storageVars['AZURE_STORAGE_ACCOUNT_KEY'])",
        "AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER=$($storageVars['AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER'])"
    )
    ($filtered + $block) -join "`n" | Set-Content -LiteralPath $path -Encoding utf8 -NoNewline:$false
}

# --- Azure login ---
$loggedIn = $false
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
& $script:AzExe account show 1>$null 2>$null
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -eq 0) { $loggedIn = $true }

if (-not $loggedIn) {
    $envMap = Import-DotEnv $EnvFile
    $tid = $envMap["AZURE_TENANT_ID"]
    $cid = $envMap["AZURE_CLIENT_ID"]
    $csec = $envMap["AZURE_CLIENT_SECRET"]
    if ($tid -and $cid -and $csec) {
        Write-Host "Using service principal from $EnvFile for az login..."
        # Use -p=<secret> so values starting with '-' are not parsed as flags
        try {
            Invoke-AzCli login --service-principal -u $cid "-p=$csec" --tenant $tid | Out-Null
            $loggedIn = $true
        } catch {
            Write-Host $_
            Write-Host ""
            Write-Host "Your Entra app may have no Azure RBAC on any subscription."
            Write-Host "Fix: run 'az login' with a user that can create storage, then re-run this script;"
            Write-Host "   or in Azure Portal assign the app (Client ID $cid) a role such as Contributor on a subscription or resource group."
            exit 1
        }
    }
}

if (-not $loggedIn) {
    Write-Error "Not logged in to Azure. Run 'az login' or set AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET in $EnvFile"
    exit 1
}

$ErrorActionPreference = "SilentlyContinue"
$subs = & $script:AzExe account list --query "[].id" -o tsv 2>$null
$ErrorActionPreference = "Stop"
if (-not $subs) {
    Write-Error "Azure CLI has no accessible subscription. Run 'az login' with a directory user, or grant this identity access to a subscription."
    exit 1
}

# --- Resource group ---
$rgExists = & $script:AzExe group exists --name $ResourceGroupName
if ($rgExists -ne "true") {
    Invoke-AzCli group create --name $ResourceGroupName --location $Location | Out-Null
}

# --- Globally unique storage account name (lowercase alphanumeric only, 3-24 chars) ---
$rand = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$storageName = ("readygo" + $rand).ToLowerInvariant()
if ($storageName.Length -gt 24) { $storageName = $storageName.Substring(0, 24) }

Write-Host "Creating storage account $storageName in $ResourceGroupName ($Location)..."
Invoke-AzCli storage account create `
    --name $storageName `
    --resource-group $ResourceGroupName `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2 `
    --min-tls-version TLS1_2 `
    --allow-blob-public-access false | Out-Null

$keysJson = Invoke-AzCli storage account keys list --resource-group $ResourceGroupName --account-name $storageName
$keys = $keysJson | ConvertFrom-Json
$key1 = $keys[0].value

$container = "expense-receipts"
Write-Host "Creating container $container..."
Invoke-AzCli storage container create --name $container --account-name $storageName --account-key $key1 | Out-Null

$merge = @{
    AZURE_STORAGE_ACCOUNT_NAME = $storageName
    AZURE_STORAGE_ACCOUNT_KEY  = $key1
    AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER = $container
}
Merge-EnvStorageKeys $EnvFile $merge

Write-Host "Updated $EnvFile"
Write-Host "Storage account: $storageName"
Write-Host "Container: $container"
Write-Host "Restart the backend container (or process) to pick up new environment variables."
