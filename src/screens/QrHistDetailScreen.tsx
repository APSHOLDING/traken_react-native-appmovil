import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
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
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const { data, isLoading, error, offlineSince, reload } = useOfflineLoad(
    `qr_history_detail_${folio}_${idAirport}`,
    () => getQrHistoryDetail(folio, idAirport),
    (res) => ({ events: res.events ?? [], groups: res.groups ?? [] }),
    [folio, idAirport]
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
            <Text style={styles.topTitle}>O.S. {folioDisplay}</Text>
            <Text style={styles.topSub}>Historial de QR</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        {isLoading ? (
          <ActivityIndicator color={p.accentText} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {offlineSince ? (
              <View style={styles.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
                <Text style={styles.offlineBannerText}>
                  Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Grupos (un QR usado por varias personas)</Text>
            {(data?.groups ?? []).length === 0 ? (
              <Text style={styles.emptyText}>Sin grupos todavía.</Text>
            ) : (
              <View style={[styles.card, p.shadowCard]}>
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
                        <Ionicons name="lock-closed" size={11} color={p.dangerText} />
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
              <View style={[styles.card, p.shadowCard]}>
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
  content: { paddingHorizontal: 16, paddingBottom: 40 },
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
    marginBottom: 14,
  },
  offlineBannerText: { color: p.warnText, fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  sectionTitle: { color: p.text, fontSize: 13.5, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  emptyText: { color: p.textMuted, fontSize: 12.5, marginBottom: 18 },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
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
  rowBorder: { borderTopWidth: 1, borderTopColor: p.divider },
  rowLeft: { flex: 1 },
  rowTitle: { color: p.text, fontSize: 12.5, fontWeight: '700' },
  rowSub: { color: p.textMuted, fontSize: 11, marginTop: 2 },
  rowDate: { color: p.textMuted, fontSize: 11 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusOpen: { backgroundColor: p.okSoft },
  statusOpenText: { color: p.okText, fontSize: 10.5, fontWeight: '800' },
  statusClosed: { backgroundColor: p.dangerSoft },
  statusClosedText: { color: p.dangerText, fontSize: 10, fontWeight: '800' },
});
