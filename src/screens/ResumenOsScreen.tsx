import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { getResumenOs, ResumenOsHotel } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ResumenOs'>;

const TYPE_STYLE = {
  A: { bg: 'rgba(14,165,233,0.22)', fg: '#7dd3fc', label: 'Adulto' },
  N: { bg: 'rgba(245,158,11,0.22)', fg: '#fcd34d', label: 'Niño' },
  I: { bg: 'rgba(236,72,153,0.22)', fg: '#f9a8d4', label: 'Infante' },
} as const;

/**
 * "Resumen de Hab. y Pax" de una O.S. -- equivalente movil de
 * op/modulos/reports/resumen_os.php (solo consulta): habitaciones y
 * pasajeros (adultos / ninos / infantes) por hotel, con quien esta en cada
 * habitacion. Datos de op/api/reports/resumenOs.php.
 */
export default function ResumenOsScreen({ route, navigation }: Props) {
  const { folio, idAirport, folioDisplay } = route.params;

  const { data, isLoading, error, offlineSince, reload } = useOfflineLoad(
    `resumen_os_${folio}_${idAirport}`,
    () => getResumenOs(folio, idAirport),
    (res) => ({
      airline: res.airline ?? '',
      flight: res.flight ?? '',
      totals: res.totals ?? { rooms: 0, pax: 0, adults: 0, children: 0, infants: 0 },
      hotels: res.hotels ?? [],
    }),
    [folio, idAirport]
  );

  const kpis = data
    ? [
        { label: 'Habitaciones', value: data.totals.rooms },
        { label: 'Pax total', value: data.totals.pax },
        { label: 'Adultos', value: data.totals.adults },
        { label: 'Niños', value: data.totals.children },
        { label: 'Infantes', value: data.totals.infants },
      ]
    : [];

  return (
    <LinearGradient colors={gradients.hero} style={styles.flex}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Resumen hab. y pax</Text>
            <Text style={styles.topSub}>O.S. {folioDisplay}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 40 }} />
        ) : error || !data ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error ?? 'No se pudo cargar.'}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {offlineSince && (
              <View style={styles.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color="#fde68a" />
                <Text style={styles.offlineBannerText}>
                  Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                </Text>
              </View>
            )}

            {(!!data.airline || !!data.flight) && (
              <Text style={styles.subLine}>
                {data.airline}
                {data.flight ? ` · Vuelo ${String(data.flight).trim()}` : ''}
              </Text>
            )}

            <View style={styles.kpiRow}>
              {kpis.map((k) => (
                <View key={k.label} style={styles.kpi}>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                </View>
              ))}
            </View>

            {data.hotels.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="bed-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>Esta O.S. todavía no tiene habitaciones registradas.</Text>
              </View>
            ) : (
              (data.hotels as ResumenOsHotel[]).map((h) => <HotelBlock key={h.id_hotel} hotel={h} />)
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function HotelBlock({ hotel }: { hotel: ResumenOsHotel }) {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={[styles.card, shadow.card]}>
      <Pressable style={styles.cardHead} onPress={() => setOpen((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hotelName} numberOfLines={2}>
            {hotel.name}
          </Text>
          <Text style={styles.hotelSub}>
            {hotel.rooms} hab. · {hotel.pax} pax · A {hotel.adults} · N {hotel.children} · I {hotel.infants}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open &&
        hotel.habs.map((hab, i) => (
          <View key={i} style={styles.hab}>
            <Text style={styles.habTitle}>Habitación {i + 1}</Text>
            {hab.pax.length === 0 ? (
              <Text style={styles.habEmpty}>Sin pasajeros</Text>
            ) : (
              <View style={styles.paxWrap}>
                {hab.pax.map((p, j) => {
                  const t = TYPE_STYLE[p.type] ?? TYPE_STYLE.A;
                  return (
                    <View key={j} style={[styles.paxPill, { backgroundColor: t.bg }]}>
                      <Text style={[styles.paxText, { color: t.fg }]}>
                        {p.name}
                        {p.extended ? ' ⏱' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ))}
    </View>
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
  content: { paddingHorizontal: 16, paddingBottom: 30, gap: 10 },
  subLine: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    paddingVertical: 12,
    alignItems: 'center',
  },
  kpiValue: { color: colors.white, fontSize: 20, fontWeight: '800' },
  kpiLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  hotelName: { color: colors.white, fontWeight: '800', fontSize: 14 },
  hotelSub: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
  hab: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  habTitle: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  habEmpty: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  paxWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  paxPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  paxText: { fontSize: 12, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: '#06322f', fontWeight: '800', fontSize: 13 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.16)',
    borderRadius: 10,
    padding: 10,
  },
  offlineBannerText: { color: '#fde68a', fontSize: 12, flex: 1 },
});
