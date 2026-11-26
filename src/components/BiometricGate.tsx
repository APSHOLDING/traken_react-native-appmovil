import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import {
  authenticateBiometric,
  isBiometricAvailable,
  isBiometricEnabled,
  markBiometricPrompted,
  setBiometricEnabled,
  wasBiometricPrompted,
} from '../utils/biometric';

/** Si la app estuvo en segundo plano mas de esto, se vuelve a pedir la huella. */
const RELOCK_AFTER_MS = 60_000;

type Phase = 'checking' | 'locked' | 'open';

/**
 * Candado de huella/rostro sobre la sesion guardada.
 *  - Sin sesion (login) o sin huella activada: no hace nada.
 *  - Con sesion y huella activada: al abrir la app (o volver tras 1 min en
 *    segundo plano) pide la huella antes de mostrar nada.
 *  - Tras un inicio de sesion con contrasena, ofrece activar la huella una vez.
 */
export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const { token, isLoading, logout } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [failed, setFailed] = useState(false);
  const decidedForToken = useRef<string | null | undefined>(undefined);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setFailed(false);
    const ok = await authenticateBiometric('Entra a Traken');
    prompting.current = false;
    if (ok) setPhase('open');
    else setFailed(true);
  }, []);

  // Decide el estado inicial cuando ya se sabe si hay sesion guardada.
  useEffect(() => {
    if (isLoading) return;
    if (decidedForToken.current !== undefined) return; // solo al arrancar la app
    decidedForToken.current = token;
    (async () => {
      if (!token) {
        setPhase('open');
        return;
      }
      const enabled = await isBiometricEnabled();
      if (enabled && (await isBiometricAvailable())) {
        setPhase('locked');
        unlock();
      } else {
        setPhase('open');
      }
    })();
  }, [isLoading, token, unlock]);

  // Sesion nueva (acaba de escribir su contrasena): se abre y se ofrece la huella.
  useEffect(() => {
    if (isLoading || !token || decidedForToken.current === undefined) return;
    if (decidedForToken.current === token) return; // la sesion que ya estaba al abrir
    decidedForToken.current = token;
    setPhase('open');
    (async () => {
      if ((await wasBiometricPrompted()) || !(await isBiometricAvailable())) return;
      await markBiometricPrompted();
      Alert.alert(
        'Acceso rápido',
        '¿Quieres entrar a Traken con tu huella o rostro la próxima vez, sin escribir tu contraseña?',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Activar',
            onPress: async () => {
              if (await authenticateBiometric('Confirma para activar el acceso rápido')) {
                await setBiometricEnabled(true);
              }
            },
          },
        ]
      );
    })();
  }, [isLoading, token]);

  // Sin sesion: nada que bloquear.
  useEffect(() => {
    if (!token && !isLoading && decidedForToken.current !== undefined) {
      decidedForToken.current = null;
      setPhase('open');
    }
  }, [token, isLoading]);

  // Volver tras un rato en segundo plano: pedir la huella otra vez.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (state !== 'active' || since === null || Date.now() - since < RELOCK_AFTER_MS) return;
      if (!token) return;
      if ((await isBiometricEnabled()) && (await isBiometricAvailable())) {
        setPhase('locked');
        unlock();
      }
    });
    return () => sub.remove();
  }, [token, unlock]);

  if (phase === 'open') return <>{children}</>;

  return (
    <LinearGradient colors={['#ffffff', '#f3f6fb']} style={styles.flex}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <Image source={require('../../assets/logo-traken.png')} style={styles.logo} resizeMode="contain" />
        {phase === 'checking' ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 28 }} />
        ) : (
          <>
            <Ionicons name="finger-print" size={54} color={colors.teal} style={{ marginTop: 28 }} />
            <Text style={styles.title}>Sesión protegida</Text>
            <Text style={styles.sub}>
              {failed ? 'No se pudo verificar. Intenta de nuevo.' : 'Confirma tu identidad para continuar.'}
            </Text>
            <Pressable style={styles.btn} onPress={unlock}>
              <Text style={styles.btnText}>Usar huella o rostro</Text>
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={() =>
                Alert.alert('Cerrar sesión', '¿Salir de Traken? Tendrás que escribir tu contraseña.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
                ])
              }
            >
              <Text style={styles.link}>Cerrar sesión</Text>
            </Pressable>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 260, height: 140 },
  title: { color: colors.navy, fontSize: 18, fontWeight: '800', marginTop: 12 },
  sub: { color: '#64748b', fontSize: 13, marginTop: 6, textAlign: 'center' },
  btn: {
    backgroundColor: colors.navy,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  link: { color: '#64748b', fontSize: 12.5, marginTop: 18, textDecorationLine: 'underline' },
});
