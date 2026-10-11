@echo off
title Subir Matchgle a GitHub y Render
color 0b

echo ===================================================================
echo          SUBIDA AUTOMATICA A GITHUB - MATCHGLE 1v1
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1/3] Preparando los ultimos cambios y configuracion de Render...
git add .
git commit -m "Preparado para despliegue en Render" >nul 2>&1

echo.
echo [2/3] Verificando repositorio remoto...
git remote -v

echo.
echo [3/3] Enviando codigo a GitHub...
echo.
echo Si se abre una ventana en tu navegador, haz clic en "Sign in with your browser" o "Authorize".
echo.

git push -u origin main

echo.
if %errorlevel% equ 0 (
    color 0a
    echo ===================================================================
    echo       TODO SUBIDO CORRECTAMENTE A GITHUB CON EXITO
    echo ===================================================================
    echo.
    echo Ahora solo ve a Render.com y dale a 'New Web Service' -> Conectar tu repo.
) else (
    color 0e
    echo.
    echo ===================================================================
    echo  AVISO: Si dio error de 'Repository not found', asegurate de:
    echo  1. Haber creado el repositorio en https://github.com/new
    echo  2. Que el nombre de usuario de tu GitHub coincida con el enlace.
    echo ===================================================================
)

echo.
pause
