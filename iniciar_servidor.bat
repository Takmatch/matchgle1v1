@echo off
title TalkMatch 1a1 - Servidor de Videochat
cd /d "%~dp0"

echo =======================================================
echo          TALKMATCH 1a1 - SERVIDOR ACTIVO
echo =======================================================
echo.
echo Iniciando servidor en http://localhost:3000
echo No cierres esta ventana mientras uses la aplicacion.
echo.

start http://localhost:3000

node server.js

echo.
echo El servidor se ha detenido.
pause
