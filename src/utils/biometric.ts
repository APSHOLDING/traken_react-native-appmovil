import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Acceso rapido con huella / rostro. NO guarda la contrasena: la sesion ya se
 * recuerda con el token cifrado (SecureStore, dura 30 dias); la huella solo
 * "abre el candado" de esa sesion al entrar a la app. Si la persona cierra
 * sesion, la huella se desactiva y hay que volver a escribir la contrasena.
 *
 * expo-local-authentication es nativo: se importa de forma dinamica y todo
 * falla "en silencio" (sin huella) en web, Expo Go viejo o si el modulo no
 * esta en el APK, para no romper nunca el arranque.
 */
const ENABLED_KEY = 'traken_biometric_enabled';
const PROMPTED_KEY = 'traken_biometric_prompted';

async function loadModule() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-local-authentication');
  } catch {
    return null;
  }
}

/** ¿El telefono tiene sensor y al menos una huella/rostro registrado? */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const LA = await loadModule();
    if (!LA) return false;
    const [hasHardware, enrolled] = await Promise.all([LA.hasHardwareAsync(), LA.isEnrolledAsync()]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(ENABLED_KEY, '1');
    else await AsyncStorage.removeItem(ENABLED_KEY);
  } catch {
    // No critico.
  }
}

/** ¿Ya se le pregunto a esta persona si quiere activar la huella? (para no insistir) */
export async function wasBiometricPrompted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPTED_KEY)) === '1';
  } catch {
    return true; // ante la duda, no molestar
  }
}

export async function markBiometricPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    // No critico.
  }
}

/** Olvida tambien que ya se pregunto: tras cerrar sesion se vuelve a ofrecer. */
export async function resetBiometric(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ENABLED_KEY, PROMPTED_KEY]);
  } catch {
    // No critico.
  }
}

/** Pide la huella/rostro. true = la persona se identifico. */
export async function authenticateBiometric(reason = 'Entra a Traken'): Promise<boolean> {
  try {
    const LA = await loadModule();
    if (!LA) return false;
    const res = await LA.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar PIN del teléfono',
    });
    return res.success;
  } catch {
    return false;
  }
}
