import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { getQrHistory, QrHistoryItem } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QrHistList'>;

/**
 * Historial de QR -- equivalente movil de op/modulos/qrHist/inicio.php: por
 * cada O.S., cuando se genero el QR de pre-registro, cuantos pasajeros se
 * registraron y que grupos/QR ya fueron cerrados por el pasajero. Solo
 * lectura; toca una O.S. para ver el detalle.
 */
export default function QrHistListScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');

  const { data, isLoading, error, offlineSince, reload } = useOfflineLoad(
    'qr_history_list',
    getQrHistory,
    (res) => res.items ?? [],
    []
  );

  const items = data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? items.filter((it) => `${it.folio_display} ${it.iata} ${it.flight ?? ''}`.toLowerCase().includes(q))
        : items,
    [items, q]
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
            <Text style={styles.topTitle}>Historial de QR</Text>
            <Text style={styles.topSub}>{items.length} O.S. con actividad</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.introBox}>
          <Text style={styles.introText}>
            Aquí ves, por cada O.S., cuándo se generó el QR de pre-registro, cuántos pasajeros se registraron,
            los grupos (un QR compartido) y qué QR ya fueron cerrados por el pasajero. Solo lectura.
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por folio, estación o vuelo..."
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => `${it.folio}-${it.id_airport}`}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              offlineSince ? (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={16} color="#fde68a" />
                  <Text style={styles.offlineBannerText}>
                    Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="qr-code-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'Todavía no hay actividad de QR.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, shadow.card]}
                onPress={() =>
                  navigation.navigate('QrHistDetail', {
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
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
                <Text style={styles.cardSub}>
                  {item.date_in ?? ''}
                  {item.flight ? ` · Vuelo ${item.flight.trim()}` : ''}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, styles.badgeQr]}>
                    <Text style={styles.badgeText}>QR generado {item.generado}x</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.regs} registros</Text>
                  </View>
                  {item.grupos > 0 ? (
                    <View style={[styles.badge, styles.badgeGroup]}>
                      <Text style={styles.badgeText}>
                        {item.grupos} grupo{item.grupos === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ) : null}
                  {item.cerrados > 0 ? (
                    <View style={[styles.badge, styles.badgeClosed]}>
                      <Text style={styles.badgeText}>
                        {item.cerrados} cerrado{item.cerrados === 1 ? '' : 's'}
                      </Text>
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
  introBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    padding: 13,
  },
  introText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
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
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: '#06322f', fontWeight: '800', fontSize: 13 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  offlineBannerText: { color: '#fde68a', fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
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
  cardSub: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeQr: { backgroundColor: 'rgba(37,99,235,0.22)' },
  badgeGroup: { backgroundColor: 'rgba(43,183,179,0.22)' },
  badgeClosed: { backgroundColor: 'rgba(220,38,38,0.22)' },
  badgeText: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
});
