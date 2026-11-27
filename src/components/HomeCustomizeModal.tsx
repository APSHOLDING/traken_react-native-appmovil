import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CustomizeItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  gradient: readonly [string, string];
};

type Props = {
  visible: boolean;
  /** Todos los modulos en el orden actual (incluidos los ocultos). */
  items: CustomizeItem[];
  hidden: string[];
  view: 'cards' | 'icons';
  onViewChange: (v: 'cards' | 'icons') => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggle: (key: string) => void;
  onReset: () => void;
  onClose: () => void;
};

/**
 * "Personalizar menu": cada persona acomoda su inicio -- sube/baja lo que mas usa y oculta lo que no.
 * Se guarda en el telefono (por usuario). Sin librerias nuevas: flechas y un ojo, facil de usar con una mano.
 */
export default function HomeCustomizeModal({ visible, items, hidden, view, onViewChange, onMove, onToggle, onReset, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const shown = items.length - hidden.length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Text style={styles.title}>Personalizar menú</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#16214d" />
            </Pressable>
          </View>
          <View style={styles.seg}>
            {([['cards', 'Tarjetas', 'albums-outline'], ['icons', 'Iconos', 'apps-outline']] as const).map(([k, l, ic]) => (
              <Pressable key={k} style={[styles.segBtn, view === k && styles.segBtnOn]} onPress={() => onViewChange(k)}>
                <Ionicons name={ic} size={15} color={view === k ? '#fff' : '#16214d'} />
                <Text style={[styles.segText, view === k && styles.segTextOn]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            Pon arriba lo que más usas con las flechas y oculta con el ojo lo que no necesites. Tu menú se guarda en este teléfono.
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {items.map((it, i) => {
              const off = hidden.indexOf(it.key) >= 0;
              return (
                <View key={it.key} style={[styles.row, off && styles.rowOff]}>
                  <LinearGradient colors={it.gradient} style={styles.icon}>
                    <Ionicons name={it.icon} size={18} color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.label, off && styles.labelOff]} numberOfLines={1}>
                    {it.label}
                  </Text>
                  <Pressable style={[styles.btn, i === 0 && styles.btnDis]} disabled={i === 0} onPress={() => onMove(it.key, -1)} hitSlop={6}>
                    <Ionicons name="chevron-up" size={18} color="#16214d" />
                  </Pressable>
                  <Pressable
                    style={[styles.btn, i === items.length - 1 && styles.btnDis]}
                    disabled={i === items.length - 1}
                    onPress={() => onMove(it.key, 1)}
                    hitSlop={6}
                  >
                    <Ionicons name="chevron-down" size={18} color="#16214d" />
                  </Pressable>
                  <Pressable style={styles.btn} onPress={() => onToggle(it.key)} hitSlop={6}>
                    <Ionicons name={off ? 'eye-off-outline' : 'eye-outline'} size={19} color={off ? '#94a3b8' : '#0f766e'} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.count}>
              {shown} visible{shown === 1 ? '' : 's'}
              {hidden.length ? ` · ${hidden.length} oculto${hidden.length === 1 ? '' : 's'}` : ''}
            </Text>
            <Pressable onPress={onReset} hitSlop={8}>
              <Text style={styles.reset}>Restablecer</Text>
            </Pressable>
            <Pressable style={styles.done} onPress={onClose}>
              <Text style={styles.doneText}>Listo</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, maxHeight: '86%' },
  grab: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#16214d', fontSize: 19, fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 3, marginTop: 12 },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 11 },
  segBtnOn: { backgroundColor: '#0f766e' },
  segText: { color: '#16214d', fontWeight: '800', fontSize: 12.5 },
  segTextOn: { color: '#fff' },
  hint: { color: '#64748b', fontSize: 12.5, lineHeight: 18, marginTop: 6, marginBottom: 10 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  rowOff: { opacity: 0.55 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: '#16214d', fontSize: 14, fontWeight: '700' },
  labelOff: { textDecorationLine: 'line-through', color: '#64748b' },
  btn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  btnDis: { opacity: 0.3 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12 },
  count: { flex: 1, color: '#64748b', fontSize: 12 },
  reset: { color: '#0f766e', fontWeight: '800', fontSize: 13 },
  done: { backgroundColor: '#0f766e', borderRadius: 22, paddingHorizontal: 22, height: 42, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
