param(
  [int]$Port = 3210,
  [int]$PollSeconds = 30
)

$ErrorActionPreference = 'Stop'

Set-Location (Split-Path $PSScriptRoot -Parent)

$env:PORT = "$Port"
$env:HOSTNAME = '0.0.0.0'
$env:ENABLE_BACKGROUND_JOBS = '1'
if ($env:LOCALAPPDATA) {
  $env:APP_DATA_DIR = Join-Path $env:LOCALAPPDATA 'F1Predictions\data'
}

function Write-Info($msg) {
  Write-Host "[$(Get-Date -Format HH:mm:ss)] $msg"
}

function Ensure-Dependencies {
  if (-not (Test-Path 'node_modules\next\package.json')) {
    Write-Info 'Installing dependencies...'
    npm install
  }
  Write-Info 'Rebuilding native deps (better-sqlite3)...'
  npm rebuild better-sqlite3 | Out-Null
}

function Build-App {
  Write-Info 'Building (standalone)...'
  npm run build
}

function Start-Server {
  if (-not (Test-Path '.next\standalone\server.js')) {
    throw 'Missing .next\\standalone\\server.js (run build first)'
  }

  Write-Info "Starting server on http://localhost:$Port ..."
  Start-Process "http://localhost:$Port/login" | Out-Null
  $p = Start-Process -FilePath node -ArgumentList @('.next\standalone\server.js') -PassThru
  return $p
}

function Stop-Server($proc) {
  if ($null -eq $proc) { return }
  try {
    if (-not $proc.HasExited) {
      Write-Info "Stopping server (pid $($proc.Id))..."
      Stop-Process -Id $proc.Id -Force
    }
  } catch {
    # ignore
  }
}

function Git-HasUpstream {
  try {
    git rev-parse --abbrev-ref '@{u}' 2>$null | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Git-IsClean {
  $s = git status --porcelain
  return [string]::IsNullOrWhiteSpace($s)
}

function Git-NeedsUpdate {
  git fetch | Out-Null
  $local = (git rev-parse HEAD).Trim()
  $remote = (git rev-parse '@{u}').Trim()
  return $local -ne $remote
}

function Git-PullFastForward {
  git pull --ff-only
}

Ensure-Dependencies
Build-App
$server = Start-Server

Write-Info "Auto-update enabled. Polling every $PollSeconds seconds."

while ($true) {
  Start-Sleep -Seconds $PollSeconds

  if ($server.HasExited) {
    Write-Info 'Server exited; rebuilding + restarting...'
    Ensure-Dependencies
    Build-App
    $server = Start-Server
    continue
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { continue }
  if (-not (Git-HasUpstream)) { continue }

  if (-not (Git-IsClean)) {
    Write-Info 'Working tree is dirty; skipping auto-pull.'
    continue
  }

  $needsUpdate = $false
  try {
    $needsUpdate = Git-NeedsUpdate
  } catch {
    continue
  }

  if ($needsUpdate) {
    Write-Info 'Remote update found; pulling + rebuilding...'
    Stop-Server $server
    Git-PullFastForward
    Ensure-Dependencies
    Build-App
    $server = Start-Server
  }
}
