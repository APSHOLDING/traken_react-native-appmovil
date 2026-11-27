import React, { useCallback, useState } from 'react';
import Loading from '../components/Loading';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
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
import {
  FirmaLinksResponse,
  getFirmaLinks,
  getReportDownloadUrl,
  getReportList,
  ReportHotel,
  sendReportByEmail,
} from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'ReportePicker'>;

/**
 * Equivalente movil de op/modulos/reports/report.php: un reporte (Excel)
 * por hotel + uno General, cada uno con Descargar y Enviar por correo.
 */
export default function ReportePickerScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const [email, setEmail] = useState('');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [firma, setFirma] = useState<FirmaLinksResponse | null>(null);
  const [firmaLoading, setFirmaLoading] = useState(false);

  const {
    data,
    isLoading,
    error,
    offlineSince,
    reload,
  } = useOfflineLoad(
    `report_list_${folio}_${idAirport}`,
    () => getReportList(folio, idAirport),
    (res) => ({
      script: res.script ?? 'paxes',
      hotels: res.hotels ?? [],
      totalGeneral: res.total_general ?? 0,
      downloadPathGeneral: res.download_path_general ?? '',
    }),
    [folio, idAirport]
  );

  const handleDownload = useCallback(
    async (idHotel: number, label: string, downloadPath: string, firmaMode = false) => {
      if (!data || !downloadPath) return;
      const key = (firmaMode ? 'f' : '') + String(idHotel);
      setDownloadingKey(key);
      setMsg(null);
      try {
        const fileName = `Reporte${firmaMode ? '-PARA-FIRMAR' : ''}-${folioDisplay.replace(/[^A-Za-z0-9-]/g, '')}-${label.replace(/[^A-Za-z0-9]/g, '')}.xlsx`;
        const destination = new File(Paths.cache, fileName);
        if (destination.exists) destination.delete();

        const task = File.createDownloadTask(getReportDownloadUrl(downloadPath), destination);
        const downloaded = await task.downloadAsync();

        if (!downloaded || !downloaded.exists || downloaded.size === 0) {
          throw new Error('empty-download');
        }

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloaded.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Reporte de pasajeros',
          });
        } else {
          Alert.alert('Descargado', 'El reporte se guardó, pero este dispositivo no puede compartirlo/abrirlo directo.');
        }
      } catch (e) {
        Alert.alert(
          'No se pudo descargar',
          'Si no te deja descargar en este dispositivo, escribe un correo abajo y usa "Enviar" en su lugar.'
        );
      } finally {
        setDownloadingKey(null);
      }
    },
    [data, folioDisplay]
  );

  const handleLoadFirma = useCallback(async () => {
    setFirmaLoading(true);
    setMsg(null);
    try {
      const res = await getFirmaLinks(folio, idAirport);
      if (res.ok) setFirma(res);
      else setMsg({ ok: false, text: res.error ?? 'No se pudo preparar el reporte para firmar.' });
    } catch (e: any) {
      setMsg({
        ok: false,
        text:
          e?.response?.status === 404
            ? 'El reporte "Para firmar" aún no está disponible en este servidor.'
            : (e?.userMessage ?? 'Sin conexión. Intenta de nuevo.'),
      });
    } finally {
      setFirmaLoading(false);
    }
  }, [folio, idAirport]);

  const handleSend = useCallback(
    async (idHotel: number) => {
      if (!data) return;
      const trimmed = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setMsg({ ok: false, text: 'Escribe un correo válido arriba para enviar el reporte.' });
        return;
      }
      const key = String(idHotel);
      setSendingKey(key);
      setMsg(null);
      try {
        const res = await sendReportByEmail({
          id_order: folio,
          id_hotel: idHotel,
          id_airport: idAirport,
          email: trimmed,
          script: data.script,
        });
        setMsg({ ok: !!res.ok, text: res.msg ?? res.error ?? 'Respuesta inesperada.' });
      } catch (e) {
        setMsg({ ok: false, text: 'Error de conexión al enviar. Puede tardar unos segundos, intenta de nuevo.' });
      } finally {
        setSendingKey(null);
      }
    },
    [data, email, folio, idAirport]
  );

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <Text style={styles.topTitle}>Reporte #{folioDisplay}</Text>
          <BrandMark />
        </View>

        {isLoading ? (
          <Loading style={{ marginTop: 40 }} />
        ) : error || !data ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{error ?? 'No se pudo cargar.'}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {offlineSince && (
              <View style={styles.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
                <Text style={styles.offlineBannerText}>
                  Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}. Necesitas internet para
                  descargar o enviar.
                </Text>
              </View>
            )}

            <View style={styles.mailBox}>
              <Text style={styles.mailLabel}>Enviar reporte por correo</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={p.placeholder}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.mailHint}>
                Si no te deja descargar directo, escribe tu correo aquí y usa "Enviar" en cada reporte. Te llega el
                Excel por enlace.
              </Text>
            </View>

            {(data.hotels as ReportHotel[]).map((h) => (
              <ReportCard
                key={h.id_hotel}
                title={h.name}
                pax={h.total_pax}
                isDownloading={downloadingKey === String(h.id_hotel)}
                isSending={sendingKey === String(h.id_hotel)}
                onDownload={() => handleDownload(h.id_hotel, h.name, h.download_path)}
                onSend={() => handleSend(h.id_hotel)}
              />
            ))}

            <ReportCard
              title="GENERAL (todos)"
              pax={data.totalGeneral}
              general
              isDownloading={downloadingKey === '0'}
              isSending={sendingKey === '0'}
              onDownload={() => handleDownload(0, 'GENERAL', data.downloadPathGeneral)}
              onSend={() => handleSend(0)}
            />

            <View style={[styles.card, p.shadowCard, { marginTop: 4 }]}>
              <Text style={styles.cardTitle}>Lista PARA FIRMAR</Text>
              <Text style={styles.mailHint}>
                El mismo reporte con una columna roja "FIRMA PAX", para que el hotel lo imprima y los pasajeros firmen.
              </Text>
              {!firma ? (
                <Pressable
                  style={[styles.actionBtn, styles.downloadBtn, { marginTop: 10 }]}
                  onPress={handleLoadFirma}
                  disabled={firmaLoading}
                >
                  {firmaLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="create-outline" size={15} color="#fff" />
                      <Text style={styles.actionBtnText}>Preparar lista para firmar</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {(firma.hotels ?? []).map((h) => (
                    <Pressable
                      key={h.id_hotel}
                      style={[styles.actionBtn, styles.downloadBtn]}
                      onPress={() => handleDownload(h.id_hotel, h.name, h.download_path, true)}
                      disabled={downloadingKey === 'f' + h.id_hotel}
                    >
                      <Ionicons name="download-outline" size={15} color="#fff" />
                      <Text style={styles.actionBtnText} numberOfLines={1}>
                        {downloadingKey === 'f' + h.id_hotel ? 'Descargando…' : `${h.name} (${h.total_pax} pax)`}
                      </Text>
                    </Pressable>
                  ))}
                  {!!firma.download_path_general && (
                    <Pressable
                      style={[styles.actionBtn, styles.downloadBtn]}
                      onPress={() => handleDownload(0, 'GENERAL', firma.download_path_general!, true)}
                      disabled={downloadingKey === 'f0'}
                    >
                      <Ionicons name="download-outline" size={15} color="#fff" />
                      <Text style={styles.actionBtnText}>
                        {downloadingKey === 'f0' ? 'Descargando…' : `★ GENERAL (${firma.total_general ?? 0} pax)`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            <Pressable
              style={[styles.card, p.shadowCard, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
              onPress={() => navigation.navigate('ResumenOs', { folio, idAirport, folioDisplay })}
            >
              <Ionicons name="bed-outline" size={20} color={p.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Resumen de hab. y pax</Text>
                <Text style={styles.mailHint}>Habitaciones, adultos, niños e infantes por hotel.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={p.textMuted} />
            </Pressable>

            {msg && (
              <View style={[styles.msgBox, { backgroundColor: msg.ok ? '#dcfce7' : '#fee2e2' }]}>
                <Text style={{ color: msg.ok ? '#166534' : '#991b1b', fontWeight: '700', fontSize: 12.5 }}>
                  {msg.text}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function ReportCard({
  title,
  pax,
  general,
  isDownloading,
  isSending,
  onDownload,
  onSend,
}: {
  title: string;
  pax: number;
  general?: boolean;
  isDownloading: boolean;
  isSending: boolean;
  onDownload: () => void;
  onSend: () => void;
}) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, p.shadowCard, general && styles.cardGeneral]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, general && styles.cardTitleGeneral]} numberOfLines={1}>
          {general ? '★ ' : ''}{title}
        </Text>
        <View style={[styles.countBadge, general && styles.countBadgeGeneral]}>
          <Text style={[styles.countText, general && styles.countTextGeneral]}>{pax} pax</Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.downloadBtn]} onPress={onDownload} disabled={isDownloading}>
          {isDownloading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="download-outline" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Descargar</Text>
            </>
          )}
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.sendBtn]} onPress={onSend} disabled={isSending}>
          {isSending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="mail-outline" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Enviar</Text>
            </>
          )}
        </Pressable>
      </View>
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
  mailBox: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 16,
  },
  mailLabel: {
    color: p.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    color: p.text,
    fontSize: 14,
  },
  mailHint: { color: p.textMuted, fontSize: 10.5, marginTop: 8, lineHeight: 15 },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 13,
    marginBottom: 10,
  },
  cardGeneral: { backgroundColor: p.isDark ? '#2b3f86' : p.accent, borderColor: p.isDark ? '#2b3f86' : p.accent },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  cardTitle: { color: p.text, fontWeight: '700', fontSize: 13, flexShrink: 1 },
  cardTitleGeneral: { fontWeight: '800', color: '#ffffff' },
  countBadge: { backgroundColor: p.accentSoft, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  countBadgeGeneral: { backgroundColor: 'rgba(255,255,255,0.18)' },
  countText: { color: p.accentText, fontSize: 10.5, fontWeight: '800' },
  countTextGeneral: { color: '#fff' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 9,
  },
  downloadBtn: { backgroundColor: '#16a34a' },
  sendBtn: { backgroundColor: '#0891b2' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  msgBox: { borderRadius: 10, padding: 10, marginTop: 4, alignItems: 'center' },
});
