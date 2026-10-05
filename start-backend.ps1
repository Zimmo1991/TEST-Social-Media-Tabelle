$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledPhp = Join-Path (Join-Path ([IO.Path]::GetTempPath()) 'socialflow-php-8.4.25') 'php.exe'
$systemPhp = Get-Command php.exe -ErrorAction SilentlyContinue
$php = if (Test-Path -LiteralPath $bundledPhp) { $bundledPhp } elseif ($systemPhp) { $systemPhp.Source } else { throw 'PHP wurde nicht gefunden. Bitte installiere PHP 8.1 oder neuer.' }
$extensions = Join-Path (Split-Path -Parent $php) 'ext'

Set-Location -LiteralPath $projectRoot
& $php -d "extension_dir=$extensions" -d extension=pdo_sqlite -d extension=sqlite3 -d extension=curl -d extension=openssl -d extension=sodium -d extension=mbstring -d extension=fileinfo -d upload_max_filesize=250M -d post_max_size=260M -d max_execution_time=120 -d memory_limit=512M -S 127.0.0.1:8765 -t allinkl/public allinkl/public/index.php
