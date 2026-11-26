import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { ACCENT_IDS, ACCENTS, buildTheme, MODE_IDS, MODE_LABELS } from '../theme/themes';

type Props = { visible: boolean; onClose: () => void };

/**
 * Hoja para personalizar la app: estilo (claro / como la web / oscuro) y color.
 * El cambio se ve al instante y se guarda solo en el telefono.
 */
export default function ThemePickerModal({ visible, onClose }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Text style={styles.title}>Personalizar</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#16214d" />
            </Pressable>
          </View>

          <Text style={styles.section}>ESTILO</Text>
          <View style={styles.modeRow}>
            {MODE_IDS.map((m) => {
              const preview = buildTheme(m, t.accentId);
              const selected = t.mode === m;
              return (
                <Pressable key={m} style={styles.modeCol} onPress={() => t.setMode(m)}>
                  <LinearGradient
                    colors={preview.bg}
                    style={[styles.modePreview, selected && { borderColor: t.accent, borderWidth: 2.5 }]}
                  >
                    {preview.headerAsCard && (
                      <LinearGradient colors={[preview.accent, preview.accentDark]} style={styles.miniHeader} />
                    )}
                    <View style={styles.miniGrid}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={i}
                          style={[styles.miniCard, { backgroundColor: preview.surface, borderColor: preview.surfaceBorder }]}
                        />
                      ))}
                    </View>
                    {selected && (
                      <View style={[styles.check, { backgroundColor: t.accent }]}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </LinearGradient>
                  <Text style={[styles.modeLabel, selected && { color: '#16214d', fontWeight: '800' }]}>
                    {MODE_LABELS[m].label}
                  </Text>
                  <Text style={styles.modeHint} numberOfLines={2}>
                    {MODE_LABELS[m].hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>COLOR</Text>
          <View style={styles.accentRow}>
            {ACCENT_IDS.map((id) => {
              const selected = t.accentId === id;
              return (
                <Pressable key={id} style={styles.accentCol} onPress={() => t.setAccent(id)} hitSlop={4}>
                  <LinearGradient
                    colors={[ACCENTS[id].main, ACCENTS[id].dark]}
                    style={[styles.dot, selected && styles.dotSelected]}
                  >
                    {selected && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </LinearGradient>
                  <Text style={[styles.dotLabel, selected && { color: '#16214d', fontWeight: '800' }]} numberOfLines={1}>
                    {ACCENTS[id].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#16214d', fontSize: 19, fontWeight: '800' },
  section: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 18, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCol: { flex: 1 },
  modePreview: {
    height: 92,
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  miniHeader: { height: 20, borderRadius: 7, marginBottom: 6 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  miniCard: { width: '47%', flexGrow: 1, borderRadius: 6, borderWidth: 1 },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: { color: '#475569', fontSize: 12.5, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  modeHint: { color: '#94a3b8', fontSize: 10.5, textAlign: 'center', marginTop: 1 },
  accentRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  accentCol: { width: '25%', alignItems: 'center' },
  dot: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  dotSelected: { borderWidth: 3, borderColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
  dotLabel: { color: '#64748b', fontSize: 11, marginTop: 5, fontWeight: '600' },
});
