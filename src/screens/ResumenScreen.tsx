import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { track } from '../utils/useTrack';
import Loading from '../components/Loading';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getResumenEstacion, ResumenRow, ResumenTotales } from '../api/client';
import { getCache, saveCache } from '../utils/offlineCache';
import { formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'Resumen'>;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function currentPeriodo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriodo(periodo: string, delta: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Equivalente movil de op/modulos/resumen/inicio.php: operaciones,
 * habitaciones y pasajeros por estacion en el mes elegido. Solo lectura.
 */
export default function ResumenScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [rows, setRows] = useState<ResumenRow[]>([]);
  const [totales, setTotales] = useState<ResumenTotales | null>(null);
  const [mesLabel, setMesLabel] = useState('');
  const [esAdminGeneral, setEsAdminGeneral] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);

  const cacheKey = `resumen_${periodo}`;

  // Orden, buscador y comparacion con el mes anterior.
  const [sortBy, setSortBy] = useState<'pax' | 'operaciones' | 'habitaciones'>('pax');
  const [query, setQuery] = useState('');
  const [prevPax, setPrevPax] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrevPax(null);
    getResumenEstacion(shiftPeriodo(periodo, -1))
      .then((r) => {
        if (!cancelled && r.ok && r.totales) setPrevPax(r.totales.adultos + r.totales.menores + r.totales.infantes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [periodo]);

  // Ultimos 8 meses como atajos (un toque para saltar a cualquiera).
  const monthChips = useMemo(() => {
    const now = currentPeriodo();
    return Array.from({ length: 8 }, (_, i) => shiftPeriodo(now, -i));
  }, []);
  const monthShort = (per: string) => {
    const [y, m] = per.split('-').map(Number);
    return `${MESES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
  };

  const paxOf = (r: { adultos: number; menores: number; infantes: number }) => r.adultos + r.menores + r.infantes;
  const shownRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || `${r.iata} ${r.airportName}`.toLowerCase().includes(q));
    const key = (r: ResumenRow) => (sortBy === 'pax' ? paxOf(r) : sortBy === 'operaciones' ? r.operaciones : r.habitaciones);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, query, sortBy]);
  const maxVal = Math.max(1, ...shownRows.map((r) => (sortBy === 'pax' ? paxOf(r) : sortBy === 'operaciones' ? r.operaciones : r.habitaciones)));
  const totalPax = totales ? totales.adultos + totales.menores + totales.infantes : 0;
  const delta = prevPax && prevPax > 0 ? Math.round(((totalPax - prevPax) / prevPax) * 100) : null;
  const leader = shownRows.length && !query ? shownRows[0] : null;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getResumenEstacion(periodo);
      if (res.ok) {
        setRows(res.rows ?? []);
        setTotales(res.totales ?? null);
        setMesLabel(res.mes_label ?? '');
        setEsAdminGeneral(!!res.es_admin_general);
        setOfflineSince(null);
        await saveCache(cacheKey, {
          rows: res.rows ?? [],
          totales: res.totales ?? null,
          mesLabel: res.mes_label ?? '',
          esAdminGeneral: !!res.es_admin_general,
        });
      } else {
        setError(res.error ?? 'No se pudo cargar el resumen.');
      }
    } catch (e) {
      const cached = await getCache<{
        rows: ResumenRow[];
        totales: ResumenTotales | null;
        mesLabel: string;
        esAdminGeneral: boolean;
      }>(cacheKey);
      if (cached) {
        setRows(cached.data.rows);
        setTotales(cached.data.totales);
        setMesLabel(cached.data.mesLabel);
        setEsAdminGeneral(cached.data.esAdminGeneral);
        setOfflineSince(cached.savedAt);
      } else {
        setError('Sin conexión y sin datos guardados todavía.');
      }
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  useEffect(() => {
    load();
  }, [load]);

  const isCurrentMonth = periodo === currentPeriodo();

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <Text style={styles.topTitle}>Resumen por Estación</Text>
          <BrandMark />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {offlineSince && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
              <Text style={styles.offlineBannerText}>
                Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
              </Text>
            </View>
          )}

          {/* Atajos de mes: un toque y listo */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
            {monthChips.map((m) => (
              <Pressable key={m} style={[styles.monthChip, periodo === m && styles.monthChipOn]} onPress={() => { setPeriodo(m); track('filtro', `Resumen por estación: mes ${m}`, { screen: 'Resumen' }); }}>
                <Text style={[styles.monthChipText, periodo === m && styles.monthChipTextOn]}>{monthShort(m)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {esAdminGeneral && <Text style={styles.adminNote}>Vista de administrador: todas las estaciones.</Text>}

          {isLoading ? (
            <Loading style={{ marginTop: 40 }} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={p.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="bar-chart-outline" size={28} color={p.textMuted} />
              <Text style={styles.emptyText}>Sin operaciones registradas en {mesLabel || 'este mes'}.</Text>
            </View>
          ) : (
            <>
              {/* Total del mes, grande y claro */}
              {totales && (
                <LinearGradient colors={[p.accent, p.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                  <Text style={styles.heroMonth}>{(mesLabel || periodo).toUpperCase()}</Text>
                  <View style={styles.heroMainRow}>
                    <Text style={styles.heroBig}>{totalPax.toLocaleString('es-MX')}</Text>
                    <Text style={styles.heroBigLabel}>pasajeros</Text>
                    {delta !== null ? (
                      <View style={styles.deltaPill}>
                        <Ionicons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={13} color="#fff" />
                        <Text style={styles.deltaText}>
                          {delta >= 0 ? '+' : ''}
                          {delta}% vs mes anterior
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.heroStats}>
                    <HeroStat icon="document-text" label="Operac." value={totales.operaciones} />
                    <HeroStat icon="bed" label="Hab." value={totales.habitaciones} />
                    <HeroStat icon="person" label="Adultos" value={totales.adultos} />
                    <HeroStat icon="happy" label="Menores" value={totales.menores} />
                    <HeroStat icon="heart" label="Infantes" value={totales.infantes} />
                  </View>
                  {leader ? (
                    <Text style={styles.heroLeader}>
                      🏆 Estación líder: {leader.iata} con {paxOf(leader).toLocaleString('es-MX')} pasajeros (
                      {totalPax > 0 ? Math.round((paxOf(leader) / totalPax) * 100) : 0}%)
                    </Text>
                  ) : null}
                </LinearGradient>
              )}

              {/* Ordenar y buscar */}
              <View style={styles.sortRow}>
                {([['pax', 'Pasajeros'], ['operaciones', 'Operaciones'], ['habitaciones', 'Habitaciones']] as const).map(([k, l]) => (
                  <Pressable key={k} style={[styles.sortChip, sortBy === k && styles.sortChipOn]} onPress={() => { setSortBy(k); track('filtro', `Resumen por estación: ordenó por ${l}`, { screen: 'Resumen' }); }}>
                    <Text style={[styles.sortChipText, sortBy === k && styles.sortChipTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {rows.length > 5 ? (
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={15} color={p.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Buscar estación (CUN, Los Cabos…)"
                    placeholderTextColor={p.placeholder}
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />
                </View>
              ) : null}

              {shownRows.map((r, i) => {
                const val = sortBy === 'pax' ? paxOf(r) : sortBy === 'operaciones' ? r.operaciones : r.habitaciones;
                return (
                  <View key={r.iata} style={[styles.card, p.shadowCard]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <View style={styles.iataBadge}>
                        <Text style={styles.iataText}>{r.iata}</Text>
                      </View>
                      <Text style={styles.airportName} numberOfLines={1}>{r.airportName}</Text>
                      <Text style={styles.cardPax}>{paxOf(r)} pax</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(4, Math.round((val / maxVal) * 100))}%` }]} />
                    </View>
                    <View style={styles.statsRow}>
                      <Stat label="Operac." value={r.operaciones} />
                      <Stat label="Hab." value={r.habitaciones} />
                      <Stat label="Adultos" value={r.adultos} />
                      <Stat label="Menores" value={r.menores} />
                      <Stat label="Infantes" value={r.infantes} />
                    </View>
                  </View>
                );
              })}
              {shownRows.length === 0 ? <Text style={styles.emptyText}>Ninguna estación coincide con tu búsqueda.</Text> : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function HeroStat({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.heroStat}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.85)" />
      <Text style={styles.heroStatValue}>{value.toLocaleString('es-MX')}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, light }: { label: string; value: number; light?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, light && styles.statValueLight]}>{value}</Text>
      <Text style={[styles.statLabel, light && styles.statLabelLight]}>{label}</Text>
    </View>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
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
  topTitle: { color: p.text, fontSize: 15, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.warnSoft,
    borderWidth: 1,
    borderColor: p.warnBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  offlineBannerText: { color: p.warnText, fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  periodBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabelWrap: { alignItems: 'center', flex: 1 },
  periodLabel: { color: p.text, fontWeight: '800', fontSize: 15, textTransform: 'capitalize' },
  periodToday: { color: p.accentText, fontSize: 11, fontWeight: '700', marginTop: 3 },
  adminNote: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginBottom: 14, marginTop: 4 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginTop: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iataBadge: { backgroundColor: p.accent, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  iataText: { color: p.onAccent, fontWeight: '900', fontSize: 12 },
  airportName: { color: p.text, fontWeight: '700', fontSize: 13, flex: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: p.text, fontWeight: '900', fontSize: 16 },
  statValueLight: { color: '#fff' },
  statLabel: { color: p.textMuted, fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  statLabelLight: { color: 'rgba(255,255,255,0.75)' },
  monthRow: { gap: 8, paddingBottom: 12, paddingRight: 8 },
  monthChip: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 },
  monthChipOn: { backgroundColor: p.accent, borderColor: p.accent },
  monthChipText: { color: p.text, fontSize: 12.5, fontWeight: '700', textTransform: 'capitalize' },
  monthChipTextOn: { color: p.onAccent },
  hero: { borderRadius: 22, padding: 18, marginTop: 4 },
  heroMonth: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroMainRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  heroBig: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  heroBigLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  deltaText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  heroStat: { alignItems: 'center', flex: 1, gap: 2 },
  heroStatValue: { color: '#fff', fontSize: 15, fontWeight: '900' },
  heroStatLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  heroLeader: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 14, lineHeight: 17 },
  sortRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  sortChip: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  sortChipOn: { backgroundColor: p.accent, borderColor: p.accent },
  sortChipText: { color: p.text, fontSize: 12, fontWeight: '700' },
  sortChipTextOn: { color: p.onAccent },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: radii.input, paddingHorizontal: 12, height: 42, marginTop: 10 },
  searchInput: { flex: 1, color: p.text, fontSize: 13.5 },
  rank: { color: p.textMuted, fontWeight: '900', fontSize: 13, width: 18 },
  cardPax: { color: p.accentText, fontWeight: '900', fontSize: 13 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: p.divider, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: p.accent },
  totalCard: { backgroundColor: colors.navy3, borderColor: colors.navy3, marginBottom: 6 },
  totalLabel: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1, marginBottom: 10, textAlign: 'center' },
});
