<#
  Makes the demo reachable from anywhere and builds the APK for that address.

    .\scripts\share-demo.ps1                          # ngrok tunnel on a random address (changes every run -> rebuild the APK every run)
    .\scripts\share-demo.ps1 -Domain my-name.ngrok-free.app    # your free ngrok static domain: the APK stays valid across restarts
    .\scripts\share-demo.ps1 -ApiBase https://getyourlawyer-api.onrender.com   # no tunnel (e.g. after deploying to Render); just builds the APK

  What it does: starts the server if it is not running, opens the ngrok tunnel (this makes the server reachable from the internet),
  then builds GetYourLawyer.apk with that address baked in. Keep this PC on and the server + ngrok running while people test.
  Everything is in DEMO mode: OTP 123456, mock DigiLocker, demo payments, lawyers auto-approved. Stop with: .\scripts\stop-demo.ps1
#>
param([string]$Domain = '', [string]$ApiBase = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. server
$listening = Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath node -ArgumentList 'server\server.js' -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep 4
  Write-Host 'Server started on port 8790'
} else { Write-Host 'Server already running on port 8790' }

# 2. tunnel
if (-not $ApiBase) {
  $existing = Get-Process ngrok -ErrorAction SilentlyContinue
  if (-not $existing) {
    $args = @('http', '8790'); if ($Domain) { $args = @('http', '--url=' + $Domain, '8790') }
    Start-Process -FilePath ngrok -ArgumentList $args -WindowStyle Hidden
  }
  $ApiBase = ''
  for ($i = 0; $i -lt 20 -and -not $ApiBase; $i++) {
    Start-Sleep 1
    try { $t = Invoke-RestMethod http://127.0.0.1:4040/api/tunnels; $u = ($t.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1).public_url; if ($u) { $ApiBase = $u } } catch { }
  }
  if (-not $ApiBase) { throw 'ngrok did not report a public address. Run "ngrok http 8790" in a terminal to see why.' }
}
$ApiBase = $ApiBase.TrimEnd('/')
Write-Host "Public address: $ApiBase"

# 3. APK
& "$root\gradlew.bat" assembleDebug "-PapiBase=$ApiBase" --console=plain | Select-Object -Last 3
Copy-Item "$root\app\build\outputs\apk\debug\app-debug.apk" "$root\GetYourLawyer.apk" -Force
Write-Host ''
Write-Host "APK:    $root\GetYourLawyer.apk   (points at $ApiBase)"
Write-Host "Admin:  $ApiBase/admin"
Write-Host 'Testers: install the APK, sign in with any mobile number, OTP 123456.'
