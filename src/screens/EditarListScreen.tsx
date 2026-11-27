import React, { useMemo, useState } from 'react';
import PaxSearchBox from '../components/PaxSearchBox';
import { PruebaBadge, PruebaToggle } from '../components/PruebaBits';
import { useTrackSearch, track } from '../utils/useTrack';
import Loading from '../components/Loading';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { AnyOrderDTO, getAllOrders, toggleOrderStatus } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'EditarList'>;

function statusInfo(status: string): { label: string; color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === 'open') return { label: 'Abierta', color: '#166534', bg: '#dcfce7' };
  if (s === 'cancel') return { label: 'Cancelada', color: '#991b1b', bg: '#fee2e2' };
  return { label: 'Cerrada', color: '#475569', bg: '#e2e8f0' };
}

/**
 * Equivalente movil de op/modulos/createEdit/inicio.php: lista de ordenes
 * con accion rapida de Reabrir/Recerrar por renglon, y "Editar" para el
 * formulario completo (EditarOrdenScreen).
 */
export default function EditarListScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [verPruebas, setVerPruebas] = useState(false); // por defecto las O.S. de PRUEBA no se muestran
  useTrackSearch('EditarList', query);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const {
    data: result,
    isLoading,
    error,
    offlineSince,
    reload,
  } = useOfflineLoad(
    'all_orders',
    () => getAllOrders(),
    (res) => ({ orders: res.orders ?? [] }),
    []
  );

  const orders = result?.orders ?? [];

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

  const handleToggle = (item: AnyOrderDTO) => {
    const isOpen = item.status === 'open';
    const re = isOpen ? 'reclose' : 'reopen';
    Alert.alert(
      isOpen ? 'Cerrar O.S.' : 'Reabrir O.S.',
      `¿${isOpen ? 'Cerrar' : 'Reabrir'} la O.S. ${item.folio_display}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isOpen ? 'Cerrar' : 'Reabrir',
          onPress: async () => {
            setTogglingId(item.id);
            try {
              const res = await toggleOrderStatus(item.folio, item.id_airport, re);
              if (res.ok) {
                reload();
              } else {
                Alert.alert('No se pudo actualizar', res.error ?? 'Intenta de nuevo.');
              }
            } catch (e) {
              Alert.alert('Sin conexión', 'No se pudo actualizar. Intenta de nuevo.');
            } finally {
              setTogglingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Editar O.S.</Text>
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

        {/* Buscar pasajero por nombre y abrir su O.S. para editarla (fijo arriba) */}
        <PaxSearchBox
          compact
          estado="all"
          onPick={(item) => navigation.navigate('EditarOrden', { folio: item.folio, idAirport: item.id_airport, folioDisplay: item.os })}
        />

        <PruebaToggle hidden={orders.filter((o) => o.es_prueba).length} show={verPruebas} onToggle={() => setVerPruebas((v) => !v)} />

        {isLoading ? (
          <Loading style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(o) => String(o.id)}
            contentContainerStyle={styles.listContent}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={7}
            initialNumToRender={10}
            ListHeaderComponent={
              offlineSince ? (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
                  <Text style={styles.offlineBannerText}>
                    Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}. Necesitas internet para
                    editar.
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
            renderItem={({ item }) => {
              const st = statusInfo(item.status);
              const isOpen = item.status === 'open';
              return (
                <View style={[styles.card, p.shadowCard]}>
                  <View style={styles.cardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <Text style={styles.folioText}>#{item.folio_display}</Text>
                    {item.es_prueba ? <PruebaBadge /> : null}
                  </View>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={styles.rows}>
                    <View style={styles.rowItem}>
                      <Ionicons name="airplane-outline" size={13} color={p.textMuted} />
                      <Text style={styles.rowText}>{item.airline}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, styles.editBtn]}
                      onPress={() =>
                        navigation.navigate('EditarOrden', {
                          folio: item.folio,
                          idAirport: item.id_airport,
                          folioDisplay: item.folio_display,
                        })
                      }
                    >
                      <Ionicons name="create-outline" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Editar</Text>
                    </Pressable>
                    {item.status !== 'cancel' && (
                      <Pressable
                        style={[styles.actionBtn, isOpen ? styles.closeBtn : styles.reopenBtn]}
                        onPress={() => handleToggle(item)}
                        disabled={togglingId === item.id}
                      >
                        {togglingId === item.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name={isOpen ? 'lock-closed-outline' : 'lock-open-outline'} size={14} color="#fff" />
                            <Text style={styles.actionBtnText}>{isOpen ? 'Recerrar' : 'Reabrir'}</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
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
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 10 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowText: { color: p.textMuted, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 9,
  },
  editBtn: { backgroundColor: '#d97706' },
  closeBtn: { backgroundColor: '#16a34a' },
  reopenBtn: { backgroundColor: '#0891b2' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
