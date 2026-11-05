# Stops the demo server and the ngrok tunnel.
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\\server.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'Stopped.'
