import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissNotice, useGuardianNotice } from '../utils/guardian';
import { useNetQuality } from '../utils/netQuality';

/**
 * Avisos del guardian, discretos arriba: "señal baja / modo ahorro" mientras dure, y los avisos de lo que la app
 * detecto y corrigio sola (lentitud, etc.). Nunca tapa botones: solo la franja superior y se quita sola.
 */
export default function GuardianBanner() {
  const insets = useSafeAreaInsets();
  const notice = useGuardianNotice();
  const quality = useNetQuality();

  return (
    <View style={[styles.wrap, { top: insets.top + 4 }]} pointerEvents="box-none">
      {quality === 'slow' && !notice ? (
        <View style={[styles.pill, styles.pillSlow]} pointerEvents="none">
          <Text style={styles.text}>📶 Señal baja · modo ahorro</Text>
        </View>
      ) : null}
      {notice ? (
        <Pressable style={[styles.pill, notice.kind === 'warn' ? styles.pillWarn : styles.pillInfo]} onPress={dismissNotice}>
          <Text style={styles.text}>{notice.text}</Text>
          {notice.action === 'restart' ? (
            <Pressable style={styles.btn} onPress={() => Updates.reloadAsync().catch(() => dismissNotice())}>
              <Text style={styles.btnText}>Reiniciar</Text>
            </Pressable>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 50 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  pillSlow: { backgroundColor: 'rgba(180,83,9,0.92)' },
  pillInfo: { backgroundColor: 'rgba(15,118,110,0.94)' },
  pillWarn: { backgroundColor: 'rgba(185,28,28,0.94)' },
  text: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1, lineHeight: 16 },
  btn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  btnText: { color: '#b91c1c', fontWeight: '800', fontSize: 11.5 },
});
