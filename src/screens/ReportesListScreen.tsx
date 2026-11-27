import React, { useState } from 'react';
import { PruebaBadge, PruebaToggle } from '../components/PruebaBits';
import { useTrackSearch, track } from '../utils/useTrack';
import Loading from '../components/Loading';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getAllOrders } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';
import PaxSearchBox from '../components/PaxSearchBox';
import DateRangeFilter from '../components/DateRangeFilter';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'ReportesList'>;

/**
 * Equivalente movil de op/modulos/reports/inicio.php: lista de ordenes,
 * al tocar una se abre el picker de reportes (por hotel + General).
 */
export default function ReportesListScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  useTrackSearch('ReportesList', query);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estadoF, setEstadoF] = useState('');
  const [verPruebas, setVerPruebas] = useState(false); // por defecto las O.S. de PRUEBA no se muestran

  const {
    data: result,
    isLoading,
    error,
    offlineSince,
    reload,
  } = useOfflineLoad(
    'all_orders',
    () => getAllOrders(),
    (res) => ({ orders: res.orders ?? [], totalAnteriores: res.total_anteriores ?? 0 }),
    []
  );

  const orders = result?.orders ?? [];

  const q = query.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (o.es_prueba && !verPruebas) return false;
    if (q) {
      const hay = `${o.folio_display} ${o.airline} ${o.flight ?? ''} ${o.iata}`.toLowerCase().includes(q);
      if (!hay) return false;
    }
    if (estadoF && String(o.status ?? '').toLowerCase() !== estadoF) return false;
    const fecha = o.date_in ?? '';
    if (desde && (!fecha || fecha < desde)) return false;
    if (hasta && (!fecha || fecha > hasta)) return false;
    return true;
  });

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Reportes</Text>
            <Text style={styles.topSub}>{orders.length} orden(es) este año</Text>
          </View>
          <BrandMark />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={p.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar folio, aerolínea..."
            placeholderTextColor={p.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.chipRow}>
          {[['', 'Todas'], ['abierta', 'Abiertas'], ['cerrada', 'Cerradas'], ['cancelada', 'Canceladas']].map(([k, l]) => (
            <Pressable key={k || 'todas'} style={[styles.chip, estadoF === k && styles.chipActive]} onPress={() => { setEstadoF(k); track('filtro', `Filtró Reportes por estado: ${l}`, { screen: 'ReportesList' }); }}>
              <Text style={[styles.chipText, estadoF === k && styles.chipTextActive]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <DateRangeFilter desde={desde} hasta={hasta} onChangeDesde={setDesde} onChangeHasta={setHasta} />

        <PaxSearchBox
          estado="all"
          onPick={(item) =>
            navigation.navigate('ReportePicker', {
              folio: item.folio,
              idAirport: item.id_airport,
              folioDisplay: item.os,
            })
          }
        />

        <PruebaToggle hidden={orders.filter((o) => o.es_prueba).length} show={verPruebas} onToggle={() => setVerPruebas((v) => !v)} />

        {isLoading ? (
          <Loading style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            data={filtered}
            keyExtractor={(o) => String(o.id)}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              offlineSince ? (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
                  <Text style={styles.offlineBannerText}>
                    Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="file-tray-outline" size={26} color={p.textMuted} />
                <Text style={styles.emptyText}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'No tienes órdenes registradas.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, p.shadowCard]}
                onPress={() =>
                  navigation.navigate('ReportePicker', {
                    folio: item.folio,
                    idAirport: item.id_airport,
                    folioDisplay: item.folio_display,
                  })
                }
              >
                <View style={styles.cardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <Text style={styles.folioText}>#{item.folio_display}</Text>
                    {item.es_prueba ? <PruebaBadge /> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
                </View>
                <View style={styles.rows}>
                  <View style={styles.rowItem}>
                    <Ionicons name="airplane-outline" size={13} color={p.textMuted} />
                    <Text style={styles.rowText}>{item.airline}</Text>
                  </View>
                  {item.date_in ? (
                    <View style={styles.rowItem}>
                      <Ionicons name="calendar-outline" size={13} color={p.textMuted} />
                      <Text style={styles.rowText}>{item.date_in}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  chip: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: p.accent, borderColor: p.accent },
  chipText: { color: p.text, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: p.onAccent },
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
  topTitle: { color: p.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: p.text, fontSize: 14 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
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
    marginBottom: 10,
  },
  offlineBannerText: { color: p.warnText, fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 13,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folioText: { color: p.text, fontWeight: '800', fontSize: 13.5 },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowText: { color: p.textMuted, fontSize: 11.5 },
});
