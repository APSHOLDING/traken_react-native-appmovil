import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { getIncidenciasSc, IncidenciaScItem, IncidenciasScFilters } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'IncidenciasSc'>;

const STATUS_FILTERS: { key: IncidenciasScFilters['status'] | ''; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'open', label: 'Abierta' },
  { key: 'close', label: 'Cerrada' },
  { key: 'cancel', label: 'Cancelada' },
];

/**
 * Incidencias por Evento Especial (SC) -- equivalente movil de
 * op/modulos/scIncidencias/inicio.php. Solo lectura/auditoria, acceso
 * restringido por permiso individual (ver HomeScreen y el backend).
 */
function desfaseColor(dias: number): { bg: string; fg: string } {
  if (dias <= 0) return { bg: 'rgba(22,163,74,0.2)', fg: '#4ade80' };
  if (dias <= 7) return { bg: 'rgba(234,179,8,0.2)', fg: '#facc15' };
  if (dias <= 30) return { bg: 'rgba(249,115,22,0.2)', fg: '#fb923c' };
  return { bg: 'rgba(220,38,38,0.2)', fg: '#fca5a5' };
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Abierta';
  if (status === 'close') return 'Cerrada';
  if (status === 'cancel') return 'Cancelada';
  return '—';
}

export default function IncidenciasScListScreen({ navigation }: Props) {
  const [items, setItems] = useState<IncidenciaScItem[]>([]);
  const [total, setTotal] = useState(0);
  const [avgDesfase, setAvgDesfase] = useState(0);
  const [maxDesfase, setMaxDesfase] = useState(0);
  const [status, setStatus] = useState<IncidenciasScFilters['status'] | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getIncidenciasSc({ status: status || undefined });
      if (res.ok) {
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
        setAvgDesfase(res.avg_desfase ?? 0);
        setMaxDesfase(res.max_desfase ?? 0);
      } else {
        setError(res.error ?? 'No se pudo cargar la información.');
      }
    } catch (e) {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const summaryCards = useMemo(
    () => [
      { label: 'Incidencias', value: String(total) },
      { label: 'Prom. días', value: String(avgDesfase) },
      { label: 'Máximo días', value: String(maxDesfase) },
    ],
    [total, avgDesfase, maxDesfase]
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
            <Text style={styles.topTitle}>Incidencias SC</Text>
            <Text style={styles.topSub}>O.S. registradas con desfase</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.summaryRow}>
          {summaryCards.map((c) => (
            <View key={c.label} style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{c.value}</Text>
              <Text style={styles.summaryLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chipRow}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.key || 'todas'}
              style={[styles.chip, status === f.key && styles.chipActive]}
              onPress={() => setStatus(f.key)}
            >
              <Text style={[styles.chipText, status === f.key && styles.chipTextActive]}>{f.label}</Text>
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
            data={items}
            keyExtractor={(it) => `${it.folio}-${it.id_airport}`}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="checkmark-circle-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No hay incidencias con estos filtros.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const dColor = desfaseColor(item.desfase_dias);
              return (
                <View style={[styles.card, shadow.card]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardFolio}>
                      O.S. {item.folio_display} · {item.airport_iata}
                    </Text>
                    <View style={[styles.desfasePill, { backgroundColor: dColor.bg }]}>
                      <Text style={[styles.desfasePillText, { color: dColor.fg }]}>{item.desfase_dias}d</Text>
                    </View>
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={styles.eventBadge}>
                      <Text style={styles.eventBadgeText}>{item.event_name}</Text>
                    </View>
                    <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                  </View>
                  <Text style={styles.cardSub}>
                    {item.airline_name}
                    {item.flight ? ` · Vuelo ${item.flight.trim()}` : ''}
                  </Text>
                  <View style={styles.datesRow}>
                    <Text style={styles.dateText}>Servicio: {item.date_service ?? '—'}</Text>
                    <Text style={styles.dateText}>
                      Registro: {item.date_registro ? item.date_registro.slice(0, 10) : '—'}
                    </Text>
                  </View>
                  {!!item.user_name && <Text style={styles.userText}>{item.user_name}</Text>}
                </View>
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
  summaryRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: { color: colors.white, fontSize: 20, fontWeight: '800' },
  summaryLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
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
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardFolio: { color: colors.white, fontWeight: '800', fontSize: 13.5 },
  desfasePill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  desfasePillText: { fontSize: 11, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  eventBadge: { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  eventBadgeText: { color: '#fbbf24', fontSize: 10.5, fontWeight: '800' },
  statusText: { color: colors.textMuted, fontSize: 11.5 },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  datesRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  dateText: { color: colors.textMuted, fontSize: 11 },
  userText: { color: colors.teal, fontSize: 11, fontWeight: '700', marginTop: 6 },
});
