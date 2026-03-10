@echo off
REM ==========================================
REM  检测/下载 Node.js 便携版
REM ==========================================

call "%~dp0env.bat"

REM 检查 Node.js 是否已存在
if exist "%NODE_DIR%\node.exe" (
    echo [Node.js] 已检测到 Node.js 便携版，跳过下载。
    goto :eof
)

echo [Node.js] 未检测到 Node.js，开始下载便携版 v%NODE_VERSION%...
echo [Node.js] 下载地址: %NODE_URL%
echo.

REM 创建临时目录
set "TEMP_ZIP=%PROJECT_ROOT%\node-download.zip"

REM 使用 PowerShell 下载
echo [Node.js] 正在下载，请稍候（约 30MB）...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
    "try { " ^
    "    $ProgressPreference = 'SilentlyContinue'; " ^
    "    Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%TEMP_ZIP%' -UseBasicParsing; " ^
    "    Write-Host '[Node.js] 下载完成。'; " ^
    "} catch { " ^
    "    Write-Host '[Node.js] 错误: 下载失败，请检查网络连接。'; " ^
    "    Write-Host $_.Exception.Message; " ^
    "    exit 1; " ^
    "}"

if %errorlevel% neq 0 (
    echo [Node.js] 下载失败，请检查网络连接后重试。
    if exist "%TEMP_ZIP%" del /f "%TEMP_ZIP%"
    exit /b 1
)

REM 使用 PowerShell 解压
echo [Node.js] 正在解压...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { " ^
    "    Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%PROJECT_ROOT%' -Force; " ^
    "    Write-Host '[Node.js] 解压完成。'; " ^
    "} catch { " ^
    "    Write-Host '[Node.js] 错误: 解压失败。'; " ^
    "    Write-Host $_.Exception.Message; " ^
    "    exit 1; " ^
    "}"

if %errorlevel% neq 0 (
    echo [Node.js] 解压失败。
    if exist "%TEMP_ZIP%" del /f "%TEMP_ZIP%"
    exit /b1
)

REM 重命名解压后的目录为 node/
if exist "%PROJECT_ROOT%\node-v%NODE_VERSION%-win-x64" (
    ren "%PROJECT_ROOT%\node-v%NODE_VERSION%-win-x64" node
)

REM 清理临时文件
if exist "%TEMP_ZIP%" del /f "%TEMP_ZIP%"

REM 验证安装
if exist "%NODE_DIR%\node.exe" (
    echo [Node.js] 安装成功！
    "%NODE_DIR%\node.exe" --version
) else (
    echo [Node.js] 错误: 安装验证失败，node.exe 未找到。
    echo [Node.js] 请手动下载 Node.js v%NODE_VERSION% 并解压到 node/ 目录。
    exit /b 1
)
