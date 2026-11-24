# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ramas y despliegue (EAS)

Se trabaja en `develop`; `master` es producción y solo recibe el Merge del PR «Release a producción».

| Rama | Publica | Cómo |
|---|---|---|
| `develop` | app de pruebas (perfil/canal `preview`) | sola, con cada push (`.eas/workflows/publicar-pruebas.yml`) |
| `master` | app de producción (perfil/canal `production`) | sola, al hacer Merge del PR «Release a producción» (`.eas/workflows/publicar-produccion.yml`) |

- Cada push a `develop` abre o actualiza un solo PR `develop → master` con los commits y si el cambio parece nativo (`.github/workflows/release-pr.yml`). Hacer Merge con **Create a merge commit**.
- Tras el Merge, `develop` se sincroniza sola con `master` (`.github/workflows/sync-develop.yml`); si hay conflicto lo comenta en el PR.
- `runtimeVersion` usa `fingerprint`: si la huella nativa ya tiene APK, se publica por OTA; si cambió (paquete nativo, permisos, `app.json`), EAS compila un APK nuevo que hay que instalar a mano (link/QR de EAS).
- Las dos apps conviven en el teléfono: `preview` se instala como «Traken Pruebas» (`mx.apsholding.traken.pruebas`, por `TRAKEN_VARIANTE=pruebas` en el entorno `preview` de EAS; ver `app.config.js`), con franja «PRUEBAS» y contra `traken.mx/sandbox`; `production` es «Traken Mobile» (`mx.apsholding.traken`) contra `traken.mx`. En un build el servidor lo fija el APK (`FIXED_ENVIRONMENT` en `src/config/environment.ts`); el switch Sandbox/Producción del login solo aparece en desarrollo y en la web.
