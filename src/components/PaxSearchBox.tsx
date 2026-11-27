import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '../components/Ionicons';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { PaxSearchItem, searchPaxByName } from '../api/client';

function statusLabel(status: string): { label: string; color: string; bg: string } {
  if (status === 'open') return { label: 'Abierta', color: '#166534', bg: '#dcfce7' };
  if (status === 'cancel') return { label: 'Cancelada', color: '#991b1b', bg: '#fee2e2' };
  return { label: 'Cerrada', color: '#1d4ed8', bg: '#dbeafe' };
}

type Props = {
  /** 'open' busca solo en O.S. abiertas (picker de Órdenes Abiertas); 'all' busca en todas (Reportes, Detalles). */
  estado: 'open' | 'all';
  onPick: (item: PaxSearchItem) => void;
};

/**
 * Buscador de pasajero por nombre en todas las O.S. del usuario --
 * equivalente movil de la cajita que js/buscar_pax.js inyecta en la web
 * sobre Órdenes Abiertas y Reportes (op/modulos/open/buscarPax.php).
 */
export default function PaxSearchBox({ estado, onPick }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PaxSearchItem[]>([]);
  const [mas, setMas] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      setMas(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchPaxByName(q, estado);
        if (cancelled) return;
        if (res.ok) {
          setItems(res.items ?? []);
          setMas(!!res.mas);
          setSearchError(null);
        } else {
          setItems([]);
          setSearchError(res.error ?? 'No se pudo buscar. Intenta de nuevo.');
        }
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setSearchError('Sin respuesta del servidor. Intenta de nuevo.');
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, estado]);

  const q = query.trim();

  return (
    <View style={[styles.box, p.shadowCard]}>
      <Text style={styles.title}>🔎 Buscar pasajero por nombre</Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Nombre o apellido del pasajero…"
          placeholderTextColor={p.placeholder}
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {query ? (
          <Pressable style={styles.clearBtn} onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close" size={16} color={p.textMuted} />
          </Pressable>
        ) : null}
        {isSearching ? <ActivityIndicator color={p.accentText} size="small" /> : null}
      </View>
      <Text style={styles.hint}>
        {estado === 'open' ? 'Busca en las O.S. abiertas de tus estaciones.' : 'Busca en todas las O.S. de tus estaciones.'}{' '}
        Escribe al menos 3 letras.
      </Text>

      {q.length >= 3 && !isSearching ? (
        searchError ? (
          <Text style={styles.msg}>⚠️ {searchError}</Text>
        ) : items.length === 0 ? (
          <Text style={styles.msg}>
            No se encontró ningún pasajero con ese nombre{estado === 'open' ? ' en las O.S. abiertas' : ''}.
          </Text>
        ) : (
          <View style={styles.results}>
            <Text style={styles.msg}>
              {items.length}
              {mas ? '+' : ''} coincidencia(s){mas ? ' (primeras 80; afina la búsqueda)' : ''}
            </Text>
            <ScrollView style={styles.resultsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {items.map((item, idx) => {
              const st = statusLabel(item.status);
              return (
                <Pressable
                  key={`${item.folio}-${item.id_airport}-${idx}`}
                  style={styles.item}
                  onPress={() => onPick(item)}
                >
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.pax}
                  </Text>
                  <View style={styles.itemLine}>
                    <View style={styles.osChip}>
                      <Text style={styles.osChipText}>#{item.os}</Text>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
                    </View>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {item.iata} · {item.aerolinea} · {item.fecha}
                    </Text>
                  </View>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    🏨 {item.hotel || 'Sin hotel'}
                    {item.hab ? ` · Hab. ${item.hab}` : ''}
                    {item.tipo ? ` · ${item.tipo}` : ''}
                    {item.voucher ? ` · Voucher ${item.voucher}` : ''}
                  </Text>
                </Pressable>
              );
            })}
            </ScrollView>
          </View>
        )
      ) : null}
    </View>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  box: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 13,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  title: { color: p.text, fontWeight: '800', fontSize: 13.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    height: 42,
    color: p.text,
    fontSize: 13.5,
  },
  clearBtn: { padding: 4 },
  hint: { color: p.textMuted, fontSize: 11, marginTop: 7, lineHeight: 15 },
  msg: { color: p.textMuted, fontSize: 12, marginTop: 10 },
  results: { marginTop: 4 },
  resultsScroll: { maxHeight: 320 },
  item: {
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 11,
    marginTop: 8,
    backgroundColor: p.isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
  },
  itemName: { color: p.text, fontWeight: '800', fontSize: 13 },
  itemLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  osChip: { backgroundColor: p.accent, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2 },
  osChipText: { color: p.onAccent, fontWeight: '800', fontSize: 10.5 },
  statusChip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusChipText: { fontSize: 10, fontWeight: '800' },
  itemSub: { color: p.textMuted, fontSize: 11, marginTop: 4, flexShrink: 1 },
});
