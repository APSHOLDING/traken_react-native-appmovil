import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { addPax, getHotelsForOrder, getOrderDetail, getOrderPax, HotelDTO } from '../api/client';
import SelectField from '../components/SelectField';
import {
  activeGroups,
  buildGroups,
  ImportGroup,
  normalize,
  parseText,
  validateGroups,
} from '../utils/importarLista';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportarLista'>;

/**
 * Importar lista de pasajeros pegada desde Excel/CSV -- equivalente movil
 * de op/modulos/open/importar_lista.php (exclusiva de SJD). Todo el
 * parseo/validacion es local (ver src/utils/importarLista.ts); el guardado
 * real reusa addPax() (ya en producción), una habitación a la vez, igual
 * que la web llama insertDetailOrder.php una por una.
 */
export default function ImportarListaScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, typeAirline } = route.params;
  const draftKey = `import_draft_${folio}_${idAirport}`;

  const [text, setText] = useState('');
  const [hotels, setHotels] = useState<HotelDTO[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [fSalida, setFSalida] = useState('');
  const [hora, setHora] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [groups, setGroups] = useState<ImportGroup[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBaseData = useCallback(async () => {
    const [hotelsRes, paxRes, detailRes] = await Promise.all([
      getHotelsForOrder(folio, idAirport),
      getOrderPax(folio, idAirport),
      getOrderDetail(folio, idAirport),
    ]);
    if (!hotelsRes.ok) throw new Error(hotelsRes.error ?? 'No se pudo cargar la información.');
    setHotels(hotelsRes.hotels ?? []);
    setExistingNames(new Set((paxRes.items ?? []).map((p) => normalize(p.name))));
    if (detailRes.ok && detailRes.order) {
      setFSalida((detailRes.order.date_out ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      setHora((detailRes.order.hour ?? '12:00').slice(0, 5));
    }
    return hotelsRes.hotels ?? [];
  }, [folio, idAirport]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await loadBaseData();
        const draft = await AsyncStorage.getItem(draftKey);
        if (draft) setText(draft);
      } catch (e) {
        setLoadError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si había un borrador guardado, arma la vista previa apenas termina de cargar.
  useEffect(() => {
    if (!isLoading && text.trim()) revisar(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const revisar = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setGroups(null);
        setParseError(null);
        return;
      }
      const r = parseText(value);
      if ('error' in r) {
        setGroups(null);
        setParseError(r.error);
        return;
      }
      const built = buildGroups(r.rows, hotels);
      validateGroups(built, hotels, existingNames);
      setGroups(built);
      setParseError(null);
    },
    [hotels, existingNames]
  );

  const onChangeText = (value: string) => {
    setText(value);
    AsyncStorage.setItem(draftKey, value).catch(() => {});
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => revisar(value), 600);
  };

  const handlePaste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (!clip) {
      Alert.alert('Portapapeles vacío', 'Copia las celdas de Excel (Ctrl+C) y vuelve a intentar.');
      return;
    }
    onChangeText(clip);
  };

  const handlePickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/vnd.ms-excel'],
    });
    if (res.canceled) return;
    try {
      const file = new File(res.assets[0].uri);
      const content = await file.text();
      onChangeText(content.replace(/^﻿/, ''));
    } catch (e) {
      Alert.alert(
        'No se pudo leer el archivo',
        'Usa un archivo CSV o TXT. Si tienes un .xlsx, copia las celdas (Ctrl+C) y pégalas, o guárdalo como CSV.'
      );
    }
  };

  const handleClear = () => {
    if (!text.trim()) return;
    Alert.alert('Borrar lo pegado', '¿Borrar lo pegado y la vista previa? Lo ya guardado en la orden no se toca.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          setText('');
          setGroups(null);
          setParseError(null);
          AsyncStorage.removeItem(draftKey).catch(() => {});
        },
      },
    ]);
  };

  const handleTemplate = async () => {
    try {
      const ejemploHotel = hotels[0]?.name.trim() ?? 'Nombre del hotel';
      const csv = [
        'Habitacion,Hotel,Nombre,Tipo,Edad,Voucher,Ocupacion',
        `1,${ejemploHotel},Juan Perez,Adulto,,V12345,DBL`,
        `1,${ejemploHotel},Maria Perez,Adulto,,V12345,DBL`,
        `2,${ejemploHotel},Carlos Lopez,Adulto,,V54321,SGL`,
        `3,${ejemploHotel},Ana Diaz,Nino,8,,TPL`,
      ].join('\n');
      const file = new File(Paths.cache, `plantilla_${folio}.csv`);
      if (file.exists) file.delete();
      file.create();
      await file.write(csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Plantilla de lista' });
      }
    } catch (e) {
      Alert.alert('No se pudo generar la plantilla', 'Intenta de nuevo.');
    }
  };

  const updateGroup = (key: string, patch: Partial<ImportGroup>) => {
    setGroups((prev) => {
      if (!prev) return prev;
      const next = prev.map((g) => (g.key === key ? { ...g, ...patch } : g));
      validateGroups(next, hotels, existingNames);
      return [...next];
    });
  };

  const active = groups ? activeGroups(groups) : [];
  const canLoad = !!groups && active.length > 0 && active.every((g) => g.errors.length === 0) && !isSaving;

  const handleLoad = () => {
    if (!canLoad || !groups) return;
    Alert.alert('Cargar lista', `¿Cargar ${active.length} habitación(es) a la O.S.?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cargar', onPress: doLoad },
    ]);
  };

  const doLoad = async () => {
    if (!groups) return;
    setIsSaving(true);
    setProgress('Comprobando que nada haya cambiado…');

    let freshHotels: HotelDTO[];
    try {
      freshHotels = await loadBaseData();
    } catch (e) {
      setIsSaving(false);
      setProgress('');
      Alert.alert('Sin conexión', 'No se pudo comprobar disponibilidad. Intenta de nuevo.');
      return;
    }

    // Trabaja sobre una copia local (no depende del estado reactivo) para que
    // el guardado secuencial no se pierda entre renders.
    const working = groups.map((g) => ({ ...g, pax: g.pax.map((p) => ({ ...p })) }));
    validateGroups(working, freshHotels, existingNames);
    setGroups(working);

    const lista = activeGroups(working);
    if (!lista.length || lista.some((g) => g.errors.length > 0)) {
      setIsSaving(false);
      setProgress('⚠ La orden cambió mientras revisabas. Revisa lo marcado y vuelve a tocar Cargar.');
      return;
    }

    let ok = 0;
    let paxGuardados = 0;

    for (let i = 0; i < lista.length; i++) {
      const g = lista[i];
      if (!g.hotel) break;
      setProgress(`Guardando habitación ${i + 1} de ${lista.length}… no cierres esta pantalla.`);
      try {
        const res = await addPax({
          id_order: folio,
          id_airport: idAirport,
          id_hotel: g.hotel.id,
          type_airline: typeAirline,
          ocupation: g.oc,
          passengers: g.pax.map((p) => ({
            name: p.nombre,
            voucher: p.voucher || '',
            f_salida: fSalida,
            hora,
            type: (p.t || 'adulto') as 'adulto' | 'nino' | 'infante',
            chek: 0,
            age_c: p.t === 'nino' ? p.e ?? 0 : 0,
            age_i: p.t === 'infante' ? p.e ?? 0 : 0,
            breakfast: 0,
            lunch: 0,
            dinner: 0,
          })),
        });
        if (res.ok && res.status === 'exito') {
          g.done = true;
          ok++;
          paxGuardados += g.pax.length;
          setGroups(working.map((x) => (x.key === g.key ? { ...x, done: true } : x)));
        } else {
          const msg =
            res.status === 'dispo' ? 'ya no hay habitaciones disponibles en ese hotel' : res.error ?? res.msg ?? 'el servidor no confirmó el guardado';
          setIsSaving(false);
          setProgress(
            `⚠ Se detuvo en la habitación ${i + 1} de ${lista.length}: ${msg}. Las anteriores (${ok}) quedaron guardadas. Corrige y toca "Continuar": no se repetirán.`
          );
          return;
        }
      } catch (e) {
        setIsSaving(false);
        setProgress(
          `⚠ Se cortó la conexión en la habitación ${i + 1} de ${lista.length}. Las anteriores (${ok}) quedaron guardadas. Toca "Continuar" cuando regrese el internet: no se duplica.`
        );
        return;
      }
    }

    setIsSaving(false);
    setProgress(`✅ Listo: ${ok} habitación(es) y ${paxGuardados} pasajero(s) guardados.`);
    setText('');
    await AsyncStorage.removeItem(draftKey).catch(() => {});
  };

  if (isLoading) {
    return (
      <LinearGradient colors={p.bg} style={styles.flex}>
        <StatusBar style={p.isDark ? 'light' : 'dark'} />
        <SafeAreaView style={styles.flex}>
          <ActivityIndicator color={p.accentText} style={{ marginTop: 60 }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Importar lista</Text>
            <Text style={styles.topSub}>#{folioDisplay}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        {loadError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.hint}>
                Pega la lista de Excel o elige tu archivo. Las habitaciones se arman solas y antes de guardar ves cómo
                quedó. Hasta tocar "Cargar" no se guarda nada.
              </Text>

              <TextInput
                value={text}
                onChangeText={onChangeText}
                placeholder={'Pega aquí las celdas de Excel\no elige tu archivo abajo'}
                placeholderTextColor={p.placeholder}
                style={styles.textarea}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.actionsRow}>
                <Pressable style={styles.actionBtn} onPress={handlePaste}>
                  <Ionicons name="clipboard-outline" size={14} color={p.onAccent} />
                  <Text style={styles.actionBtnText}>Pegar</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={handlePickFile}>
                  <Ionicons name="document-outline" size={14} color={p.isDark ? '#0f172a' : p.text} />
                  <Text style={styles.actionBtnGhostText}>Elegir archivo</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={handleTemplate}>
                  <Ionicons name="download-outline" size={14} color={p.isDark ? '#0f172a' : p.text} />
                  <Text style={styles.actionBtnGhostText}>Plantilla</Text>
                </Pressable>
                {text.length > 0 && (
                  <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={handleClear}>
                    <Ionicons name="trash-outline" size={14} color={p.isDark ? '#0f172a' : p.text} />
                    <Text style={styles.actionBtnGhostText}>Limpiar</Text>
                  </Pressable>
                )}
              </View>

              {parseError && (
                <View style={styles.msgBox}>
                  <Text style={styles.msgErrorText}>⚠ {parseError}</Text>
                </View>
              )}

              {groups && (
                <View style={styles.previewWrap}>
                  <Text style={styles.summaryText}>
                    {active.length} habitación(es) por cargar ·{' '}
                    {active.reduce((acc, g) => acc + g.pax.length, 0)} pasajero(s)
                    {groups.some((g) => g.skip) ? ' · algunos ya estaban en la orden (se omiten)' : ''}
                  </Text>

                  {groups.map((g, idx) => (
                    <View key={g.key} style={[styles.roomCard, g.errors.length > 0 && styles.roomCardError]}>
                      <Text style={styles.roomTitle}>
                        Habitación {idx + 1}
                        {g.done ? ' · ✅ guardada' : g.skip ? ' · ya está en la orden' : ''}
                      </Text>
                      <Text style={styles.roomPax}>
                        {g.pax
                          .map((p) => p.nombre + (p.t === 'nino' ? ` (niño ${p.e ?? '?'})` : p.t === 'infante' ? ' (infante)' : ''))
                          .join(' · ')}
                      </Text>

                      {g.skip && !g.done && (
                        <Pressable style={styles.forceRow} onPress={() => updateGroup(g.key, { force: !g.force })}>
                          <Ionicons
                            name={g.force ? 'checkbox' : 'square-outline'}
                            size={16}
                            color={p.accentText}
                          />
                          <Text style={styles.forceText}>Cargar de todos modos</Text>
                        </Pressable>
                      )}

                      {!g.done && !g.skip && (
                        <>
                          <View style={styles.roomFieldsRow}>
                            <View style={styles.roomFieldItem}>
                              <SelectField
                                label="¿Hotel?"
                                placeholder="¿Hotel?"
                                options={hotels.map((h) => ({ id: h.id, label: `${h.name.trim()} (${h.rooms_dis} disp.)` }))}
                                selectedId={g.hid}
                                onSelect={(id) => updateGroup(g.key, { hid: id, htxt: hotels.find((h) => h.id === id)?.name ?? g.htxt })}
                              />
                            </View>
                          </View>
                          <View style={styles.occRow}>
                            {['SGL', 'DBL', 'TPL', 'CDPL'].map((op) => (
                              <Pressable
                                key={op}
                                style={[styles.occChip, g.oc === op && styles.occChipActive]}
                                onPress={() => updateGroup(g.key, { oc: op, octxt: op, ocAuto: false })}
                              >
                                <Text style={[styles.occChipText, g.oc === op && styles.occChipTextActive]}>{op}</Text>
                              </Pressable>
                            ))}
                            {g.ocAuto && g.oc ? <Text style={styles.autoNote}>ocupación automática</Text> : null}
                          </View>

                          {g.errors.map((e, i) => (
                            <Text key={i} style={styles.errorLine}>
                              {e}
                            </Text>
                          ))}
                          {g.warnings.map((w, i) => (
                            <Text key={i} style={styles.warnLine}>
                              ℹ {w}
                            </Text>
                          ))}
                        </>
                      )}
                    </View>
                  ))}

                  <Pressable style={[styles.loadBtn, !canLoad && styles.loadBtnDisabled]} onPress={handleLoad} disabled={!canLoad}>
                    {isSaving ? (
                      <ActivityIndicator color={p.onAccent} />
                    ) : (
                      <Text style={styles.loadBtnText}>
                        {groups.some((g) => g.done) ? `Continuar con las ${active.length} que faltan` : `Cargar ${active.length} habitación(es)`}
                      </Text>
                    )}
                  </Pressable>
                  {progress ? <Text style={styles.progressText}>{progress}</Text> : null}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
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
  content: { padding: 16, paddingBottom: 40 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  hint: { color: p.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  textarea: {
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    padding: 12,
    minHeight: 130,
    color: p.text,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: p.accent,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  actionBtnGhost: { backgroundColor: p.isDark ? '#f1f5f9' : p.card, borderWidth: p.isDark ? 0 : 1, borderColor: p.cardBorder },
  actionBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12 },
  actionBtnGhostText: { color: p.isDark ? '#0f172a' : p.text, fontWeight: '800', fontSize: 12 },
  msgBox: { marginTop: 12 },
  msgErrorText: { color: p.dangerText, fontSize: 12.5, lineHeight: 18 },
  previewWrap: { marginTop: 16 },
  summaryText: { color: p.text, fontWeight: '800', fontSize: 13, marginBottom: 10 },
  roomCard: {
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    borderRadius: radii.card,
    padding: 12,
    marginBottom: 10,
  },
  roomCardError: { borderColor: p.dangerBorder },
  roomTitle: { color: p.text, fontWeight: '800', fontSize: 13 },
  roomPax: { color: p.textMuted, fontSize: 12, marginTop: 5, lineHeight: 17 },
  forceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  forceText: { color: p.accentText, fontSize: 12, fontWeight: '700' },
  roomFieldsRow: { marginTop: 10 },
  roomFieldItem: { flex: 1 },
  occRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  occChip: {
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.inputBg,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  occChipActive: { backgroundColor: p.accent, borderColor: p.accent },
  occChipText: { color: p.text, fontSize: 11.5, fontWeight: '700' },
  occChipTextActive: { color: p.onAccent },
  autoNote: { color: p.textMuted, fontSize: 10.5, fontStyle: 'italic' },
  errorLine: { color: p.dangerText, fontSize: 11.5, marginTop: 7, lineHeight: 16 },
  warnLine: { color: p.warnText, fontSize: 11.5, marginTop: 5, lineHeight: 16 },
  loadBtn: {
    backgroundColor: p.accent,
    borderRadius: radii.button,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  loadBtnDisabled: { opacity: 0.5 },
  loadBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 14 },
  progressText: { color: p.textMuted, fontSize: 12, marginTop: 10, lineHeight: 17 },
});
