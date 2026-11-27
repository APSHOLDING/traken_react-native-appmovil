import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getPreregOrders, PreregOrderListItem } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PreregOrdersList'>;

/**
 * Pre-registro de Pax -- equivalente movil de op/modulos/prereg/inicio.php
 * (lista). Toca una O.S. para ver sus pasajeros pre-registrados.
 */
const PASOS = [
  { t: 'Elige la O.S.', d: 'Toca abajo la O.S. de tu vuelo.' },
  { t: 'Muéstrale el QR', d: 'Al pasajero (o cópialo y envíalo). Su familia usa el mismo QR.' },
  { t: 'Él se registra', d: 'Desde su celular; tú no capturas nada y no se duplican.' },
  { t: 'Tú asignas el hotel', d: 'En “Por asignar” le pones su hotel; él lo ve en su celular.' },
];

export default function PreregOrdersListScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showIntro, setShowIntro] = useState(true);
  const [orders, setOrders] = useState<PreregOrderListItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getPreregOrders();
      if (res.ok) {
        setOrders(res.orders ?? []);
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
      q
        ? orders.filter((o) => `${o.folio_display} ${o.iata} ${o.flight ?? ''}`.toLowerCase().includes(q))
        : orders,
    [orders, q]
  );

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Pre-registro de Pax</Text>
            <Text style={styles.topSub}>{orders.length} O.S. con actividad</Text>
          </View>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('PreregScan')} hitSlop={10}>
            <Ionicons name="scan-outline" size={20} color={p.text} />
          </Pressable>
        </View>

        <View style={styles.introBox}>
          <Pressable style={styles.introHead} onPress={() => setShowIntro((v) => !v)}>
            <Ionicons name="help-circle" size={20} color={p.accentText} />
            <Text style={styles.introTitle}>¿Cómo funciona? En 4 pasos</Text>
            <Ionicons name={showIntro ? 'chevron-up' : 'chevron-down'} size={18} color={p.textMuted} />
          </Pressable>
          {showIntro && (
            <>
              {PASOS.map((x, i) => (
                <View key={i} style={styles.introStep}>
                  <View style={styles.introNum}>
                    <Text style={styles.introNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.introStepTitle}>{x.t}</Text>
                    <Text style={styles.introText}>{x.d}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.introMore}>
                📱 Cuando el pasajero llegue: en O.S Abiertos toca “Escanear pasajero” para ver su hotel y mandarlo al registro.
              </Text>
            </>
          )}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={p.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por folio, estación o vuelo..."
            placeholderTextColor={p.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={p.accentText} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
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
            keyExtractor={(o) => `${o.folio}-${o.id_airport}`}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={28} color={p.textMuted} />
                <Text style={styles.emptyText}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'No tienes O.S. abiertas este año.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, p.shadowCard]}
                onPress={() =>
                  navigation.navigate('PreregOrderDetail', {
                    folio: item.folio,
                    idAirport: item.id_airport,
                    folioDisplay: item.folio_display,
                  })
                }
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardFolio}>
                    O.S. {item.folio_display} · {item.iata}
                  </Text>
                  {item.pendientes > 0 ? (
                    <View style={styles.pendBadge}>
                      <Text style={styles.pendBadgeText}>{item.pendientes} por asignar</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardSub}>
                  {item.date_in ?? ''}
                  {item.flight ? ` · Vuelo ${item.flight.trim()}` : ''}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.total} pre-registrados</Text>
                  </View>
                  {typeof item.capturados === 'number' ? (
                    <View style={[styles.badge, item.capturados > 0 && styles.badgeOk]}>
                      <Text style={styles.badgeText}>{item.capturados} en la O.S.</Text>
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
  introBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 13,
  },
  introText: { color: p.textMuted, fontSize: 12, lineHeight: 17 },
  introHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introTitle: { flex: 1, color: p.text, fontSize: 13.5, fontWeight: '800' },
  introStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  introNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: p.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  introNumText: { color: p.onAccent, fontSize: 11.5, fontWeight: '900' },
  introStepTitle: { color: p.text, fontSize: 12.5, fontWeight: '800' },
  introMore: { color: p.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 12 },
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
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardFolio: { color: p.text, fontWeight: '800', fontSize: 13.5, flexShrink: 1 },
  pendBadge: { backgroundColor: p.dangerSoft, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  pendBadgeText: { color: p.dangerText, fontSize: 10.5, fontWeight: '800' },
  cardSub: { color: p.textMuted, fontSize: 11.5, marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { backgroundColor: p.cardStrong, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeOk: { backgroundColor: p.okSoft },
  badgeText: { color: p.text, fontSize: 10.5, fontWeight: '800' },
});
