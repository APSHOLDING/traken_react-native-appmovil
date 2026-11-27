import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StationDTO, UserDTO } from '../api/client';
import { deleteToken, getToken, setToken } from './tokenStorage';

// El ultimo correo usado se guarda aparte del token de sesion (que SI se
// borra al cerrar sesion): asi la proxima vez que se abra la app, el campo
// de usuario ya viene lleno aunque hayas cerrado sesion antes. La
// contrasena NUNCA se guarda aqui -- eso lo maneja el propio telefono
// (Llavero/Autofill) via los props textContentType/autoComplete del login.
const LAST_EMAIL_KEY = 'traken_last_email';

export async function saveLastEmail(email: string) {
  try {
    await AsyncStorage.setItem(LAST_EMAIL_KEY, email);
  } catch (e) {
    // No es critico: en el peor caso no se precarga la proxima vez.
  }
}

export async function getLastEmail(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LAST_EMAIL_KEY)) ?? '';
  } catch (e) {
    return '';
  }
}

// Ultimo perfil (nombre, puesto, estaciones) que SI respondio el servidor.
// Sirve para que, si abres la app sin señal, veas tu info de la ultima vez
// en vez de que la app te mande al login solo porque no pudo confirmar el
// token en ese momento (ver AuthContext: solo se cierra sesion si el
// servidor CONTESTA que el token ya no sirve, nunca por falta de conexion).
const LAST_PROFILE_KEY = 'traken_last_profile';

type CachedProfile = { user: UserDTO; stations: StationDTO[] };

export async function saveLastProfile(user: UserDTO, stations: StationDTO[]) {
  try {
    await AsyncStorage.setItem(LAST_PROFILE_KEY, JSON.stringify({ user, stations }));
  } catch (e) {
    // No es critico.
  }
}

export async function getLastProfile(): Promise<CachedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CachedProfile) : null;
  } catch (e) {
    return null;
  }
}

// "Recordar mi contraseña en este telefono" (opcional, lo elige la persona): se guarda en el almacen CIFRADO del
// telefono (el mismo que protege el token de sesion: Keystore en Android, Llavero en iOS), nunca en texto plano ni en el
// servidor. Al volver a la pantalla de entrada se usa con la huella (o se precarga si el telefono no tiene huella).
const REMEMBER_KEY = 'traken_saved_login';

export type SavedLogin = { email: string; password: string };

export async function saveRememberedLogin(email: string, password: string) {
  try {
    await setToken(REMEMBER_KEY, JSON.stringify({ email, password }));
  } catch (e) {
    // No es critico: en el peor caso se vuelve a escribir.
  }
}

export async function getRememberedLogin(): Promise<SavedLogin | null> {
  try {
    const raw = await getToken(REMEMBER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.email === 'string' && typeof v.password === 'string' ? (v as SavedLogin) : null;
  } catch (e) {
    return null;
  }
}

export async function clearRememberedLogin() {
  try {
    await deleteToken(REMEMBER_KEY);
  } catch (e) {
    // No es critico.
  }
}
