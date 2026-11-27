import React, { useEffect, useMemo, useRef, useState } from 'react';
import Loading from '../components/Loading';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNetInfo } from '@react-native-community/netinfo';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import {
  getCreateOrderHotels,
  getCreateOrderOptions,
  getEditOrderInfo,
  NamedOption,
  updateOrder,
  UpdateOrderHotelInput,
} from '../api/client';
import SelectField from '../components/SelectField';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'EditarOrden'>;

type HotelRow = {
  key: string;
  id_orders_hotels?: number;
  idHotel: number | null;
  name?: string;
  dispo: string;
  isNew: boolean;
};

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function parseISODate(iso: string): Date {
  const d = new Date((iso || '').slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}
function parseHHmm(hhmm: string): Date {
  const parts = (hhmm || '').split(':');
  const d = new Date();
  d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
  return d;
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function formatDateDisplay(iso: string): string {
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Equivalente movil de op/modulos/createEdit/edit.php (unifica tambien
 * insertNewHotel.php y deleteHotel.php, que en la web son pantallas
 * separadas, en un solo guardado). Aeropuerto y aerolinea son de solo
 * lectura -- igual que en el formulario web (esos campos estan
 * deshabilitados alla tambien, no es un recorte de esta version).
 */
export default function EditarOrdenScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [iata, setIata] = useState('');
  const [airline, setAirline] = useState('');
  const [flight, setFlight] = useState('');
  const [events, setEvents] = useState<NamedOption[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [dateIn, setDateIn] = useState('');
  const [dateOut, setDateOut] = useState('');
  const [hour, setHour] = useState('');
  const [hotelRows, setHotelRows] = useState<HotelRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [hotelsCatalog, setHotelsCatalog] = useState<NamedOption[]>([]);

  const [activePicker, setActivePicker] = useState<'dateIn' | 'dateOut' | 'hour' | null>(null);

  // Lo que se cargo del servidor, para saber que cambio la persona (y avisar antes de salir sin guardar).
  const [initial, setInitial] = useState<string | null>(null);
  const [removedRows, setRemovedRows] = useState<HotelRow[]>([]);
  const savedRef = useRef(false);
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [infoRes, optionsRes, hotelsRes] = await Promise.all([
          getEditOrderInfo(folio, idAirport),
          getCreateOrderOptions(),
          getCreateOrderHotels(idAirport),
        ]);
        if (!infoRes.ok || !infoRes.order) {
          setLoadError(infoRes.error ?? 'No se pudo cargar la orden.');
          return;
        }
        setIata(infoRes.order.iata);
        setAirline(infoRes.order.airline);
        setFlight(infoRes.order.flight ?? '');
        setEventId(infoRes.order.id_event);
        setDateIn((infoRes.order.date_in ?? '').slice(0, 10));
        setDateOut((infoRes.order.date_out ?? '').slice(0, 10));
        setHour((infoRes.order.hour ?? '00:00:00').slice(0, 5));
        setHotelRows(
          (infoRes.hotels ?? []).map((h) => ({
            key: `h${h.id_orders_hotels}`,
            id_orders_hotels: h.id_orders_hotels,
            idHotel: h.id_hotel,
            name: h.name.trim(),
            dispo: String(h.rooms_dis),
            isNew: false,
          }))
        );
        setInitial(
          JSON.stringify({
            flight: (infoRes.order.flight ?? '').trim(),
            eventId: infoRes.order.id_event,
            dateIn: (infoRes.order.date_in ?? '').slice(0, 10),
            dateOut: (infoRes.order.date_out ?? '').slice(0, 10),
            hour: (infoRes.order.hour ?? '00:00:00').slice(0, 5),
            hotels: (infoRes.hotels ?? []).map((h) => [h.id_orders_hotels, String(h.rooms_dis)]),
          })
        );
        setEvents(optionsRes.ok ? optionsRes.events ?? [] : []);
        setHotelsCatalog(hotelsRes.ok ? hotelsRes.hotels ?? [] : []);
      } catch (e) {
        setLoadError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [folio, idAirport]);

  const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = activePicker;
    if (Platform.OS === 'android') setActivePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (target === 'dateIn') setDateIn(toISODate(selected));
    else if (target === 'dateOut') setDateOut(toISODate(selected));
    else if (target === 'hour') setHour(toHHmm(selected));
  };

  const addHotelRow = () => {
    setHotelRows((rows) => [...rows, { key: `new${Date.now()}`, idHotel: null, dispo: '', isNew: true }]);
  };

  const removeHotelRow = (row: HotelRow) => {
    if (!row.isNew && row.id_orders_hotels) {
      setDeletedIds((ids) => [...ids, row.id_orders_hotels!]);
    }
    setHotelRows((rows) => rows.filter((r) => r.key !== row.key));
    // Los que ya existian se pueden recuperar con "Deshacer" antes de guardar.
    if (!row.isNew) setRemovedRows((rs) => [...rs, row]);
  };

  const undoRemove = (row: HotelRow) => {
    setDeletedIds((ids) => ids.filter((x) => x !== row.id_orders_hotels));
    setRemovedRows((rs) => rs.filter((r) => r.key !== row.key));
    setHotelRows((rows) => [...rows, row]);
  };

  const bumpDispo = (key: string, delta: number) => {
    setHotelRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, dispo: String(Math.max(0, (parseInt(r.dispo, 10) || 0) + delta)) } : r))
    );
  };

  const setSalidaPlus = (days: number) => {
    const d = parseISODate(dateIn || toISODate(new Date()));
    d.setDate(d.getDate() + days);
    setDateOut(toISODate(d));
  };

  const updateHotelRow = (key: string, patch: Partial<HotelRow>) => {
    setHotelRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  // Que cambio la persona (en lenguaje normal) y que falta para poder guardar.
  const changes = useMemo(() => {
    if (!initial) return [] as string[];
    const o = JSON.parse(initial) as { flight: string; eventId: number | null; dateIn: string; dateOut: string; hour: string; hotels: [number, string][] };
    const out: string[] = [];
    if (flight.trim() !== o.flight) out.push('vuelo');
    if (eventId !== o.eventId) out.push('evento');
    if (dateIn !== o.dateIn) out.push('fecha de entrada');
    if (dateOut !== o.dateOut) out.push('fecha de salida');
    if (hour !== o.hour) out.push('hora');
    const nuevos = hotelRows.filter((r) => r.isNew).length;
    const quitados = deletedIds.length;
    const editados = hotelRows.filter((r) => !r.isNew && o.hotels.some(([id, d]) => id === r.id_orders_hotels && d !== r.dispo)).length;
    if (nuevos) out.push(nuevos === 1 ? 'un hotel nuevo' : `${nuevos} hoteles nuevos`);
    if (quitados) out.push(quitados === 1 ? 'un hotel quitado' : `${quitados} hoteles quitados`);
    if (editados) out.push('cuartos disponibles');
    return out;
  }, [initial, flight, eventId, dateIn, dateOut, hour, hotelRows, deletedIds]);
  const dirty = changes.length > 0;

  const missing: string[] = [];
  if (!flight.trim()) missing.push('el número de vuelo');
  if (!eventId) missing.push('el tipo de evento');
  if (hotelRows.some((r) => !r.idHotel)) missing.push('elegir el hotel de la fila nueva');
  if (hotelRows.some((r) => !(parseInt(r.dispo, 10) >= 0))) missing.push('los cuartos disponibles');
  const salidaAntes = !!dateIn && !!dateOut && dateOut < dateIn;

  const canSubmit = missing.length === 0 && !!dateIn && !!dateOut && !!hour && dirty && !isSaving;

  // Si hay cambios sin guardar, pregunta antes de salir (boton atras o gesto).
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || savedRef.current) return;
      e.preventDefault();
      Alert.alert('¿Salir sin guardar?', `Tienes cambios sin guardar (${changes.join(', ')}).`, [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Salir sin guardar', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, dirty, changes]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const hotelsPayload: UpdateOrderHotelInput[] = hotelRows.map((r) => ({
      id_orders_hotels: r.isNew ? undefined : r.id_orders_hotels,
      id_hotel: r.idHotel!,
      dispo: parseInt(r.dispo, 10) || 0,
    }));

    setIsSaving(true);
    try {
      const res = await updateOrder({
        id_order: folio,
        id_airport: idAirport,
        flight: flight.trim(),
        event: eventId!,
        date_in: dateIn,
        date_out: dateOut,
        hour: hour.length === 5 ? `${hour}:00` : hour,
        hotels: hotelsPayload,
        deleted_hotel_ids: deletedIds,
      });
      if (res.ok) {
        savedRef.current = true;
        Alert.alert('O.S. actualizada', res.msg ?? '', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        Alert.alert('No se pudo guardar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
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
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Ionicons name="airplane" size={15} color={p.accentText} />
                  <Text style={styles.summaryMain}>{airline}</Text>
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryPillText}>{iata}</Text>
                  </View>
                </View>
                <Text style={styles.summaryNote}>🔒 La aerolínea y la estación no se pueden cambiar (igual que en la web). Edita lo demás y guarda.</Text>
              </View>

              <FieldLabel text="Número de Vuelo" />
              <TextInput
                value={flight}
                onChangeText={setFlight}
                placeholder="# Vuelo"
                placeholderTextColor={p.placeholder}
                style={styles.input}
                autoCapitalize="characters"
              />

              <FieldLabel text="Tipo de Evento" />
              <SelectField
                label="Tipo de Evento"
                placeholder="Seleccionar evento"
                options={events.map((e) => ({ id: e.id, label: e.name }))}
                selectedId={eventId}
                onSelect={setEventId}
              />

              <FieldLabel text="Hoteles" />
              {hotelRows.map((row, idx) => (
                <View key={row.key} style={styles.hotelRow}>
                  <View style={styles.hotelRowTop}>
                    <Text style={styles.hotelRowLabel}>Hotel {idx + 1}</Text>
                    <Pressable onPress={() => removeHotelRow(row)} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={p.dangerText} />
                    </Pressable>
                  </View>
                  {row.isNew ? (
                    <SelectField
                      label={`Hotel ${idx + 1}`}
                      placeholder="Seleccionar hotel"
                      options={hotelsCatalog
                        .filter((h) => !hotelRows.some((r) => r.key !== row.key && r.idHotel === h.id))
                        .map((h) => ({ id: h.id, label: h.name.trim() }))}
                      selectedId={row.idHotel}
                      onSelect={(id) => updateHotelRow(row.key, { idHotel: id })}
                    />
                  ) : (
                    <View style={styles.readonlyField}>
                      <Text style={styles.readonlyText}>{row.name}</Text>
                    </View>
                  )}
                  <Text style={styles.stepLabel}>Cuartos disponibles</Text>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => bumpDispo(row.key, -1)} hitSlop={6}>
                      <Ionicons name="remove" size={20} color={p.accentText} />
                    </Pressable>
                    <TextInput
                      value={row.dispo}
                      onChangeText={(v) => updateHotelRow(row.key, { dispo: v.replace(/[^0-9]/g, '') })}
                      placeholder="0"
                      placeholderTextColor={p.placeholder}
                      keyboardType="number-pad"
                      style={styles.stepInput}
                    />
                    <Pressable style={styles.stepBtn} onPress={() => bumpDispo(row.key, 1)} hitSlop={6}>
                      <Ionicons name="add" size={20} color={p.accentText} />
                    </Pressable>
                    <Pressable style={styles.stepQuick} onPress={() => bumpDispo(row.key, 5)}>
                      <Text style={styles.stepQuickText}>+5</Text>
                    </Pressable>
                    <Pressable style={styles.stepQuick} onPress={() => bumpDispo(row.key, 10)}>
                      <Text style={styles.stepQuickText}>+10</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {removedRows.map((r) => (
                <View key={r.key} style={styles.removedRow}>
                  <Text style={styles.removedText} numberOfLines={1}>
                    {r.name} se quitará al guardar
                  </Text>
                  <Pressable onPress={() => undoRemove(r)} hitSlop={8}>
                    <Text style={styles.undoText}>Deshacer</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addHotelBtn} onPress={addHotelRow}>
                <Ionicons name="add-circle-outline" size={16} color={p.accentText} />
                <Text style={styles.addHotelText}>Agregar hotel</Text>
              </Pressable>

              <FieldLabel text="Fecha Entrada" />
              <Pressable style={styles.pickerField} onPress={() => setActivePicker('dateIn')}>
                <Ionicons name="calendar-outline" size={16} color={p.accentText} />
                <Text style={styles.pickerFieldText}>{formatDateDisplay(dateIn)}</Text>
              </Pressable>

              <FieldLabel text="Fecha Salida" />
              <Pressable style={styles.pickerField} onPress={() => setActivePicker('dateOut')}>
                <Ionicons name="calendar-outline" size={16} color={p.accentText} />
                <Text style={styles.pickerFieldText}>{formatDateDisplay(dateOut)}</Text>
              </Pressable>

              <View style={styles.quickRow}>
                {[['Mismo día', 0], ['+1 día', 1], ['+2 días', 2], ['+3 días', 3]].map(([l, d]) => (
                  <Pressable key={String(l)} style={styles.quickChip} onPress={() => setSalidaPlus(Number(d))}>
                    <Text style={styles.quickChipText}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {salidaAntes ? <Text style={styles.warnLine}>⚠ La fecha de salida es antes de la de entrada. Revísala.</Text> : null}

              <FieldLabel text="Hora Pick Up" />
              <Pressable style={styles.pickerField} onPress={() => setActivePicker('hour')}>
                <Ionicons name="time-outline" size={16} color={p.accentText} />
                <Text style={styles.pickerFieldText}>{hour} hrs.</Text>
              </Pressable>

            </ScrollView>
            <View style={styles.footerBar}>
              {offline ? (
                <Text style={styles.footerWarn}>📴 Sin internet: puedes revisar, pero para guardar necesitas señal.</Text>
              ) : missing.length > 0 ? (
                <Text style={styles.footerWarn} numberOfLines={2}>Falta: {missing.join(' · ')}</Text>
              ) : dirty ? (
                <Text style={styles.footerOk} numberOfLines={2}>Cambiaste: {changes.join(', ')}</Text>
              ) : (
                <Text style={styles.footerMuted}>Sin cambios todavía. Toca lo que quieras corregir.</Text>
              )}
              <Pressable
                style={[styles.submitBtn, (!canSubmit || offline) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || offline}
              >
                {isSaving ? (
                  <ActivityIndicator color={p.onAccent} />
                ) : (
                  <Text style={styles.submitText}>{dirty ? `GUARDAR ${changes.length} CAMBIO${changes.length === 1 ? '' : 'S'}` : 'GUARDAR'}</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>

      {activePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={activePicker === 'hour' ? parseHHmm(hour) : parseISODate(activePicker === 'dateIn' ? dateIn : dateOut)}
          mode={activePicker === 'hour' ? 'time' : 'date'}
          is24Hour
          display="default"
          onChange={handlePickerChange}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={!!activePicker} transparent animationType="slide" onRequestClose={() => setActivePicker(null)}>
          <View style={styles.iosPickerOverlay}>
            <View style={styles.iosPickerSheet}>
              <Pressable style={styles.iosPickerDone} onPress={() => setActivePicker(null)}>
                <Text style={styles.iosPickerDoneText}>Listo</Text>
              </Pressable>
              {activePicker && (
                <DateTimePicker
                  value={activePicker === 'hour' ? parseHHmm(hour) : parseISODate(activePicker === 'dateIn' ? dateIn : dateOut)}
                  mode={activePicker === 'hour' ? 'time' : 'date'}
                  is24Hour
                  display="spinner"
                  onChange={handlePickerChange}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
}

function FieldLabel({ text }: { text: string }) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.fieldLabel}>{text}</Text>;
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
  content: { padding: 16, paddingBottom: 24 },
  summary: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: radii.card, padding: 14, marginBottom: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryMain: { color: p.text, fontSize: 15, fontWeight: '800', flex: 1 },
  summaryPill: { backgroundColor: p.accent, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  summaryPillText: { color: p.onAccent, fontSize: 11.5, fontWeight: '800' },
  summaryNote: { color: p.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  stepLabel: { color: p.textMuted, fontSize: 11, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: p.cardBorder, backgroundColor: p.card, alignItems: 'center', justifyContent: 'center' },
  stepInput: { width: 64, height: 42, borderRadius: radii.input, borderWidth: 1, borderColor: p.cardBorder, backgroundColor: p.card, color: p.text, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  stepQuick: { height: 34, borderRadius: 17, paddingHorizontal: 12, backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, alignItems: 'center', justifyContent: 'center' },
  stepQuickText: { color: p.accentText, fontSize: 12, fontWeight: '800' },
  removedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: p.warnSoft, borderWidth: 1, borderColor: p.warnBorder, borderRadius: radii.input, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  removedText: { color: p.warnText, fontSize: 12, flex: 1 },
  undoText: { color: p.accentText, fontWeight: '800', fontSize: 12.5 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickChip: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  quickChipText: { color: p.text, fontSize: 12, fontWeight: '700' },
  warnLine: { color: p.warnText, fontSize: 12, fontWeight: '700', marginTop: 8 },
  footerBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: p.isDark ? p.modalBg : '#ffffff', borderTopWidth: 1, borderTopColor: p.divider, gap: 4 },
  footerWarn: { color: p.warnText, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  footerOk: { color: p.okText, fontSize: 12, fontWeight: '800', lineHeight: 16 },
  footerMuted: { color: p.textMuted, fontSize: 12 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  fieldLabel: {
    color: p.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 46,
    color: p.text,
    fontSize: 14,
  },
  readonlyField: {
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 46,
    justifyContent: 'center',
  },
  readonlyText: { color: p.textMuted, fontSize: 14, fontWeight: '600' },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 46,
  },
  pickerFieldText: { color: p.text, fontSize: 14, fontWeight: '700' },
  hotelRow: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.card,
    padding: 12,
    marginBottom: 10,
  },
  hotelRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hotelRowLabel: { color: p.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  addHotelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 6 },
  addHotelText: { color: p.accentText, fontWeight: '700', fontSize: 12.5 },
  submitBtn: {
    backgroundColor: p.accent,
    borderRadius: radii.button,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: p.onAccent, fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  iosPickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: p.overlay },
  iosPickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 20 },
  iosPickerDone: { alignItems: 'flex-end', paddingHorizontal: 18, paddingVertical: 12 },
  iosPickerDoneText: { color: p.accentText, fontWeight: '800', fontSize: 15 },
});
