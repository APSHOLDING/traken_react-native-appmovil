# Sube lo que esta en develop a master (produccion) de forma segura.
# Uso, desde la carpeta del proyecto:   .\subir-a-produccion.ps1
# Si algo no esta bien, se detiene ANTES de subir y te dice que hacer.
Set-Location $PSScriptRoot

function Fallo($mensaje) {
    Write-Host ""
    Write-Host "NO SE SUBIO NADA: $mensaje" -ForegroundColor Red
    exit 1
}

git fetch origin 2>&1 | Out-Null

$rama = (git branch --show-current).Trim()
if ($rama -ne 'develop') { Fallo "Estas en la rama '$rama'. Cambia a develop con:  git checkout develop" }

if (git status --porcelain) { Fallo "Tienes cambios sin guardar. Guardalos primero (commit) y vuelve a correr esto." }

$sinSubir = [int](git rev-list --count origin/develop..HEAD)
if ($sinSubir -gt 0) { Fallo "Hay $sinSubir cambio(s) tuyos que aun no estan en GitHub. Corre:  git push   y vuelve a intentar." }

$sinBajar = [int](git rev-list --count HEAD..origin/develop)
if ($sinBajar -gt 0) { Fallo "GitHub tiene $sinBajar cambio(s) que tu no tienes. Corre:  git pull   y vuelve a intentar." }

$nuevos = [int](git rev-list --count origin/master..origin/develop)
if ($nuevos -eq 0) { Fallo "No hay nada nuevo: master ya tiene todo lo de develop." }

Write-Host ""
Write-Host "Se van a subir $nuevos cambio(s) a PRODUCCION (master):" -ForegroundColor Cyan
git --no-pager log origin/master..origin/develop --oneline
Write-Host ""
Write-Host "Recuerda antes de seguir:" -ForegroundColor Yellow
Write-Host "  1) La WEB ya debe estar subida (cd C:\laragon\www\traken ; git push origin main)."
Write-Host "  2) Ya probaste con la app 'Traken Pruebas'."
Write-Host "  3) Si cambio algo nativo, EAS compilara un APK nuevo que hay que instalar a mano."
Write-Host ""
$resp = Read-Host "Escribe SI (en mayusculas) para subir a produccion"
if ($resp -cne 'SI') { Fallo "Cancelado. No se toco nada." }

git checkout master
if ($LASTEXITCODE -ne 0) { git checkout develop; Fallo "No pude cambiar a master." }

git pull --ff-only origin master
if ($LASTEXITCODE -ne 0) { git checkout develop; Fallo "master no se pudo actualizar." }

git merge --no-ff develop -m "Release a produccion: merge de develop"
if ($LASTEXITCODE -ne 0) {
    git merge --abort 2>&1 | Out-Null
    git checkout develop
    Fallo "Hubo conflicto al unir develop con master. No se cambio nada."
}

git push origin master
if ($LASTEXITCODE -ne 0) {
    git checkout develop
    Fallo "No se pudo subir a GitHub (revisa tu internet o permisos). master quedo solo en tu PC."
}

git checkout develop | Out-Null
Write-Host ""
Write-Host "LISTO. master ya esta en GitHub y EAS publica la app de produccion solo." -ForegroundColor Green
Write-Host "Sigue el avance en https://expo.dev (proyecto traken-mobile)."
Write-Host "Si cambio lo nativo, instala el APK nuevo con el link o QR que te da EAS."
