<#
.SYNOPSIS
  Wrapper: deploys via deploy-from-env.ps1 (reads backend/.env).

  Prefer: .\infra\deploy-from-env.ps1 -ResourceGroup rg-consultcortex-staging -EnvironmentName staging
#>
[CmdletBinding()]
param(
    [string] $ResourceGroup = "rg-consultcortex-staging",
    [string] $EnvironmentName = "staging",
    [string] $Location = "eastus2"
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& (Join-Path $here "deploy-from-env.ps1") -ResourceGroup $ResourceGroup -EnvironmentName $EnvironmentName -Location $Location
