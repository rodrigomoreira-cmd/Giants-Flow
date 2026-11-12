Set-Location -Path "C:\Users\rodrigo.moreira_grup\Desktop\sistema-eventos"
$logFile = Join-Path "C:\Users\rodrigo.moreira_grup\Desktop\sistema-eventos" "backups\scheduled_backup.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "=== [$timestamp] Iniciando backup agendado ==="
npm run backup >> $logFile 2>&1