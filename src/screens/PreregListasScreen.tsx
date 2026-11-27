import React, { useCallback, useEffect, useState } from 'react';
import Loading from '../components/Loading';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getPreregBatches, importPreregBatch, PreregBatchItem, uploadPreregList } from '../api/client';
import { resizeForUpload } from '../utils/imageResize';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'PreregListas'>;

/**
 * Listas de aerolínea (portal /aerolinea) + subida de lista con IA --
 * equivalente móvil de las acciones batches/import/upload_list de
 * op/modulos/prereg/api.php. A diferencia del resto de prereg, esta
 * pantalla no se recarga sola: el usuario regresa a PreregOrderDetail
 * cuando termina, y esa pantalla se refresca sola al volver a tener foco.
 */
export default function PreregListasScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const [batches, setBatches] = useState<PreregBatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyBatchId, setBusyBatchId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getPreregBatches(folio, idAirport);
      if (res.ok) {
        setBatches(res.batches ?? []);
      } else {
        setError(res.error ?? 'No se pudo cargar la información.');
      }
    } catch (e) {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [folio, idAirport]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = async (batch: PreregBatchItem) => {
    setBusyBatchId(batch.id);
    try {
      const res = await importPreregBatch(folio, idAirport, batch.id);
      if (res.ok) {
        Alert.alert(
          'Lista importada',
          `${res.nuevos ?? 0} pasajero(s) nuevo(s) pre-registrados.` +
            (res.omitidos ? ` ${res.omitidos} se omitieron (ya estaban registrados).` : '')
        );
        await load();
      } else {
        Alert.alert('No se pudo importar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo importar. Intenta de nuevo.');
    } finally {
      setBusyBatchId(null);
    }
  };

  const doUpload = async (file: { uri: string; name: string; mimeType: string }) => {
    setIsUploading(true);
    try {
      const res = await uploadPreregList(folio, idAirport, file);
      if (res.ok) {
        Alert.alert(
          'Lista leída',
          `La IA leyó ${res.leidos ?? 0} pasajero(s): ${res.nuevos ?? 0} nuevo(s) pre-registrados` +
            (res.omitidos ? `, ${res.omitidos} omitido(s) (ya estaban registrados).` : '.')
        );
        await load();
      } else {
        Alert.alert('No se pudo leer la lista', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo subir la lista. Revisa tu internet e intenta de nuevo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Activa el permiso de cámara.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    const uri = await resizeForUpload(a.uri, a.width, a.height);
    await doUpload({ uri, name: a.fileName ?? `lista_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Activa el permiso de galería.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const a = res.assets[0];
    const uri = await resizeForUpload(a.uri, a.width, a.height);
    await doUpload({ uri, name: a.fileName ?? `lista_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const handlePickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (res.canceled) return;
    const a = res.assets[0];
    await doUpload({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' });
  };

  const handleAddList = () => {
    Alert.alert('Subir lista de pasajeros', '¿Qué quieres subir? La IA la leerá automáticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tomar foto', onPress: handleTakePhoto },
      { text: 'Elegir de galería', onPress: handlePickImage },
      { text: 'Elegir PDF', onPress: handlePickPdf },
    ]);
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
            <Text style={styles.topTitle}>O.S. {folioDisplay}</Text>
            <Text style={styles.topSub}>Listas de aerolínea</Text>
          </View>
          <BrandMark />
        </View>

        <View style={styles.introBox}>
          <Text style={styles.introText}>
            Importa listas que ya subió la aerolínea en su portal, o sube tú una foto o PDF de una lista (manifiesto,
            rooming list) para que la IA la lea y pre-registre a todos en esta O.S. automáticamente. Nunca duplica a
            quien ya esté registrado.
          </Text>
        </View>

        <Pressable style={[styles.uploadBtn, p.shadowCard]} onPress={handleAddList} disabled={isUploading}>
          <Ionicons name="sparkles-outline" size={18} color={p.onAccent} />
          <Text style={styles.uploadBtnText}>Subir lista (foto o PDF) con IA</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Listas del portal de aerolínea</Text>

        {isLoading ? (
          <Loading style={{ marginTop: 30 }} />
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
            data={batches}
            keyExtractor={(b) => String(b.id)}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="document-outline" size={28} color={p.textMuted} />
                <Text style={styles.emptyText}>
                  No hay listas subidas por la aerolínea para la estación de esta O.S.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isBusy = busyBatchId === item.id;
              const pendientes = item.items - item.imported;
              return (
                <View style={[styles.card, p.shadowCard]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardAirline} numberOfLines={1}>
                      {item.airline}
                    </Text>
                    {item.match ? (
                      <View style={styles.matchBadge}>
                        <Text style={styles.matchBadgeText}>Vuelo coincide</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardSub}>
                    {item.date} {item.flight ? `· Vuelo ${item.flight.trim()}` : ''}
                  </Text>
                  <Text style={styles.cardCounts}>
                    {item.items} pasajero(s) en la lista
                    {item.imported > 0 ? ` · ${item.imported} ya importado(s)` : ''}
                  </Text>
                  <Pressable
                    style={[styles.importBtn, pendientes <= 0 && styles.importBtnDone]}
                    onPress={() => handleImport(item)}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={p.onAccent} size="small" />
                    ) : (
                      <Text style={styles.importBtnText}>
                        {pendientes <= 0 ? 'Volver a importar' : `Importar ${pendientes} pendiente(s)`}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        <Modal visible={isUploading} transparent animationType="fade">
          <View style={styles.uploadOverlay}>
            <View style={[styles.uploadCard, p.shadowCard]}>
              <ActivityIndicator color={p.accentText} size="large" />
              <Text style={styles.uploadCardTitle}>La IA está leyendo tu lista...</Text>
              <Text style={styles.uploadCardText}>Puede tardar hasta 2 minutos. No cierres la app.</Text>
            </View>
          </View>
        </Modal>
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
    marginBottom: 12,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 13,
  },
  introText: { color: p.textMuted, fontSize: 12, lineHeight: 17 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: p.accent,
    borderRadius: radii.button,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  uploadBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 14 },
  sectionTitle: { color: p.text, fontWeight: '800', fontSize: 13.5, marginHorizontal: 16, marginBottom: 8 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 50, gap: 8 },
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
  cardAirline: { color: p.text, fontWeight: '800', fontSize: 13.5, flexShrink: 1 },
  matchBadge: { backgroundColor: p.okSoft, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  matchBadgeText: { color: p.okText, fontSize: 10, fontWeight: '800' },
  cardSub: { color: p.textMuted, fontSize: 11.5, marginTop: 3 },
  cardCounts: { color: p.textMuted, fontSize: 11.5, marginTop: 6 },
  importBtn: {
    marginTop: 10,
    backgroundColor: p.accent,
    borderRadius: radii.button,
    paddingVertical: 10,
    alignItems: 'center',
  },
  importBtnDone: { backgroundColor: p.isDark ? 'rgba(255,255,255,0.12)' : p.textFaint },
  importBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12.5 },
  uploadOverlay: {
    flex: 1,
    backgroundColor: p.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  uploadCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: p.modalBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  uploadCardTitle: { color: p.text, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  uploadCardText: { color: p.textMuted, fontSize: 12, textAlign: 'center' },
});
