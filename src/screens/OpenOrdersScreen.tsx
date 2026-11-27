import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PruebaBadge, PruebaToggle } from '../components/PruebaBits';
import { useTrackSearch, track } from '../utils/useTrack';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getOpenOrders, getOpenOrdersExportUrl, getSiteBaseUrl, OpenOrderDTO, PaxSearchItem } from '../api/client';
import { useNetInfo } from '@react-native-community/netinfo';
import { getCache, saveCache } from '../utils/offlineCache';
import { prefetchAirlineLogos } from '../utils/delayLogos';
import CommentsModal from '../components/CommentsModal';
import QrEncuestaModal from '../components/QrEncuestaModal';
import PaxSearchBox from '../components/PaxSearchBox';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'OpenOrders'>;

const CACHE_KEY = 'open_orders';
type CachedOrders = { orders: OpenOrderDTO[]; totalAnteriores: number };

function formatSavedAt(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function OpenOrdersScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [orders, setOrders] = useState<OpenOrderDTO[]>([]);
  const [totalAnteriores, setTotalAnteriores] = useState(0);
  const [query, setQuery] = useState('');
  const [verPruebas, setVerPruebas] = useState(false); // por defecto las O.S. de PRUEBA no se muestran
  useTrackSearch('OpenOrders', query);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [qrOrder, setQrOrder] = useState<OpenOrderDTO | null>(null);
  const [commentsOrder, setCommentsOrder] = useState<OpenOrderDTO | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await getOpenOrders();
      if (res.ok) {
        const nextOrders = res.orders ?? [];
        const nextTotalAnteriores = res.total_anteriores ?? 0;
        setOrders(nextOrders);
        setTotalAnteriores(nextTotalAnteriores);
        setOfflineSince(null);
        await saveCache<CachedOrders>(CACHE_KEY, { orders: nextOrders, totalAnteriores: nextTotalAnteriores });
        // Con internet: se bajan en segundo plano los logos de estas aerolineas, para que el aviso de retraso salga completo aunque despues no haya señal.
        prefetchAirlineLogos(nextOrders.map((o) => o.airline)).catch(() => {});
      } else {
        setError(res.error ?? 'No se pudo cargar la información.');
      }
    } catch (e) {
      // Sin señal: se muestra lo ultimo que se guardo (si hay), en vez de
      // dejar la pantalla vacia. Esto funciona igual en Expo Go que en un
      // build nativo real -- no depende de que la app sea PWA.
      const cached = await getCache<CachedOrders>(CACHE_KEY);
      if (cached) {
        setOrders(cached.data.orders);
        setTotalAnteriores(cached.data.totalAnteriores);
        setOfflineSince(cached.savedAt);
      } else {
        setError('Sin conexión y sin datos guardados todavía.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (verPruebas || !o.es_prueba) &&
          (!q || `${o.folio_display} ${o.airline} ${o.flight ?? ''} ${o.iata}`.toLowerCase().includes(q))
      ),
    [orders, q, verPruebas]
  );

  const handleExport = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert('Nada que exportar', 'No hay órdenes visibles con el filtro actual.');
      return;
    }
    setIsExporting(true);
    try {
      const res = await getOpenOrdersExportUrl(
        filtered.map((o) => ({ folio: o.folio, idAirport: o.id_airport }))
      );
      if (!res.ok || !res.url) {
        Alert.alert('No se pudo exportar', res.error ?? 'Intenta de nuevo.');
        return;
      }
      const destination = new File(Paths.cache, `ordenes_abiertas_${Date.now()}.xlsx`);
      if (destination.exists) destination.delete();
      const task = File.createDownloadTask(`${getSiteBaseUrl()}${res.url}`, destination);
      const downloaded = await task.downloadAsync();
      if (!downloaded || !downloaded.exists || downloaded.size === 0) {
        throw new Error('empty-download');
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Órdenes Abiertas',
        });
      } else {
        Alert.alert('Descargado', 'El Excel se guardó, pero este dispositivo no puede compartirlo/abrirlo directo.');
      }
    } catch (e) {
      Alert.alert('No se pudo exportar', 'Revisa tu conexión e intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  }, [filtered]);

  // Resultado de "Buscar pasajero por nombre": abre el menu de esa O.S. (igual que tocar su tarjeta).
  const openFromPax = (item: PaxSearchItem) => {
    const match = orders.find((o) => o.folio === item.folio && o.id_airport === item.id_airport);
    navigation.navigate('OrderMenu', {
      folio: item.folio,
      idAirport: item.id_airport,
      folioDisplay: item.os,
      iata: item.iata,
      typeAirline: match?.type_airline ?? 'all',
      airline: item.aerolinea,
      flight: match?.flight ?? null,
      esPrueba: match?.es_prueba,
    });
  };

  const showHelp = () =>
    Alert.alert(
      'Órdenes Abiertas',
      '• Busca un pasajero por su nombre (mínimo 3 letras) y toca el resultado para abrir su O.S.\n\n' +
        '• El segundo buscador filtra por folio, aerolínea o vuelo.\n\n' +
        '• En cada O.S.: Agregar (pasajeros, transporte, cerrar…), QR de encuesta, Delay y Comentarios.\n\n' +
        '• "Escanear pasajero (QR)" busca a un pasajero pre-registrado.\n\n' +
        '• "Exportar a Excel" baja la lista que estás viendo.'
    );

  // Encabezado que se desplaza junto con la lista: banner, filtros y acciones. Los buscadores van FIJOS arriba.
  const header = (
    <View style={styles.headerWrap}>
      <LinearGradient colors={[p.accent, p.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="airplane" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Órdenes Abiertas</Text>
            <Text style={styles.heroSub}>Servicios en curso de tu aeropuerto</Text>
          </View>
          <Pressable style={styles.helpBtn} onPress={showHelp} hitSlop={8}>
            <Text style={styles.helpBtnText}>?</Text>
          </Pressable>
        </View>
        <View style={styles.heroChips}>
          <View style={styles.heroChip}>
            <View style={[styles.netDot, { backgroundColor: offline ? '#fbbf24' : '#4ade80' }]} />
            <Text style={styles.heroChipText}>{offline ? 'Sin conexión' : 'Conexión exitosa'}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{orders.length} activa(s) este año</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.toolsCol}>
        <Pressable style={styles.scanBtn} onPress={() => navigation.navigate('PreregScan')}>
          <Ionicons name="qr-code-outline" size={17} color={p.accentText} />
          <Text style={styles.scanBtnText}>Escanear pasajero (QR)</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, isExporting && { opacity: 0.6 }]} onPress={handleExport} disabled={isExporting}>
          {isExporting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="download-outline" size={17} color="#fff" />
          )}
          <Text style={styles.exportBtnText}>Exportar a Excel</Text>
          <View style={styles.exportCount}>
            <Text style={styles.exportCountText}>{filtered.length}</Text>
          </View>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={p.dangerText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : offlineSince ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
          <Text style={styles.offlineBannerText}>
            Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}
          </Text>
        </View>
      ) : null}
      <View style={{ marginHorizontal: -16, marginTop: 8 }}>
        <PruebaToggle hidden={orders.filter((o) => o.es_prueba).length} show={verPruebas} onToggle={() => setVerPruebas((v) => !v)} />
      </View>
    </View>
  );

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
        </View>

        {/* Buscadores FIJOS: se quedan arriba aunque se desplace la lista */}
        <View style={styles.fixedSearch}>
        <PaxSearchBox compact estado="open" onPick={openFromPax} />

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={p.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar folio, aerolínea o vuelo..."
            placeholderTextColor={p.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={10}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={p.accent} />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="file-tray-outline" size={28} color={p.textMuted} />
                <Text style={styles.emptyText}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'No tienes órdenes abiertas.'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            totalAnteriores > 0 ? (
              <View style={styles.oldBanner}>
                <Ionicons name="time-outline" size={15} color={p.warnText} />
                <Text style={styles.oldBannerText}>
                  {totalAnteriores} orden(es) de años anteriores (no se muestran aquí)
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={[styles.card, p.shadowCard, item.es_prueba && { borderColor: '#f59e0b', borderWidth: 2 }]}>
              <View style={styles.cardTop}>
                <View style={styles.folioRow}>
                  <View style={styles.dot} />
                  <Text style={styles.folioText}>#{item.folio_display}</Text>
                  {item.es_prueba ? <PruebaBadge /> : null}
                </View>
                {item.iata ? (
                  <View style={styles.iataBadge}>
                    <Text style={styles.iataText}>{item.iata}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rows}>
                <View style={styles.rowItem}>
                  <Ionicons name="airplane-outline" size={14} color={p.textMuted} />
                  <Text style={styles.rowText}>{item.airline}</Text>
                </View>
                {item.flight ? (
                  <View style={styles.rowItem}>
                    <Ionicons name="pricetag-outline" size={14} color={p.textMuted} />
                    <Text style={styles.rowText}>{item.flight.trim()}</Text>
                  </View>
                ) : null}
                {item.date_in ? (
                  <View style={styles.rowItem}>
                    <Ionicons name="calendar-outline" size={14} color={p.textMuted} />
                    <Text style={styles.rowText}>{item.date_in}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, styles.actionAdd]}
                  onPress={() =>
                    navigation.navigate('OrderMenu', {
                      folio: item.folio,
                      idAirport: item.id_airport,
                      folioDisplay: item.folio_display,
                      iata: item.iata,
                      typeAirline: item.type_airline,
                      airline: item.airline,
                      flight: item.flight,
                      esPrueba: item.es_prueba,
                    })
                  }
                >
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.actionText}>Agregar</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionQr]} onPress={() => setQrOrder(item)}>
                  <Ionicons name="qr-code-outline" size={14} color="#4454c3" />
                  <Text style={[styles.actionText, styles.actionQrText]}>QR</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionDelay]}
                  onPress={() =>
                    navigation.navigate('Delay', {
                      folio: item.folio,
                      idAirport: item.id_airport,
                      folioDisplay: item.folio_display,
                      iata: item.iata,
                      typeAirline: item.type_airline,
                      airline: item.airline,
                      flight: item.flight,
                    })
                  }
                >
                  <Ionicons name="time-outline" size={14} color="#fff" />
                  <Text style={styles.actionText}>Delay</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionComments]} onPress={() => setCommentsOrder(item)}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color="#fff" />
                  <Text style={styles.actionText}>Comentarios</Text>
                </Pressable>
              </View>
            </View>
          )}
        />

        <QrEncuestaModal
          visible={!!qrOrder}
          onClose={() => setQrOrder(null)}
          folioDisplay={qrOrder?.folio_display ?? ''}
          iata={qrOrder?.iata ?? ''}
        />
        <CommentsModal
          visible={!!commentsOrder}
          onClose={() => setCommentsOrder(null)}
          idOrder={commentsOrder?.folio ?? 0}
          idAirport={commentsOrder?.id_airport ?? 0}
          folioDisplay={commentsOrder?.folio_display ?? ''}
        />
      </SafeAreaView>
    </LinearGradient>
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.dangerSoft,
    borderWidth: 1,
    borderColor: p.dangerBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  errorText: { color: p.dangerText, fontSize: 12.5, flexShrink: 1 },
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
    marginHorizontal: 16,
    marginBottom: 10,
  },
  offlineBannerText: { color: p.warnText, fontSize: 12, flexShrink: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30, gap: 10 },
  // El encabezado conserva los margenes de 16 que ya traen sus piezas: se cancela el relleno de la lista.
  headerWrap: { marginHorizontal: -16 },
  fixedSearch: { paddingTop: 2, paddingBottom: 2 },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 22,
    padding: 16,
    shadowColor: p.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: p.isDark ? 0.35 : 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 },
  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: { color: '#16214d', fontWeight: '900', fontSize: 14 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  netDot: { width: 8, height: 8, borderRadius: 4 },
  heroChipText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  toolsCol: { marginHorizontal: 16, marginBottom: 12, gap: 8 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: p.accentSoft,
    borderWidth: 1,
    borderColor: p.accentBorder,
  },
  scanBtnText: { color: p.accentText, fontWeight: '800', fontSize: 13.5 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: p.isDark ? p.cardStrong : '#16214d',
    borderWidth: p.isDark ? 1 : 0,
    borderColor: p.cardBorder,
  },
  exportBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13.5 },
  exportCount: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  exportCountText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folioRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: p.accent },
  folioText: { color: p.text, fontWeight: '800', fontSize: 13.5 },
  iataBadge: {
    backgroundColor: p.isDark ? '#2b3f86' : p.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  iataText: { color: p.isDark ? '#ffffff' : p.accentText, fontSize: 10.5, fontWeight: '800' },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowText: { color: p.textMuted, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
  actionAdd: { backgroundColor: '#16a34a' },
  actionQr: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#dbe3ff' },
  actionQrText: { color: '#4454c3' },
  actionDelay: { backgroundColor: '#0891b2' },
  actionComments: { backgroundColor: '#d97706' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13 },
  oldBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: p.warnSoft,
    borderWidth: 1,
    borderColor: p.warnBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  oldBannerText: { color: p.warnText, fontSize: 11.5, flexShrink: 1 },
});
