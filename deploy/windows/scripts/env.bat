@echo off
REM ==========================================
REM  公共环境变量
REM ==========================================

set "NODE_VERSION=22.16.0"

REM 项目根目录（deploy/windows/scripts/ 的上三级）
set "PROJECT_ROOT=%~dp0..\..\.."

REM Node.js 便携版存放路径
set "NODE_DIR=%PROJECT_ROOT%\node"

REM Node.js 下载地址
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"

REM 将 Node.js 便携版加入 PATH（优先于系统安装的 Node）
set "PATH=%NODE_DIR%;%PATH%"
