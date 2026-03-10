@echo off
REM ==========================================
REM  配置文件初始化（Web GUI 默认配置）
REM ==========================================

call "%~dp0env.bat"

REM 切换到项目根目录
pushd "%PROJECT_ROOT%"

REM 检查 config.yaml 是否已存在
if exist "config.yaml" (
    echo [配置] 已检测到 config.yaml，跳过配置初始化。
    popd
    goto :eof
)

REM 检查模板文件是否存在
if not exist "config.example.yaml" (
    echo [配置] 错误: 未找到 config.example.yaml 模板文件。
    popd
    exit /b 1
)

echo [配置] 首次运行，正在生成默认配置文件...

REM 复制模板并修改为 Web GUI 默认配置
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$content = Get-Content 'config.example.yaml' -Raw -Encoding UTF8; " ^
    "$content = $content -replace 'type: console', 'type: web'; " ^
    "$content = $content -replace 'host: 127.0.0.1', 'host: 0.0.0.0'; " ^
    "$utf8NoBom = New-Object System.Text.UTF8Encoding $false; " ^
    "[System.IO.File]::WriteAllText('config.yaml', $content, $utf8NoBom);"

if %errorlevel% neq 0 (
    echo [配置] 错误: 配置文件生成失败。
    popd
    exit /b 1
)

echo [配置] 已生成 config.yaml（默认使用 Web GUI 平台）。
echo.
echo ============================================
echo   请编辑 config.yaml 填写你的 API Key！
echo   文件位置: %PROJECT_ROOT%\config.yaml
echo ============================================
echo.
pause
popd
