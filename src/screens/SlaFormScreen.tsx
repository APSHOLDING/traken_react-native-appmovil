import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getCache, saveCache } from '../utils/offlineCache';
import { addSlaComentario, getSlaState, saveSlaPaso, setSlaModalidad, SlaPasoItem, SlaStateResponse } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'SlaForm'>;

const MODALIDADES: { key: string; label: string }[] = [
  { key: 'concentrado', label: 'Concentrado' },
  { key: 'progresivo', label: 'Progresivo' },
  { key: 'mixto', label: 'Mixto' },
];

// Semaforo con significado propio: en oscuro los colores de siempre; en claro tonos mas oscuros para contraste.
function semaforoColor(sem: string | null | undefined, th: ThemeTokens): string {
  if (sem === 'verde') return th.isDark ? th.ok : th.okText;
  if (sem === 'amarillo') return th.isDark ? th.warn : th.warnText;
  if (sem === 'rojo') return th.isDark ? th.danger : th.dangerText;
  return th.textMuted;
}

function semaforoBg(sem: string | null | undefined, th: ThemeTokens): string {
  if (!th.isDark) {
    if (sem === 'verde') return th.okSoft;
    if (sem === 'amarillo') return th.warnSoft;
    if (sem === 'rojo') return th.dangerSoft;
  }
  return semaforoColor(sem, th) + '33';
}

function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toHHmm(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function parseHHmm(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/**
 * SLA de Operaciones -- equivalente movil de op/modulos/sla/form.php.
 * El semaforo, las reglas y la conversion de zona horaria SIEMPRE vienen
 * del backend (ver op/include/sla_lib.php) -- esta pantalla nunca calcula
 * nada de eso localmente, solo pinta lo que regresa el servidor.
 */
export default function SlaFormScreen({ route, navigation }: Props) {
  const th = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const [state, setState] = useState<SlaStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [manualPaso, setManualPaso] = useState<number | null>(null);
  const [manualDate, setManualDate] = useState(toISODate(new Date()));
  const [manualHour, setManualHour] = useState(toHHmm(new Date()));
  const [manualNota, setManualNota] = useState('');
  const [activePicker, setActivePicker] = useState<'date' | 'hour' | null>(null);

  const [modalidadNotaFor, setModalidadNotaFor] = useState<string | null>(null);
  const [modalidadNota, setModalidadNota] = useState('');

  const [comentarioText, setComentarioText] = useState('');
  const [savedOffline, setSavedOffline] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSlaState(folio, idAirport);
      if (res.ok) {
        setState(res);
        setSavedOffline(null);
        saveCache(`sla_state_${folio}_${idAirport}`, res).catch(() => {});
      } else {
        setError(res.error ?? 'No se pudo cargar el SLA.');
      }
    } catch (e) {
      const cached = await getCache<SlaStateResponse>(`sla_state_${folio}_${idAirport}`);
      if (cached) {
        setState(cached.data);
        setSavedOffline(cached.savedAt);
      } else {
        setError('Sin conexión y sin datos guardados de este SLA todavía.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [folio, idAirport]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAhora = async (paso: number) => {
    setIsSaving(true);
    try {
      const res = await saveSlaPaso({ folio, ap: idAirport, paso, modo: 'ahora', device_ms: Date.now() });
      if (res.ok) {
        setState(res);
        const saved = res.pasos?.find((p) => p.paso === paso);
        if (saved?.drift !== null && saved?.drift !== undefined && Math.abs(saved.drift) > 120) {
          Alert.alert(
            'Reloj del teléfono desfasado',
            `Tu teléfono tiene ${Math.round(Math.abs(saved.drift) / 60)} min de diferencia con el servidor. Se guardó la hora del servidor (correcta), esto es solo un aviso.`
          );
        }
      } else {
        Alert.alert('No se pudo guardar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Para registrar tiempos del SLA se necesita internet: la hora oficial la pone el servidor. Lo que ves es lo último guardado; inténtalo cuando haya señal.');
    } finally {
      setIsSaving(false);
    }
  };

  const openManual = (paso: number) => {
    setManualPaso(paso);
    setManualDate(toISODate(new Date()));
    setManualHour(toHHmm(new Date()));
    setManualNota('');
  };

  const confirmManual = async () => {
    if (manualPaso === null) return;
    if (manualNota.trim().length < 3) {
      Alert.alert('Falta el motivo', 'Escribe el motivo de la corrección (mínimo 3 letras).');
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveSlaPaso({
        folio,
        ap: idAirport,
        paso: manualPaso,
        modo: 'manual',
        local: `${manualDate} ${manualHour}`,
        nota: manualNota.trim(),
        device_ms: Date.now(),
      });
      if (res.ok) {
        setState(res);
        setManualPaso(null);
      } else {
        Alert.alert('No se pudo guardar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Para registrar tiempos del SLA se necesita internet: la hora oficial la pone el servidor. Lo que ves es lo último guardado; inténtalo cuando haya señal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = activePicker;
    if (Platform.OS === 'android') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (target === 'date') setManualDate(toISODate(selected));
    else if (target === 'hour') setManualHour(toHHmm(selected));
  };

  const handleModalidadPress = (mod: string) => {
    if (!state?.config || mod === state.config.modalidad) return;
    setModalidadNotaFor(mod);
    setModalidadNota('');
  };

  const confirmModalidad = async () => {
    if (!modalidadNotaFor) return;
    if (modalidadNota.trim().length < 3) {
      Alert.alert('Falta el motivo', 'Escribe el motivo del cambio (mínimo 3 letras).');
      return;
    }
    setIsSaving(true);
    try {
      const res = await setSlaModalidad(folio, idAirport, modalidadNotaFor, modalidadNota.trim());
      if (res.ok) {
        setState(res);
        setModalidadNotaFor(null);
      } else {
        Alert.alert('No se pudo guardar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Para registrar tiempos del SLA se necesita internet: la hora oficial la pone el servidor. Lo que ves es lo último guardado; inténtalo cuando haya señal.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComentario = async () => {
    if (comentarioText.trim().length < 2) return;
    setIsSaving(true);
    try {
      const res = await addSlaComentario(folio, idAirport, comentarioText.trim());
      if (res.ok) {
        setState(res);
        setComentarioText('');
      } else {
        Alert.alert('No se pudo guardar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Para registrar tiempos del SLA se necesita internet: la hora oficial la pone el servidor. Lo que ves es lo último guardado; inténtalo cuando haya señal.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LinearGradient colors={th.bg} style={styles.flex}>
      <StatusBar style={th.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={th.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>O.S. {folioDisplay}</Text>
            <Text style={styles.topSub}>SLA de Operaciones</Text>
          </View>
          <BrandMark />
        </View>

        {isLoading ? (
          <ActivityIndicator color={th.accentText} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={th.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : state?.grupo === 'noaplica' ? (
          <View style={styles.errorBox}>
            <Ionicons name="information-circle-outline" size={22} color={th.textMuted} />
            <Text style={styles.errorText}>Este motivo de operación no necesita SLA.</Text>
          </View>
        ) : (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {savedOffline ? (
                <View style={styles.pruebaBanner}>
                  <Text style={styles.pruebaBannerText}>📴 Sin conexión: se muestra lo guardado. Para registrar tiempos necesitas internet.</Text>
                </View>
              ) : null}
              {state?.prueba ? (
                <View style={styles.pruebaBanner}>
                  <Text style={styles.pruebaBannerText}>🧪 Esta O.S. está marcada como PRUEBA: no cuenta en el SLA.</Text>
                </View>
              ) : null}

              <View style={[styles.summaryCard, th.shadowCard]}>
                <View style={styles.summaryTop}>
                  <Text style={styles.summaryEvento}>{state?.os?.evento ?? '—'}</Text>
                  {state?.semaforo ? (
                    <View style={[styles.semPill, { backgroundColor: semaforoBg(state.semaforo, th) }]}>
                      <View style={[styles.semDot, { backgroundColor: semaforoColor(state.semaforo, th) }]} />
                      <Text style={[styles.semPillText, { color: semaforoColor(state.semaforo, th) }]}>
                        {state.semaforo.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.summarySub}>
                  {state?.os?.aerolinea}
                  {state?.os?.vuelo ? ` · Vuelo ${state.os.vuelo.trim()}` : ''} · {state?.os?.fecha?.slice(0, 10)}
                </Text>
                {state?.minutos_sla !== null && state?.minutos_sla !== undefined ? (
                  <Text style={styles.summaryMinutos}>{state.minutos_sla} min (Contacto 1° pax → Salida última unidad)</Text>
                ) : state?.en_curso ? (
                  <Text style={styles.summaryMinutos}>⏱ En curso desde el Contacto 1° pax</Text>
                ) : null}
                {state?.sin_cierre ? (
                  <Text style={styles.sinCierreText}>⛔ Sin cierre: pasaron más de 24h sin registrar la Salida de la última unidad.</Text>
                ) : null}
                {state?.sin_regla ? <Text style={styles.sinReglaText}>{state.sin_regla}</Text> : null}
                {state?.regla ? (
                  <Text style={styles.reglaText}>
                    Regla: {state.regla.min !== null ? `verde ≤${state.regla.min}min, ` : ''}rojo &gt;{state.regla.max}min ·{' '}
                    {state.regla.pax_min}-{state.regla.pax_max} pax
                  </Text>
                ) : null}
              </View>

              <Text style={styles.sectionTitle}>Modalidad</Text>
              <View style={styles.chipRow}>
                {MODALIDADES.map((m) => (
                  <Pressable
                    key={m.key}
                    style={[styles.chip, state?.config?.modalidad === m.key && styles.chipActive]}
                    onPress={() => handleModalidadPress(m.key)}
                    disabled={isSaving || state?.cerrada}
                  >
                    <Text style={[styles.chipText, state?.config?.modalidad === m.key && styles.chipTextActive]}>
                      {m.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.configInfo}>
                Temporada: {state?.config?.temporada === 'alta' ? 'Alta' : 'Regular'} (automática) · {state?.config?.pax ?? 0} pax
                (de la O.S.)
              </Text>

              <Text style={styles.sectionTitle}>Tiempos registrados</Text>
              {state?.pasos?.map((p: SlaPasoItem) => (
                <View key={p.paso} style={[styles.pasoCard, th.shadowCard, p.tipo === 'sla' && styles.pasoCardSla]}>
                  <View style={styles.pasoTop}>
                    <Text style={styles.pasoNombre}>
                      {p.paso}. {p.nombre}
                    </Text>
                    {p.tipo === 'sla' ? (
                      <View style={styles.pasoSlaBadge}>
                        <Text style={styles.pasoSlaBadgeText}>SLA</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.pasoAyuda}>{p.ayuda}</Text>
                  {p.hecho ? (
                    <View style={styles.pasoHechoRow}>
                      <Ionicons name="checkmark-circle" size={16} color={th.okText} />
                      <Text style={styles.pasoHora}>
                        {p.hora} ({p.fecha}) {p.origen === 'manual' ? '· manual' : '· ahora'}
                      </Text>
                    </View>
                  ) : state?.cerrada ? (
                    <Text style={styles.pasoPendienteText}>Sin registrar (O.S. cerrada)</Text>
                  ) : (
                    <View style={styles.pasoActions}>
                      <Pressable
                        style={[styles.pasoBtn, styles.pasoBtnAhora]}
                        onPress={() => handleAhora(p.paso)}
                        disabled={isSaving}
                      >
                        <Ionicons name="time" size={14} color={th.onAccent} />
                        <Text style={styles.pasoBtnAhoraText}>Ahora</Text>
                      </Pressable>
                      <Pressable style={[styles.pasoBtn, styles.pasoBtnManual]} onPress={() => openManual(p.paso)} disabled={isSaving}>
                        <Ionicons name="create-outline" size={14} color={th.text} />
                        <Text style={styles.pasoBtnManualText}>Hora manual</Text>
                      </Pressable>
                    </View>
                  )}
                  {p.hecho && p.nota ? <Text style={styles.pasoNota}>Nota: {p.nota}</Text> : null}
                </View>
              ))}

              <Text style={styles.sectionTitle}>Comentarios</Text>
              <View style={[styles.card, th.shadowCard]}>
                {(state?.comentarios ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>Sin comentarios todavía.</Text>
                ) : (
                  state!.comentarios!.map((c, i) => (
                    <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <Text style={styles.comentarioTexto}>{c.texto}</Text>
                      {(c.por || c.hora) && <Text style={styles.comentarioMeta}>{c.por}{c.hora ? ` · ${c.hora}` : ''}</Text>}
                    </View>
                  ))
                )}
              </View>
              {!state?.cerrada && (
                <View style={styles.addComentarioRow}>
                  <TextInput
                    value={comentarioText}
                    onChangeText={setComentarioText}
                    placeholder="Agregar comentario..."
                    placeholderTextColor={th.placeholder}
                    style={styles.addComentarioInput}
                    multiline
                  />
                  <Pressable style={styles.addComentarioBtn} onPress={handleAddComentario} disabled={isSaving}>
                    <Ionicons name="send" size={16} color={th.onAccent} />
                  </Pressable>
                </View>
              )}

              <Text style={styles.sectionTitle}>Bitácora</Text>
              <View style={[styles.card, th.shadowCard]}>
                {(state?.bitacora ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>Sin eventos.</Text>
                ) : (
                  state!.bitacora!.map((b, i) => (
                    <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <View style={styles.rowLeft}>
                        <Text style={styles.bitacoraAccion}>
                          {b.accion}
                          {b.paso ? ` · paso ${b.paso}` : ''}
                        </Text>
                        {!!b.nota && <Text style={styles.bitacoraNota}>{b.nota}</Text>}
                        {!!b.por && <Text style={styles.bitacoraPor}>{b.por}</Text>}
                      </View>
                      <Text style={styles.bitacoraFecha}>{b.created_at?.slice(0, 16)}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* Modal: hora manual */}
        <Modal visible={manualPaso !== null} transparent animationType="fade" onRequestClose={() => setManualPaso(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, th.shadowCard]}>
              <Text style={styles.modalTitle}>Hora manual</Text>
              <Text style={styles.modalSub}>
                {manualPaso !== null ? state?.pasos?.find((p) => p.paso === manualPaso)?.nombre : ''}
              </Text>

              <Pressable style={styles.pickerField} onPress={() => setActivePicker('date')}>
                <Ionicons name="calendar-outline" size={16} color={th.accentText} />
                <Text style={styles.pickerFieldText}>{manualDate}</Text>
              </Pressable>
              <Pressable style={styles.pickerField} onPress={() => setActivePicker('hour')}>
                <Ionicons name="time-outline" size={16} color={th.accentText} />
                <Text style={styles.pickerFieldText}>{manualHour} hrs.</Text>
              </Pressable>

              {activePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={activePicker === 'hour' ? parseHHmm(manualHour) : parseISODate(manualDate)}
                  mode={activePicker === 'hour' ? 'time' : 'date'}
                  is24Hour
                  display="default"
                  onChange={handlePickerChange}
                />
              )}
              {Platform.OS === 'ios' && activePicker && (
                <DateTimePicker
                  value={activePicker === 'hour' ? parseHHmm(manualHour) : parseISODate(manualDate)}
                  mode={activePicker === 'hour' ? 'time' : 'date'}
                  is24Hour
                  display="spinner"
                  onChange={handlePickerChange}
                />
              )}

              <TextInput
                value={manualNota}
                onChangeText={setManualNota}
                placeholder="Motivo de la corrección (obligatorio)..."
                placeholderTextColor={th.placeholder}
                style={styles.modalInput}
                multiline
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setManualPaso(null)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.modalConfirmBtn} onPress={confirmManual} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color={th.onAccent} /> : <Text style={styles.modalConfirmText}>Guardar</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: motivo de cambio de modalidad */}
        <Modal visible={!!modalidadNotaFor} transparent animationType="fade" onRequestClose={() => setModalidadNotaFor(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, th.shadowCard]}>
              <Text style={styles.modalTitle}>Cambiar modalidad</Text>
              <Text style={styles.modalSub}>
                {state?.config?.modalidad} → {modalidadNotaFor}
              </Text>
              <TextInput
                value={modalidadNota}
                onChangeText={setModalidadNota}
                placeholder="Motivo del cambio (obligatorio)..."
                placeholderTextColor={th.placeholder}
                style={styles.modalInput}
                multiline
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setModalidadNotaFor(null)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.modalConfirmBtn} onPress={confirmModalidad} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color={th.onAccent} /> : <Text style={styles.modalConfirmText}>Guardar</Text>}
                </Pressable>
              </View>
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
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
  pruebaBanner: {
    backgroundColor: p.warnSoft,
    borderWidth: 1,
    borderColor: p.warnBorder,
    borderRadius: radii.input,
    padding: 10,
    marginBottom: 12,
  },
  pruebaBannerText: { color: p.warnText, fontSize: 12 },
  summaryCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 16,
    marginBottom: 16,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryEvento: { color: p.text, fontSize: 15, fontWeight: '800' },
  semPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  semDot: { width: 7, height: 7, borderRadius: 4 },
  semPillText: { fontSize: 11, fontWeight: '800' },
  summarySub: { color: p.textMuted, fontSize: 12, marginTop: 4 },
  summaryMinutos: { color: p.accentText, fontSize: 13, fontWeight: '700', marginTop: 8 },
  sinCierreText: { color: p.dangerText, fontSize: 11.5, marginTop: 8 },
  sinReglaText: { color: p.textMuted, fontSize: 11.5, marginTop: 8, fontStyle: 'italic' },
  reglaText: { color: p.textMuted, fontSize: 11, marginTop: 6 },
  sectionTitle: { color: p.text, fontSize: 13.5, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipActive: { backgroundColor: p.accent, borderColor: p.accent },
  chipText: { color: p.text, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: p.onAccent },
  configInfo: { color: p.textMuted, fontSize: 11, marginBottom: 16 },
  pasoCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 13,
    marginBottom: 9,
  },
  pasoCardSla: { borderColor: p.accentBorder },
  pasoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pasoNombre: { color: p.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  pasoSlaBadge: { backgroundColor: p.accentSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pasoSlaBadgeText: { color: p.accentText, fontSize: 9.5, fontWeight: '800' },
  pasoAyuda: { color: p.textMuted, fontSize: 11, marginTop: 3, lineHeight: 15 },
  pasoHechoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pasoHora: { color: p.text, fontSize: 12.5, fontWeight: '700' },
  pasoPendienteText: { color: p.textMuted, fontSize: 11.5, marginTop: 8, fontStyle: 'italic' },
  pasoActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pasoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  pasoBtnAhora: { backgroundColor: p.accent },
  pasoBtnAhoraText: { color: p.onAccent, fontWeight: '800', fontSize: 12 },
  pasoBtnManual: { backgroundColor: p.cardStrong, borderWidth: 1, borderColor: p.cardBorder },
  pasoBtnManualText: { color: p.text, fontWeight: '700', fontSize: 12 },
  pasoNota: { color: p.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 4,
    marginBottom: 10,
  },
  emptyText: { color: p.textMuted, fontSize: 12.5, padding: 10 },
  row: { paddingVertical: 10, paddingHorizontal: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: p.divider },
  rowLeft: { flex: 1 },
  comentarioTexto: { color: p.text, fontSize: 12.5 },
  comentarioMeta: { color: p.textMuted, fontSize: 10.5, marginTop: 3 },
  addComentarioRow: { flexDirection: 'row', gap: 8, marginBottom: 16, alignItems: 'flex-end' },
  addComentarioInput: {
    flex: 1,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: p.text,
    fontSize: 13,
    maxHeight: 90,
  },
  addComentarioBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: p.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitacoraAccion: { color: p.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  bitacoraNota: { color: p.textMuted, fontSize: 11, marginTop: 2 },
  bitacoraPor: { color: p.accentText, fontSize: 10.5, marginTop: 2 },
  bitacoraFecha: { color: p.textMuted, fontSize: 10.5, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: p.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: p.modalBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 18,
  },
  modalTitle: { color: p.text, fontSize: 15, fontWeight: '800' },
  modalSub: { color: p.textMuted, fontSize: 12, marginTop: 3, marginBottom: 14 },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  pickerFieldText: { color: p.text, fontSize: 13.5 },
  modalInput: {
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: p.text,
    fontSize: 13,
    minHeight: 60,
    marginTop: 4,
    marginBottom: 14,
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: p.textMuted, fontWeight: '700', fontSize: 13 },
  modalConfirmBtn: {
    backgroundColor: p.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  modalConfirmText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
});
