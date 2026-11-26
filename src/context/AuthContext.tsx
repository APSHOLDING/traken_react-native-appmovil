import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { deleteToken, getToken, setToken } from '../utils/tokenStorage';
import {
  getApiEnvironment,
  loginRequest,
  logoutRequest,
  meRequest,
  setApiEnvironment,
  setAuthToken,
  setUnauthorizedHandler,
  StationDTO,
  UserDTO,
} from '../api/client';
import { ApiEnvironment, FIXED_ENVIRONMENT, PRODUCTION_UNLOCKED } from '../config/environment';
import { getStoredEnvironment, saveStoredEnvironment } from '../utils/environmentStorage';
import { getLastProfile, saveLastEmail, saveLastProfile } from '../utils/credentials';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import { resetBiometric } from '../utils/biometric';
import { setOutboxUser } from '../utils/outbox';

const TOKEN_KEY = 'traken_token';

type AuthContextValue = {
  token: string | null;
  user: UserDTO | null;
  stations: StationDTO[];
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  environment: ApiEnvironment;
  setEnvironment: (env: ApiEnvironment) => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserDTO | null>(null);
  const [stations, setStations] = useState<StationDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironmentState] = useState<ApiEnvironment>(getApiEnvironment());

  const setEnvironment = async (env: ApiEnvironment) => {
    if (env === environment || FIXED_ENVIRONMENT) return;
    // Un token de sandbox no sirve contra produccion (ni al reves, son 2
    // bases de datos separadas) -- cambiar de ambiente cierra la sesion
    // actual para no quedar en un estado confuso a medias.
    await deleteToken(TOKEN_KEY);
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    setStations([]);
    setApiEnvironment(env);
    setEnvironmentState(env);
    await saveStoredEnvironment(env);
  };

  useEffect(() => {
    (async () => {
      try {
        // El ambiente (sandbox/production) se resuelve ANTES que cualquier
        // llamada al servidor -- de lo contrario el token guardado se
        // intentaria validar contra el ambiente equivocado. La lectura del
        // token guardado no depende del ambiente, asi que se piden ambas
        // cosas al almacenamiento del telefono en paralelo en vez de una
        // tras otra (arranque un poco mas rapido).
        const [savedEnv, savedToken] = await Promise.all([
          getStoredEnvironment(),
          getToken(TOKEN_KEY),
        ]);
        let storedToken = savedToken;
        const storedEnv = FIXED_ENVIRONMENT ?? savedEnv;
        if (storedEnv !== savedEnv) {
          // La sesión guardada es del otro ambiente (APK que antes tenía el
          // switch). Hay que descartarla aquí: contra el servidor equivocado
          // el 401 llega como excepción y se tomaría por "sin señal".
          await deleteToken(TOKEN_KEY);
          await saveStoredEnvironment(storedEnv);
          storedToken = null;
        }
        setApiEnvironment(storedEnv);
        setEnvironmentState(storedEnv);

        if (storedEnv === 'production' && !PRODUCTION_UNLOCKED) {
          await deleteToken(TOKEN_KEY);
          setAuthToken(null);
          return;
        }

        if (!storedToken) return;

        // No basta con confiar en el token guardado: pudo vencer o haber
        // sido revocado (logout desde otro lado). Se valida contra el
        // servidor antes de dar por buena la sesion... PERO solo se cierra
        // sesion cuando el servidor SI contesta y dice que el token ya no
        // sirve. Si no hay señal (la app debe funcionar sin datos), se
        // sigue con el token guardado y el ultimo perfil que se alcanzo a
        // cachear, en vez de mandar a la persona al login sin necesidad.
        setAuthToken(storedToken);
        try {
          const res = await meRequest();
          if (res.ok && res.user) {
            setTokenState(storedToken);
            setUser(res.user);
            setStations(res.stations ?? []);
            await saveLastProfile(res.user, res.stations ?? []);
            registerForPushNotificationsAsync();
          } else {
            await deleteToken(TOKEN_KEY);
            setAuthToken(null);
          }
        } catch (networkError: any) {
          if (networkError?.response?.status === 401) {
            // El servidor SI contesto: la sesion venció o fue revocada.
            await deleteToken(TOKEN_KEY);
            setAuthToken(null);
            setError('Tu sesión venció. Inicia sesión de nuevo.');
            return;
          }
          const cached = await getLastProfile();
          setTokenState(storedToken);
          if (cached) {
            setUser(cached.user);
            setStations(cached.stations);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    if (getApiEnvironment() === 'production' && !PRODUCTION_UNLOCKED) {
      setError('El inicio de sesión en producción está temporalmente deshabilitado.');
      return false;
    }
    setIsAuthenticating(true);
    setError(null);
    try {
      const res = await loginRequest(email, password);
      if (res.ok && res.token && res.user) {
        await setToken(TOKEN_KEY, res.token);
        await saveLastEmail(email);
        await saveLastProfile(res.user, res.stations ?? []);
        setAuthToken(res.token);
        setTokenState(res.token);
        setUser(res.user);
        setStations(res.stations ?? []);
        registerForPushNotificationsAsync();
        return true;
      }
      setError(res.error ?? 'Credenciales inválidas');
      return false;
    } catch (e: any) {
      // El servidor puede responder con un status no-2xx (ej. 401 por
      // credenciales incorrectas) y axios lo lanza como excepcion -- si
      // trae un cuerpo JSON con 'error', es un rechazo real del servidor,
      // no una falla de conexion, asi que se muestra ese mensaje tal cual.
      const serverError = e?.userMessage ?? e?.response?.data?.error;
      setError(serverError ?? 'No se pudo conectar con el servidor de Traken');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    await logoutRequest();
    await resetBiometric();
    await deleteToken(TOKEN_KEY);
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    setStations([]);
  };

  const clearError = () => setError(null);

  // La cola de envio sin conexion pertenece a un usuario: solo se envia con su sesion.
  const outboxUid = user?.id ?? null;
  useEffect(() => {
    setOutboxUser(token && outboxUid !== null ? outboxUid : null);
  }, [token, outboxUid]);

  // Cualquier endpoint que conteste 401 (sesion vencida/revocada) cierra la
  // sesion local y manda al Login con un aviso, en vez de seguir con un token
  // muerto donde todo falla con errores genericos.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      deleteToken(TOKEN_KEY).catch(() => {});
      resetBiometric();
      setAuthToken(null);
      setTokenState(null);
      setUser(null);
      setStations([]);
      setError('Tu sesión venció. Inicia sesión de nuevo.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      stations,
      isLoading,
      isAuthenticating,
      error,
      environment,
      setEnvironment,
      login,
      logout,
      clearError,
    }),
    [token, user, stations, isLoading, isAuthenticating, error, environment]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
