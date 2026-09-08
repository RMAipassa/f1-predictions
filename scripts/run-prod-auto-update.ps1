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
} elseif (-not $env:APP_DATA_DIR) {
  $env:APP_DATA_DIR = Join-Path (Get-Location).Path 'data'
}
$logDir = Join-Path $env:APP_DATA_DIR 'logs'
$stdoutLog = Join-Path $logDir 'server-output.log'
$stderrLog = Join-Path $logDir 'server-error.log'
$script:BrowserOpened = $false

function Write-Info($msg) {
  Write-Host "[$(Get-Date -Format HH:mm:ss)] $msg"
}

function Assert-LastCommand($label) {
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

function Ensure-Dependencies {
  Write-Info 'Installing/updating dependencies...'
  npm install
  Assert-LastCommand 'npm install'

  Write-Info 'Rebuilding native deps (better-sqlite3)...'
  npm rebuild better-sqlite3
  Assert-LastCommand 'npm rebuild better-sqlite3'
}

function Build-App {
  Write-Info 'Building (standalone)...'
  npm run build
  Assert-LastCommand 'npm run build'
}

function Start-Server {
  if (-not (Test-Path '.next\standalone\server.js')) {
    throw 'Missing .next\\standalone\\server.js (run build first)'
  }

  Write-Info "Starting server on http://localhost:$Port ..."
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }

  $p = Start-Process -FilePath node -ArgumentList @('.next\standalone\server.js') -WorkingDirectory (Get-Location).Path -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  Start-Sleep -Seconds 2
  $p.Refresh()

  if ($p.HasExited) {
    Write-Info "Server exited immediately with code $($p.ExitCode)."
    Write-Info "Error log: $stderrLog"
    if (Test-Path -LiteralPath $stderrLog) {
      Get-Content -LiteralPath $stderrLog -Tail 40
    }
    throw 'Production server failed to start.'
  }

  if (-not $script:BrowserOpened) {
    Start-Process "http://localhost:$Port/login" | Out-Null
    $script:BrowserOpened = $true
  }

  Write-Info "Server running (pid $($p.Id)). Logs: $logDir"
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

function Stop-StaleServer {
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $pidValue = [int]$listener.OwningProcess
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
    $commandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { '' }

    if ($commandLine -like '*.next\standalone\server.js*') {
      Write-Info "Stopping stale production server on port $Port (pid $pidValue)..."
      Stop-Process -Id $pidValue -Force
      Start-Sleep -Milliseconds 500
      continue
    }

    throw "Port $Port is already used by pid $pidValue. Stop that application or launch with a different -Port."
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
  git fetch
  Assert-LastCommand 'git fetch'
  $local = (git rev-parse HEAD).Trim()
  Assert-LastCommand 'git rev-parse HEAD'
  $remote = (git rev-parse '@{u}').Trim()
  Assert-LastCommand 'git rev-parse upstream'
  return $local -ne $remote
}

function Git-PullFastForward {
  git pull --ff-only
  Assert-LastCommand 'git pull --ff-only'
}

Stop-StaleServer
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
