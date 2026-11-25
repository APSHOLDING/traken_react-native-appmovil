import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Ambiente de datos de la app: "sandbox" (datos de prueba, clon separado de
 * la base de datos real) o "production" (datos reales de Traken).
 *
 * Por defecto SIEMPRE arranca en sandbox, y el switch de Producción se ve
 * en el Login pero queda BLOQUEADO (deshabilitado, con candado) hasta que
 * se libere aqui mismo cambiando PRODUCTION_UNLOCKED a `true` -- asi nadie
 * puede terminar probando la app contra datos reales por accidente
 * mientras se sigue probando.
 */
export type ApiEnvironment = 'sandbox' | 'production';

export const DEFAULT_ENVIRONMENT: ApiEnvironment = 'sandbox';

// Cambiar a `true` cuando ya se probo suficiente en sandbox y se decide
// permitir el cambio a datos reales desde la app.
export const PRODUCTION_UNLOCKED = false;

export const SITE_BASE_URLS: Record<ApiEnvironment, string> = {
  sandbox: 'https://traken.mx/sandbox',
  production: 'https://traken.mx',
};

export const ENVIRONMENT_LABELS: Record<ApiEnvironment, string> = {
  sandbox: 'Sandbox (pruebas)',
  production: 'Producción (datos reales)',
};

/** La variante se resuelve en app.config.js también al publicar una OTA;
 * __DEV__ no sirve para distinguir los APK de preview y producción. */
export function esEntornoPruebas(config = Constants.expoConfig): boolean {
  const id = 'mx.apsholding.traken.pruebas';
  return config?.android?.package === id || config?.ios?.bundleIdentifier === id;
}

/** En un build (EAS) el servidor lo decide el APK: «Traken Pruebas» habla con
 * el sandbox y «Traken» con producción, sin switch en el login. En desarrollo
 * y en la web queda null y se elige con el switch. */
export const FIXED_ENVIRONMENT: ApiEnvironment | null =
  __DEV__ || Platform.OS === 'web' ? null : esEntornoPruebas() ? 'sandbox' : 'production';
