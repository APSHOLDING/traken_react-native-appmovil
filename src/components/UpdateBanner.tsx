import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadow } from '../theme/colors';

/**
 * Aviso de "hay una actualizacion nueva" -- por defecto expo-updates solo
 * revisa al abrir la app en frio y aplica lo descargado hasta que la persona
 * la cierre por su cuenta. Aqui tambien se revisa cada vez que la app vuelve
 * al frente (maximo cada 10 min), se descarga en segundo plano y se ofrece
 * reiniciar con un boton. Nunca se recarga sola; "Despues" lo oculta hasta
 * la proxima vez que la app vuelva al frente.
 */
const MIN_ENTRE_REVISIONES_MS = 10 * 60 * 1000;

export default function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const lastCheck = useRef(0);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    const now = Date.now();
    if (now - lastCheck.current < MIN_ENTRE_REVISIONES_MS) return;
    lastCheck.current = now;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) await Updates.fetchUpdateAsync(); // deja isUpdatePending en true
    } catch (e) {
      // Silencioso: sin internet o servidor caido -- se reintenta la
      // proxima vez que la app pase a primer plano.
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setDismissed(false);
      checkForUpdate();
    });
    return () => sub.remove();
  }, [checkForUpdate]);

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (e) {
      setRestarting(false);
    }
  };

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
