import React, { useCallback, useEffect, useState } from 'react';
import Loading from '../components/Loading';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import ImageViewer from '../components/ImageViewer';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getOrderDetail, getOrderFiles, OrderFileDTO, uploadOrderFiles } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import { resizeForUpload } from '../utils/imageResize';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'DetalleOrden'>;

/**
 * Equivalente movil de op/modulos/details/details.php: info general de la
 * O.S. + desglose de pasajeros por hotel y habitacion, con quien la
 * registro. Solo lectura.
 */
export default function DetalleOrdenScreen({ route, navigation }: Props) {
  const p = useTheme();
  const th = p;
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const {
    data,
    isLoading,
    error,
    offlineSince,
    reload,
  } = useOfflineLoad(
    `order_detail_${folio}_${idAirport}`,
    () => getOrderDetail(folio, idAirport),
    (res) => ({ order: res.order!, hotelesPax: res.hoteles_pax ?? [] }),
    [folio, idAirport]
  );

  const [files, setFiles] = useState<OrderFileDTO[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  // Visor de fotos: indice de la foto abierta (null = cerrado). Se puede deslizar entre todas sin cerrar.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const imageFiles = files.filter((f) => f.type === 'image');

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const res = await getOrderFiles(folio, idAirport);
      if (res.ok) setFiles(res.files ?? []);
    } catch (e) {
      // Silencioso: los comprobantes son un extra dentro de esta pantalla,
      // no bloquea ver el resto del detalle si no hay señal.
    } finally {
      setIsLoadingFiles(false);
    }
  }, [folio, idAirport]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const doUpload = async (picked: { uri: string; name: string; mimeType: string }[]) => {
    if (picked.length === 0) return;
    setIsUploading(true);
    try {
      const res = await uploadOrderFiles(folio, idAirport, picked);
      if (res.ok) {
        if (res.rechazados && res.rechazados.length > 0) {
          Alert.alert('Algunos archivos no se subieron', 'Solo se aceptan imágenes o PDF: ' + res.rechazados.join(', '));
        }
        await loadFiles();
      } else {
        Alert.alert('No se pudo subir', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo subir el archivo. Intenta de nuevo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso necesario', 'Activa el permiso de cámara.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    const uri = await resizeForUpload(a.uri, a.width, a.height);
    await doUpload([{ uri, name: a.fileName ?? `foto_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' }]);
  };

  const handlePickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso necesario', 'Activa el permiso de galería.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
    if (res.canceled) return;
    const files = await Promise.all(
      res.assets.map(async (a, i) => ({
        uri: await resizeForUpload(a.uri, a.width, a.height),
        name: a.fileName ?? `foto_${Date.now()}_${i}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
      }))
    );
    await doUpload(files);
  };

  const handlePickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true });
    if (res.canceled) return;
    await doUpload(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' })));
  };

  const handleAddFile = () => {
    Alert.alert('Agregar comprobante', '¿Qué quieres subir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tomar foto', onPress: handleTakePhoto },
      { text: 'Elegir de galería', onPress: handlePickImages },
      { text: 'Elegir PDF', onPress: handlePickPdf },
    ]);
  };

  const totalRooms = (data?.hotelesPax ?? []).reduce((a, h) => a + h.rooms.length, 0);
  const totalPax = (data?.hotelesPax ?? []).reduce((a, h) => a + h.rooms.reduce((b, r) => b + r.pax.length, 0), 0);
  const statusLabel = (st: string) => {
    const x = String(st).toLowerCase();
    return x === 'open' ? 'Abierta' : x === 'cancel' ? 'Cancelada' : 'Cerrada';
  };

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <Text style={styles.topTitle}>#{folioDisplay}</Text>
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
                  Sin conexión: mostrando lo guardado el {formatSavedAt(offlineSince)}.
                </Text>
              </View>
            )}

            <LinearGradient colors={[p.accent, p.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroTop}>
                <Text style={styles.heroFolio}>#{folioDisplay}</Text>
                <View style={styles.heroStatus}>
                  <Text style={styles.heroStatusText}>{statusLabel(data.order.status)}</Text>
                </View>
              </View>
              <Text style={styles.heroSub} numberOfLines={1}>
                {data.order.airline}
                {data.order.flight ? ` · ${data.order.flight}` : ''}
              </Text>
              <Text style={styles.heroSub}>
                {data.order.date_in ?? '—'}
                {data.order.date_out ? `  →  ${data.order.date_out}` : ''}
              </Text>
              <View style={styles.heroChips}>
                <View style={styles.heroChip}>
                  <Ionicons name="business" size={12} color="#fff" />
                  <Text style={styles.heroChipText}>{data.hotelesPax.length} hotel(es)</Text>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="bed" size={12} color="#fff" />
                  <Text style={styles.heroChipText}>{totalRooms} hab.</Text>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="people" size={12} color="#fff" />
                  <Text style={styles.heroChipText}>{totalPax} pax</Text>
                </View>
                <View style={styles.heroChip}>
                  <Ionicons name="images" size={12} color="#fff" />
                  <Text style={styles.heroChipText}>{files.length} archivo(s)</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={[styles.card, p.shadowCard]}>
              <InfoRow label="Aerolínea" value={data.order.airline} />
              <InfoRow label="Vuelo" value={data.order.flight ?? '—'} />
              <InfoRow label="Evento" value={data.order.event_name ?? '—'} />
              <InfoRow label="Estado" value={data.order.status} />
              <InfoRow label="Fecha entrada" value={data.order.date_in ?? '—'} />
              <InfoRow label="Fecha salida" value={data.order.date_out ?? '—'} />
              <InfoRow label="Hoteles" value={data.order.hotels.join(', ') || '—'} last />
            </View>

            <Text style={styles.sectionTitle}>Pasajeros por hotel</Text>
            {data.hotelesPax.length === 0 ? (
              <Text style={styles.emptyText}>No hay pasajeros registrados en esta O.S.</Text>
            ) : (
              data.hotelesPax.map((h, hi) => (
                <View key={hi} style={[styles.card, p.shadowCard]}>
                  <Text style={styles.hotelName}>{h.hotel_name}</Text>
                  <Text style={styles.hotelCount}>
                    {h.rooms.length} hab. · {h.rooms.reduce((a, r) => a + r.pax.length, 0)} pax
                  </Text>
                  {h.rooms.map((r, ri) => (
                    <View key={ri} style={styles.roomBlock}>
                      <View style={styles.roomHead}>
                        <Text style={styles.roomLabel}>Habitación {ri + 1}</Text>
                        {r.updated_by && <Text style={styles.roomUpdatedBy}>Por {r.updated_by}</Text>}
                      </View>
                      {r.pax.map((p) => (
                        <View key={p.id} style={styles.paxRow}>
                          <Ionicons name="person-outline" size={13} color={th.textMuted} />
                          <Text style={styles.paxName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.paxType}>{p.type}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))
            )}

            <View style={styles.filesHeader}>
              <Text style={styles.sectionTitle}>Comprobantes</Text>
              <Pressable style={styles.addFileBtn} onPress={handleAddFile} disabled={isUploading}>
                {isUploading ? (
                  <ActivityIndicator color={p.onAccent} size="small" />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color={p.onAccent} />
                    <Text style={styles.addFileBtnText}>Subir</Text>
                  </>
                )}
              </Pressable>
            </View>

            {imageFiles.length > 0 ? (
              <Text style={styles.filesHint}>
                👆 Toca una foto para verla en grande. Pellizca para acercar, doble toque para zoom y desliza a los lados para ver las demás sin cerrar.
              </Text>
            ) : null}

            {isLoadingFiles ? (
              <Loading style={{ marginVertical: 16 }} />
            ) : files.length === 0 ? (
              <Text style={styles.emptyText}>No hay comprobantes subidos para esta O.S.</Text>
            ) : (
              <View style={styles.filesGrid}>
                {files.map((f) => (
                  <Pressable
                    key={f.name}
                    style={styles.fileThumb}
                    onPress={() => (f.type === 'image' ? setViewerIndex(Math.max(0, imageFiles.findIndex((x) => x.url === f.url))) : Linking.openURL(f.url))}
                  >
                    {f.type === 'image' ? (
                      <>
                        <Image source={{ uri: f.url }} style={styles.fileThumbImg} resizeMode="cover" />
                        <View style={styles.zoomBadge}>
                          <Ionicons name="expand" size={11} color="#fff" />
                        </View>
                      </>
                    ) : (
                      <View style={styles.filePdfBox}>
                        <Ionicons name="document-text-outline" size={26} color={p.accentText} />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <ImageViewer
        visible={viewerIndex !== null}
        images={imageFiles.map((f, i) => ({ url: f.url, title: f.name || `Foto ${i + 1}` }))}
        startIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </LinearGradient>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
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
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 14,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: p.cardBorder },
  infoLabel: { color: p.textMuted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { color: p.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  sectionTitle: {
    color: p.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  hotelName: { color: p.accentText, fontWeight: '800', fontSize: 13.5, marginBottom: 10 },
  roomBlock: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: p.cardBorder },
  roomHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  roomLabel: { color: p.text, fontWeight: '700', fontSize: 12 },
  roomUpdatedBy: { color: p.textMuted, fontSize: 10.5 },
  paxRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  paxName: { color: p.text, fontSize: 12, flex: 1 },
  paxType: { color: p.textMuted, fontSize: 10.5, textTransform: 'uppercase' },
  hero: { borderRadius: radii.card, padding: 16, marginBottom: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroFolio: { color: '#fff', fontSize: 20, fontWeight: '900' },
  heroStatus: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  heroStatusText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  heroChipText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  hotelCount: { color: p.textMuted, fontSize: 11.5, marginBottom: 4 },
  zoomBadge: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 3 },
  filesHint: { color: p.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  filesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: p.accent,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addFileBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12 },
  filesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fileThumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
  },
  fileThumbImg: { width: '100%', height: '100%' },
  filePdfBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '80%' },
  previewClose: { position: 'absolute', top: 50, right: 20 },
});
