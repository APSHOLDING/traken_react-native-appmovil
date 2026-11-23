import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { getSlaList, SlaEstado, SlaListItem } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'SlaList'>;

const ESTADO_FILTERS: { key: SlaEstado | ''; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'sin', label: 'Sin iniciar' },
  { key: 'curso', label: 'En curso' },
  { key: 'fin', label: 'Terminadas' },
  { key: 'sin_cierre', label: 'Sin cierre +24h' },
];

function estadoLabel(item: SlaListItem): { text: string; color: string } {
  if (item.estado === 'sin_cierre') return { text: '⛔ Sin cierre (+24h)', color: '#fca5a5' };
  if (item.estado === 'curso') return { text: '⏱ En curso', color: '#93c5fd' };
  if (item.estado === 'fin') return { text: '✅ Terminada', color: '#4ade80' };
  return { text: 'Sin iniciar', color: colors.textMuted };
}

function semaforoColor(sem: SlaListItem['semaforo']): string | null {
  if (sem === 'verde') return colors.ok;
  if (sem === 'amarillo') return colors.warn;
  if (sem === 'rojo') return colors.danger;
  return null;
}

/**
 * SLA de Operaciones -- equivalente movil de op/modulos/sla/inicio.php.
 * Solo aplica a O.S. con motivo CXLD/DLY. Toca una O.S. para ir al
 * formulario de 11 tiempos.
 */
export default function SlaListScreen({ navigation }: Props) {
  const [items, setItems] = useState<SlaListItem[]>([]);
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState<SlaEstado | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSlaList();
      if (res.ok) {
        setItems(res.items ?? []);
      } else {
        setError(res.error ?? 'No se pudo cargar la información.');
      }
    } catch (e) {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (estado && it.estado !== estado) return false;
        if (!q) return true;
        return `${it.folio_display} ${it.iata} ${it.airline} ${it.flight ?? ''}`.toLowerCase().includes(q);
      }),
    [items, estado, q]
  );

  return (
    <LinearGradient colors={gradients.hero} style={styles.flex}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>SLA de Operaciones</Text>
            <Text style={styles.topSub}>Solo motivos CXLD / DLY</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar folio, estación, aerolínea o vuelo..."
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.chipRow}>
          {ESTADO_FILTERS.map((f) => (
            <Pressable
              key={f.key || 'todas'}
              style={[styles.chip, estado === f.key && styles.chipActive]}
              onPress={() => setEstado(f.key)}
            >
              <Text style={[styles.chipText, estado === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => `${it.folio}-${it.id_airport}`}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="timer-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {q || estado ? 'Sin resultados para estos filtros.' : 'No hay O.S. con CXLD/DLY recientes.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const e = estadoLabel(item);
              const semColor = semaforoColor(item.semaforo);
              return (
                <Pressable
                  style={[styles.card, shadow.card]}
                  onPress={() =>
                    navigation.navigate('SlaForm', {
                      folio: item.folio,
                      idAirport: item.id_airport,
                      folioDisplay: item.folio_display,
                    })
                  }
                >
                  <View style={[styles.sideBar, { backgroundColor: semColor ?? 'rgba(255,255,255,0.18)' }]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardFolio}>
                        O.S. {item.folio_display} · {item.iata}
                      </Text>
                      <Text style={[styles.estadoText, { color: e.color }]}>{e.text}</Text>
                    </View>
                    <Text style={styles.cardSub}>
                      {item.airline}
                      {item.flight ? ` · Vuelo ${item.flight.trim()}` : ''} · {item.date_in ?? ''}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View style={styles.eventBadge}>
                        <Text style={styles.eventBadgeText}>{item.event_name}</Text>
                      </View>
                      <Text style={styles.metaText}>
                        {item.minutos_sla !== null ? `${item.minutos_sla} min` : `${item.hechos}/11 pasos`}
                      </Text>
                      {item.pax > 0 ? <Text style={styles.metaText}>· {item.pax} pax</Text> : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#06322f' },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: '#06322f', fontWeight: '800', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    overflow: 'hidden',
    marginBottom: 10,
  },
  sideBar: { width: 5 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardFolio: { color: colors.white, fontWeight: '800', fontSize: 13.5, flexShrink: 1 },
  estadoText: { fontSize: 11, fontWeight: '700' },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  eventBadge: { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  eventBadgeText: { color: '#fbbf24', fontSize: 10.5, fontWeight: '800' },
  metaText: { color: colors.textMuted, fontSize: 11 },
});
