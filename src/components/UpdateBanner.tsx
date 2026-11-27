import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadow } from '../theme/colors';
import { hasOutboxWork } from '../utils/outbox';

/**
 * Aviso de "hay una actualizacion nueva" -- por defecto expo-updates solo
 * revisa al abrir la app en frio y aplica lo descargado hasta que la persona
 * la cierre por su cuenta. Aqui tambien se revisa cada vez que la app vuelve
 * al frente (maximo cada 10 min), se descarga en segundo plano y se ofrece
 * reiniciar con un boton. Nunca se recarga sola; "Despues" lo oculta hasta
 * la proxima vez que la app vuelva al frente.
 */
const MIN_ENTRE_REVISIONES_MS = 30 * 1000;      // se revisa casi cada vez que la app vuelve al frente
const REVISION_PERIODICA_MS = 3 * 60 * 1000;    // y cada 3 min mientras se usa (solo avisa, no reinicia)
const SEGUNDOS_FUERA_PARA_AUTOAPLICAR = 15;     // tras estar fuera de la app este tiempo, se aplica sola

export default function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const lastCheck = useRef(0);
  const checking = useRef(false);

  /**
   * autoApply = true cuando la persona acaba de abrir la app o de volver a ella: aun no empieza a
   * capturar nada, asi que si hay una actualizacion se descarga y se aplica sola (unos segundos).
   * Nunca se reinicia sola si hay acciones sin enviar en la cola del telefono.
   * Con la app en uso (autoApply = false) solo se descarga y se muestra el aviso con "Reiniciar".
   */
  const checkForUpdate = useCallback(async (autoApply: boolean) => {
    if (__DEV__ || !Updates.isEnabled || checking.current) return;
    const now = Date.now();
    if (now - lastCheck.current < MIN_ENTRE_REVISIONES_MS) return;
    lastCheck.current = now;
    checking.current = true;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        await Updates.fetchUpdateAsync(); // deja isUpdatePending en true
        if (autoApply && !(await hasOutboxWork())) {
          setAutoApplying(true);
          await Updates.reloadAsync();
        }
      }
    } catch (e) {
      setAutoApplying(false);
      // Silencioso: sin internet o servidor caido -- se reintenta la
      // proxima vez que la app pase a primer plano.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    checkForUpdate(true); // al abrir la app
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
        return;
      }
      if (state !== 'active') return;
      setDismissed(false);
      const fueraSeg = leftAt ? (Date.now() - leftAt) / 1000 : 0;
      leftAt = null;
      checkForUpdate(fueraSeg >= SEGUNDOS_FUERA_PARA_AUTOAPLICAR);
    });
    const timer = setInterval(() => checkForUpdate(false), REVISION_PERIODICA_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [checkForUpdate]);

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (e) {
      setRestarting(false);
    }
  };

  if (autoApplying) {
    return (
      <View style={styles.applying} pointerEvents="auto">
        <Image source={require('../../assets/logo-traken.png')} style={styles.applyingLogo} resizeMode="contain" />
        <ActivityIndicator color={colors.teal} style={{ marginTop: 22 }} />
        <Text style={styles.applyingText}>Actualizando Traken…</Text>
      </View>
    );
  }

  if (!isUpdatePending || dismissed) return null;

  return (
    <View style={[styles.wrap, shadow.card, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <Ionicons name="cloud-download-outline" size={18} color={colors.teal} />
        <Text style={styles.text}>Hay una actualización disponible</Text>
        <Pressable style={styles.btn} onPress={restart} disabled={restarting} hitSlop={8}>
          <Text style={styles.btnText}>{restarting ? 'Reiniciando…' : 'Reiniciar'}</Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} disabled={restarting} hitSlop={8}>
          <Text style={styles.laterText}>Después</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  applying: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyingLogo: { width: 240, height: 130 },
  applyingText: { color: '#64748b', fontSize: 13, fontWeight: '700', marginTop: 10 },
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  text: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '600' },
  btn: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  btnText: { color: '#06322f', fontWeight: '800', fontSize: 12 },
  laterText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 },
});
