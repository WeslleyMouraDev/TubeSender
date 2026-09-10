@echo off
chcp 65001 >nul
title TubeSender - Inicializador Local

echo ========================================================
echo                 T U B E S E N D E R
echo     Agendador Inteligente de Videos para YouTube
echo ========================================================
echo.

cd /d "%~dp0"

:: Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    echo Por favor, instale o Node.js v20+ em https://nodejs.org/
    pause
    exit /b 1
)

:: Verificar pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] pnpm nao encontrado globalmente. Instalando via corepack/npm...
    call npm install -g pnpm
)

:: Verificar se .env existe
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Criando arquivo .env a partir de .env.example...
        copy .env.example .env >nul
    )
)

:: Verificar node_modules
if not exist "node_modules" (
    echo [1/3] Instalando dependencias do projeto com pnpm...
    call pnpm install
) else (
    echo [1/3] Dependencias verificadas.
)

:: Aplicar migrations do banco de dados SQLite
echo [2/3] Verificando e atualizando banco de dados local...
call pnpm db:migrate >nul 2>nul

echo [3/3] Iniciando servidores (API na porta 3333 e Web na porta 5173)...
echo.
echo ========================================================
echo   Aplicacao rodando!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3333/api/health
echo ========================================================
echo.
echo Pressione CTRL+C nesta janela para encerrar os servicos.
echo.

:: Abrir navegador apos 3 segundos em segundo plano
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:5173'"

:: Iniciar ambiente dev (API + Frontend)
call pnpm dev
