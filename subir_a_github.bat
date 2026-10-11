@echo off
title Subir a GitHub - matchgle1v1
color 0b

echo ===================================================================
echo       SUBIDA AUTOMATICA A GITHUB: Takmatch/matchgle1v1
echo ===================================================================
echo.

cd /d "%~dp0"

echo [1/3] Asegurando repositorio remoto correcto...
git remote set-url origin https://github.com/Takmatch/matchgle1v1.git
git remote -v

echo.
echo [2/3] Preparando y confirmando todos los archivos...
git add .
git commit -m "Actualizacion completa lista para despliegue" >nul 2>&1

echo.
echo [3/3] Enviando archivos a https://github.com/Takmatch/matchgle1v1...
echo.
echo Si se abre una ventana en tu navegador, haz clic en "Sign in with your browser" o "Authorize".
echo.

git push -u origin main --force

echo.
if %errorlevel% equ 0 (
    color 0a
    echo ===================================================================
    echo    GENIAL: CODIGO SUBIDO CON EXITO A Takmatch/matchgle1v1
    echo ===================================================================
    echo.
    echo Tu repositorio esta 100%% actualizado en GitHub.
) else (
    color 0e
    echo.
    echo ===================================================================
    echo  Si da error, revisa si iniciaste sesion en GitHub o autoriza en el navegador.
    echo ===================================================================
)

echo.
pause
