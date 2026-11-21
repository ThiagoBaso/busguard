$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $projectRoot 'mobile\busguard'
$adbPort = 5039
$hadErrors = $false

function Test-HttpEndpoint([string]$Url, [string]$ExpectedText = '') {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        if ($response.StatusCode -ne 200) { return $false }
        if (!$ExpectedText) { return $true }
        $content = $response.Content
        if ($content -is [byte[]]) { $content = [System.Text.Encoding]::UTF8.GetString($content) }
        return ([string]$content).Trim() -eq $ExpectedText
    } catch {
        return $false
    }
}

function Test-LocalPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (!$connection.AsyncWaitHandle.WaitOne(1000)) { return $false }
        $client.EndConnect($connection)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

Write-Host 'BusGuard - reconectar Android' -ForegroundColor Cyan
Write-Host ''

$adbCandidates = @()
if ($env:ANDROID_HOME) { $adbCandidates += (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') }
if ($env:ANDROID_SDK_ROOT) { $adbCandidates += (Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe') }
if ($env:LOCALAPPDATA) { $adbCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe') }
if ($env:TEMP) {
    $adbCandidates += (Join-Path $env:TEMP 'busguard-adb-20261114\adb.exe')
    $adbCandidates += (Join-Path $env:TEMP 'busguard-android-sdk\platform-tools\adb.exe')
}
$adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
if ($adbCommand) { $adbCandidates += $adbCommand.Source }
$adb = $adbCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$adb) {
    Write-Host 'ADB nao encontrado. Instale as Android SDK Platform Tools e adicione-as ao PATH.' -ForegroundColor Red
    Write-Host 'Download oficial: https://developer.android.com/tools/releases/platform-tools'
    exit 1
}

Write-Host 'Procurando celular conectado...'
$deviceOutput = @(& $adb -P $adbPort devices)
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Nao foi possivel iniciar ou consultar o ADB.' -ForegroundColor Red
    exit 1
}
$devices = @($deviceOutput | Where-Object { $_ -match '^\S+\s+device\s*$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($devices.Count -eq 0) {
    Write-Host 'Nenhum celular autorizado foi encontrado.' -ForegroundColor Red
    Write-Host 'Desbloqueie o celular, confira o cabo e a depuracao USB e aceite a autorizacao na tela.'
    Write-Host 'Execute este atalho novamente depois de autorizar.'
    $deviceOutput | Where-Object { $_ -match '^\S+\s+(offline|unauthorized)\s*$' } | ForEach-Object { Write-Host $_ }
    exit 1
}
if ($devices.Count -gt 1) {
    Write-Host 'Mais de um celular autorizado foi encontrado:'
    for ($i = 0; $i -lt $devices.Count; $i++) { Write-Host "  $($i + 1). $($devices[$i])" }
    $selection = 0
    $answer = Read-Host 'Digite o numero do celular'
    if (![int]::TryParse($answer, [ref]$selection) -or $selection -lt 1 -or $selection -gt $devices.Count) {
        Write-Host 'Selecao invalida. Execute o atalho novamente.' -ForegroundColor Red
        exit 1
    }
    $serial = $devices[$selection - 1]
} else {
    $serial = $devices[0]
}
Write-Host "Celular: $serial" -ForegroundColor Green

foreach ($port in @(5173, 8000, 8082)) {
    & $adb -P $adbPort -s $serial reverse "tcp:$port" "tcp:$port"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Falha ao encaminhar a porta $port. Verifique o cabo e tente novamente." -ForegroundColor Red
        $hadErrors = $true
    } else {
        Write-Host "Porta $port conectada." -ForegroundColor Green
    }
}

if (Test-HttpEndpoint 'http://127.0.0.1:8000/ready') {
    Write-Host 'API: disponivel.' -ForegroundColor Green
} else {
    Write-Host 'API: indisponivel no computador. Verifique o Docker e os servicos existentes.' -ForegroundColor Yellow
    $hadErrors = $true
}
if (Test-HttpEndpoint 'http://127.0.0.1:5173/') {
    Write-Host 'Painel: disponivel.' -ForegroundColor Green
} else {
    Write-Host 'Painel: indisponivel no computador. Verifique o Docker e os servicos existentes.' -ForegroundColor Yellow
    $hadErrors = $true
}

if (Test-HttpEndpoint 'http://127.0.0.1:8082/status' 'packager-status:running') {
    Write-Host 'Servidor do aplicativo: ativo na porta 8082.' -ForegroundColor Green
} elseif (Test-LocalPort 8082) {
    Write-Host 'A porta 8082 esta ocupada por outro servico. Libere a porta e tente novamente.' -ForegroundColor Red
    $hadErrors = $true
} else {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $expoCli = Join-Path $mobileDir 'node_modules\expo\bin\cli'
    if (!$node -or !(Test-Path -LiteralPath $expoCli -PathType Leaf)) {
        Write-Host 'Node.js ou dependencias do app nao encontrados. Instale-os antes de continuar.' -ForegroundColor Red
        $hadErrors = $true
    } else {
        Write-Host 'Iniciando servidor do aplicativo...'
        $logId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdoutLog = Join-Path $env:TEMP "busguard-metro-$logId.log"
        $stderrLog = Join-Path $env:TEMP "busguard-metro-$logId-error.log"
        $env:EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8000'
        $env:EXPO_PUBLIC_DISABLE_NATIVE_MAP = '1'
        try {
            $metro = Start-Process -FilePath $node.Source -ArgumentList @('node_modules/expo/bin/cli', 'start', '--dev-client', '--localhost', '--port', '8082') -WorkingDirectory $mobileDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
            $ready = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Seconds 1
                if (Test-HttpEndpoint 'http://127.0.0.1:8082/status' 'packager-status:running') { $ready = $true; break }
                if ($metro.HasExited) { break }
            }
            if ($ready) {
                Write-Host 'Servidor do aplicativo: iniciado.' -ForegroundColor Green
                Write-Host 'Nesta versao de teste, o mapa nativo fica desativado.' -ForegroundColor Yellow
            } else {
                Write-Host "Servidor do aplicativo nao iniciou. Confira os arquivos: $stdoutLog e $stderrLog" -ForegroundColor Red
                $hadErrors = $true
            }
        } catch {
            Write-Host "Falha ao iniciar o servidor do aplicativo: $($_.Exception.Message)" -ForegroundColor Red
            $hadErrors = $true
        }
    }
}

Write-Host ''
if ($hadErrors) {
    Write-Host 'Algumas etapas falharam. Confira as mensagens acima e execute novamente.' -ForegroundColor Yellow
    exit 1
}
Write-Host 'Abrindo o aplicativo no servidor de desenvolvimento...'
& $adb -P $adbPort -s $serial shell am start -a android.intent.action.VIEW -d 'exp+busguard://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082' com.busguard.dev
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Nao foi possivel abrir o app. Confira se a versao de desenvolvimento esta instalada.' -ForegroundColor Red
    exit 1
}
Write-Host 'Conexao pronta. O BusGuard foi aberto no celular.' -ForegroundColor Green
Write-Host 'Para o painel no celular, abra http://localhost:5173 no Chrome.'
