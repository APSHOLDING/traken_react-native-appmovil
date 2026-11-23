import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { getQrHistoryDetail, QrEventDTO, QrEventKind, QrGroupDTO } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QrHistDetail'>;

const EVENT_LABELS: Record<string, string> = {
  os_generado: 'QR de la O.S. generado',
  grupo_unido: 'Se unió a un grupo',
  grupo_cerrado: 'QR cerrado por el pasajero',
  grupo_reabierto: 'QR reactivado por el pasajero',
};

function eventLabel(kind: QrEventKind): string {
  return EVENT_LABELS[kind] ?? kind;
}

function fmt(dt: string | null): string {
  if (!dt) return '';
  return String(dt).slice(0, 16);
}

export default function QrHistDetailScreen({ route, navigation }: Props) {
  const { folio, idAirport, folioDisplay } = route.params;

  const { data, isLoading, error, offlineSince, reload } = useOfflineLoad(
    `qr_history_detail_${folio}_${idAirport}`,
    () => getQrHistoryDetail(folio, idAirport),
    (res) => ({ events: res.events ?? [], groups: res.groups ?? [] }),
    [folio, idAirport]
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
            <Text style={styles.topTitle}>O.S. {folioDisplay}</Text>
            <Text style={styles.topSub}>Historial de QR</Text>
          </View>
          <View style={styles.backBtn} />
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
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {offlineSince ? (
              <View style={styles.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color="#fde68a" />
                <Text style={styles.offlineBannerText}>
                  Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Grupos (un QR usado por varias personas)</Text>
            {(data?.groups ?? []).length === 0 ? (
              <Text style={styles.emptyText}>Sin grupos todavía.</Text>
            ) : (
              <View style={[styles.card, shadow.card]}>
                {data!.groups.map((g: QrGroupDTO, i: number) => (
                  <View key={g.code} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle}>{g.name}</Text>
                      <Text style={styles.rowSub}>
                        código {g.code} · {g.miembros} persona{g.miembros === 1 ? '' : 's'} registrada{g.miembros === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {g.closed ? (
                      <View style={[styles.statusPill, styles.statusClosed]}>
                        <Ionicons name="lock-closed" size={11} color="#991b1b" />
                        <Text style={styles.statusClosedText}>Cerrado {fmt(g.closed)}</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusPill, styles.statusOpen]}>
                        <Text style={styles.statusOpenText}>Abierto</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Bitácora</Text>
            {(data?.events ?? []).length === 0 ? (
              <Text style={styles.emptyText}>Sin eventos.</Text>
            ) : (
              <View style={[styles.card, shadow.card]}>
                {data!.events.map((e: QrEventDTO, i: number) => (
                  <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle}>{eventLabel(e.kind)}</Text>
                      {e.who ? <Text style={styles.rowSub}>{e.who}</Text> : null}
                    </View>
                    <Text style={styles.rowDate}>{fmt(e.created_at)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
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
  content: { paddingHorizontal: 16, paddingBottom: 40 },
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
    marginBottom: 14,
  },
  offlineBannerText: { color: '#fde68a', fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  sectionTitle: { color: colors.white, fontSize: 13.5, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  emptyText: { color: colors.textMuted, fontSize: 12.5, marginBottom: 18 },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 4,
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rowLeft: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  rowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 11 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusOpen: { backgroundColor: 'rgba(22,163,74,0.2)' },
  statusOpenText: { color: '#4ade80', fontSize: 10.5, fontWeight: '800' },
  statusClosed: { backgroundColor: 'rgba(220,38,38,0.2)' },
  statusClosedText: { color: '#fca5a5', fontSize: 10, fontWeight: '800' },
});
