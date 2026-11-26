import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISODate(iso: string): Date {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatDisplay(iso: string): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

type Props = {
  desde: string;
  hasta: string;
  onChangeDesde: (iso: string) => void;
  onChangeHasta: (iso: string) => void;
};

/**
 * Filtro "Desde / Hasta" por fecha (sobre date_in) -- equivalente movil de
 * los campos rpFrom/rpTo que op/modulos/reports/inicio.php ya tiene en la
 * web, filtrando del lado del cliente sobre los datos ya cargados.
 */
export default function DateRangeFilter({ desde, hasta, onChangeDesde, onChangeHasta }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [activePicker, setActivePicker] = useState<'desde' | 'hasta' | null>(null);
  const hasFilter = !!desde || !!hasta;

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = activePicker;
    if (Platform.OS === 'android') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (target === 'desde') onChangeDesde(toISODate(selected));
    else if (target === 'hasta') onChangeHasta(toISODate(selected));
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.field} onPress={() => setActivePicker('desde')}>
        <Ionicons name="calendar-outline" size={14} color={p.accentText} />
        <Text style={styles.label}>Desde</Text>
        <Text style={[styles.value, !desde && styles.placeholder]}>{desde ? formatDisplay(desde) : '—'}</Text>
      </Pressable>
      <Pressable style={styles.field} onPress={() => setActivePicker('hasta')}>
        <Ionicons name="calendar-outline" size={14} color={p.accentText} />
        <Text style={styles.label}>Hasta</Text>
        <Text style={[styles.value, !hasta && styles.placeholder]}>{hasta ? formatDisplay(hasta) : '—'}</Text>
      </Pressable>
      {hasFilter ? (
        <Pressable
          style={styles.clearBtn}
          onPress={() => {
            onChangeDesde('');
            onChangeHasta('');
          }}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={p.textMuted} />
        </Pressable>
      ) : null}

      {activePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={parseISODate(activePicker === 'desde' ? desde : hasta)}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={!!activePicker} transparent animationType="slide" onRequestClose={() => setActivePicker(null)}>
          <View style={styles.iosOverlay}>
            <View style={styles.iosSheet}>
              <Pressable style={styles.iosDone} onPress={() => setActivePicker(null)}>
                <Text style={styles.iosDoneText}>Listo</Text>
              </Pressable>
              {activePicker && (
                <DateTimePicker
                  value={parseISODate(activePicker === 'desde' ? desde : hasta)}
                  mode="date"
                  display="spinner"
                  onChange={handleChange}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    height: 40,
  },
  label: { color: p.textMuted, fontSize: 11, fontWeight: '700' },
  value: { color: p.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  placeholder: { color: p.placeholder, fontWeight: '500' },
  clearBtn: { padding: 4 },
  iosOverlay: { flex: 1, backgroundColor: p.overlay, justifyContent: 'flex-end' },
  iosSheet: { backgroundColor: p.modalBg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 10 },
  iosDone: { alignItems: 'flex-end', padding: 14 },
  iosDoneText: { color: p.accentText, fontWeight: '800', fontSize: 14 },
});
