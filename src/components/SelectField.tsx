import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '../components/Ionicons';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';

export interface SelectOption {
  id: number;
  label: string;
}

type Props = {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
  emptyText?: string;
};

/**
 * Selector con buscador (equivalente movil del select2 que usa
 * op/modulos/create/inicio.php para Aeropuerto/Evento/Aerolinea/Hotel):
 * en vez de tirar TODAS las opciones como chips en la pantalla (ilegible en
 * estaciones con decenas de aerolineas u hoteles), se muestra un campo
 * compacto que abre una hoja con buscador -- se escribe para filtrar, se
 * toca una fila y listo.
 */
export default function SelectField({
  label,
  placeholder = 'Seleccionar',
  options,
  selectedId,
  onSelect,
  disabled,
  emptyText,
}: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.id === selectedId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const open = () => {
    if (disabled) return;
    setQuery('');
    setVisible(true);
  };

  return (
    <>
      <Pressable style={[styles.field, disabled && styles.fieldDisabled]} onPress={open}>
        <Text style={[styles.fieldText, !selected && styles.fieldPlaceholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={p.textMuted} />
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
            <Pressable style={[styles.sheet, p.shadowCard]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Pressable onPress={() => setVisible(false)} hitSlop={10}>
                  <Ionicons name="close-circle" size={22} color={p.textMuted} />
                </Pressable>
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={p.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Buscar..."
                  placeholderTextColor={p.placeholder}
                  style={styles.searchInput}
                  autoFocus
                  autoCapitalize="none"
                />
              </View>
              <FlatList
                data={filtered}
                keyExtractor={(o) => String(o.id)}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={<Text style={styles.emptyText}>{emptyText ?? 'Sin resultados.'}</Text>}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.row, item.id === selectedId && styles.rowActive]}
                    onPress={() => {
                      onSelect(item.id);
                      setVisible(false);
                    }}
                  >
                    <Text style={[styles.rowText, item.id === selectedId && styles.rowTextActive]} numberOfLines={2}>
                      {item.label}
                    </Text>
                    {item.id === selectedId && <Ionicons name="checkmark" size={18} color={p.accentText} />}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  flex: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    height: 46,
  },
  fieldDisabled: { opacity: 0.5 },
  fieldText: { color: p.text, fontSize: 14, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  fieldPlaceholder: { color: p.placeholder, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: p.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: p.modalBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '80%',
    minHeight: '45%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { color: p.text, fontSize: 15, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    height: 44,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: p.text, fontSize: 14 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 10 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  rowActive: { backgroundColor: p.accentSoft },
  rowText: { color: p.text, fontSize: 14, flexShrink: 1, marginRight: 8 },
  rowTextActive: { color: p.accentText, fontWeight: '700' },
});
