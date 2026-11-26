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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getHotelsForOrder, getPreregListForOs, HotelDTO, PaxType, PreregListItem } from '../api/client';
import { addPax } from '../api/queuedWrites';
import VoucherScanButton from '../components/VoucherScanButton';
import SupportScanButton from '../components/SupportScanButton';
import SelectField from '../components/SelectField';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { PreregPrefill, RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AddPax'>;

type PassengerForm = {
  name: string;
  voucher: string;
  type: PaxType;
  ageC: number;
  ageI: number;
  chek: 0 | 1 | 2;
  fSalida: string;
  hora: string;
  breakfast: number;
  lunch: number;
  dinner: number;
};

function makePassenger(fSalida: string, hora: string): PassengerForm {
  return {
    name: '',
    voucher: '',
    type: 'adulto',
    ageC: 2,
    ageI: 0,
    chek: 0,
    fSalida,
    hora,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  };
}

/**
 * Equivalente movil de op/modulos/open/add.php + insertDetailOrder.php.
 *
 * OJO -- esto es UNA habitacion (1 hotel + 1 ocupacion), que puede traer
 * VARIOS pasajeros dentro (ej. una familia): igual que en la web, se
 * guarda 1 sola fila en orders_open y se resta 1 SOLO cuarto disponible,
 * sin importar cuantos pasajeros se agreguen con el boton "+ Agregar
 * pasajero a este cuarto" de abajo. Un pasajero por cuarto sigue
 * funcionando igual, solo que ahora ya no obliga a gastar un cuarto
 * completo por cada persona cuando comparten habitacion.
 */
export default function AddPaxScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, iata, typeAirline, prefill, otraOsPrefill } = route.params;

  const showOcupation = typeAirline === 'ep' || (typeAirline === 'all' && idAirport === 14);
  const showMeals = typeAirline === 'ep';

  const [isSaving, setIsSaving] = useState(false);

  const [idHotel, setIdHotel] = useState<number | null>(null);
  const [ocupation, setOcupation] = useState('');
  const [passengers, setPassengers] = useState<PassengerForm[]>([makePassenger('', '')]);
  const [prefillActive, setPrefillActive] = useState(!!prefill);
  const [appliedPrefill, setAppliedPrefill] = useState<PreregPrefill | null>(prefill ?? null);
  const prefillAppliedRef = useRef(false);
  const [otraOsActive, setOtraOsActive] = useState(!!otraOsPrefill);
  const otraOsAppliedRef = useRef(false);

  // Aviso pasivo (alta manual, sin pasar por el escaneo de QR): si ya se
  // llegó con un prefill (del escaneo), no tiene caso mostrar esta lista.
  const [preregList, setPreregList] = useState<PreregListItem[]>([]);
  const [preregPending, setPreregPending] = useState(0);
  const [showPreregList, setShowPreregList] = useState(false);

  const loadPreregList = useCallback(async () => {
    if (prefill || otraOsPrefill) return;
    try {
      const res = await getPreregListForOs(folio, idAirport);
      if (res.ok) {
        setPreregList(res.items ?? []);
        setPreregPending(res.pending ?? 0);
      }
    } catch (e) {
      // Aviso de mejor esfuerzo: si falla, simplemente no se muestra.
    }
  }, [folio, idAirport, prefill, otraOsPrefill]);

  useEffect(() => {
    loadPreregList();
  }, [loadPreregList]);

  const {
    data: hotelData,
    isLoading,
    error: loadError,
    offlineSince,
    reload: load,
  } = useOfflineLoad(
    `add_pax_hotels_${folio}_${idAirport}`,
    () => getHotelsForOrder(folio, idAirport),
    (res) => ({
      hotels: (res.hotels ?? []).filter((h) => h.rooms_dis !== 0),
      defaultFSalida: res.default_date_out ? res.default_date_out.slice(0, 10) : '',
      defaultHora: res.default_hour ? res.default_hour.slice(0, 5) : '',
    }),
    [folio, idAirport]
  );

  const hotels: HotelDTO[] = hotelData?.hotels ?? [];
  const defaultFSalida = hotelData?.defaultFSalida ?? '';
  const defaultHora = hotelData?.defaultHora ?? '';

  const applyPrefillData = useCallback(
    (data: PreregPrefill) => {
      if (!hotelData) return;
      const titular: PassengerForm = {
        ...makePassenger(hotelData.defaultFSalida, hotelData.defaultHora),
        name: data.name,
        voucher: data.voucher,
      };
      const comps: PassengerForm[] = data.comps.map((c) => {
        const base = makePassenger(hotelData.defaultFSalida, hotelData.defaultHora);
        const type: PaxType = c.type === 'nino' || c.type === 'infante' ? c.type : 'adulto';
        return {
          ...base,
          name: c.name,
          type,
          ageC: type === 'nino' && c.age != null ? c.age : base.ageC,
          ageI: type === 'infante' && c.age != null ? c.age : base.ageI,
        };
      });
      setPassengers([titular, ...comps]);
      if (data.idHotel && hotelData.hotels.some((h) => h.id === data.idHotel)) {
        setIdHotel(data.idHotel);
      }
      setAppliedPrefill(data);
      setPrefillActive(true);
      setShowPreregList(false);
    },
    [hotelData]
  );

  const handlePickPrereg = (item: PreregListItem) => {
    applyPrefillData({
      preregId: item.id,
      name: item.name,
      voucher: item.voucher,
      comps: item.comps,
      idHotel: item.id_hotel,
      hotelName: item.hotel_name || null,
    });
  };

  useEffect(() => {
    if (!hotelData) return;
    if (hotelData.hotels.length === 1) setIdHotel(hotelData.hotels[0].id);

    if (prefill && !prefillAppliedRef.current) {
      prefillAppliedRef.current = true;
      applyPrefillData(prefill);
      return;
    }

    if (otraOsPrefill && !otraOsAppliedRef.current) {
      otraOsAppliedRef.current = true;
      const type: PaxType = otraOsPrefill.tipo === 'nino' || otraOsPrefill.tipo === 'infante' ? otraOsPrefill.tipo : 'adulto';
      const edad = parseInt(otraOsPrefill.edad, 10);
      setPassengers([
        {
          ...makePassenger(hotelData.defaultFSalida, hotelData.defaultHora),
          name: otraOsPrefill.name,
          voucher: otraOsPrefill.voucher,
          type,
          ageC: type === 'nino' && !isNaN(edad) ? edad : 2,
          ageI: type === 'infante' && !isNaN(edad) ? edad : 0,
        },
      ]);
      return;
    }

    setPassengers([makePassenger(hotelData.defaultFSalida, hotelData.defaultHora)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelData]);

  const updatePassenger = (index: number, patch: Partial<PassengerForm>) => {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addPassenger = () => {
    setPassengers((prev) => [...prev, makePassenger(defaultFSalida, defaultHora)]);
  };

  const removePassenger = (index: number) => {
    setPassengers((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit =
    !!idHotel &&
    passengers.length > 0 &&
    passengers.every((p) => p.name.trim().length > 0 && p.fSalida.trim().length > 0 && p.hora.trim().length > 0) &&
    !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit || !idHotel) return;
    setIsSaving(true);
    try {
      const res = await addPax({
        id_order: folio,
        id_airport: idAirport,
        id_hotel: idHotel,
        type_airline: typeAirline,
        ocupation: showOcupation ? ocupation : undefined,
        passengers: passengers.map((p) => ({
          name: p.name.trim(),
          voucher: p.voucher.trim(),
          f_salida: p.fSalida.trim(),
          hora: p.hora.trim(),
          type: p.type,
          chek: p.chek,
          age_c: p.type === 'nino' ? p.ageC : 0,
          age_i: p.type === 'infante' ? p.ageI : 0,
          breakfast: showMeals ? p.breakfast : 0,
          lunch: showMeals ? p.lunch : 0,
          dinner: showMeals ? p.dinner : 0,
        })),
        otra_os_tokens: otraOsActive && otraOsPrefill ? [otraOsPrefill.token] : undefined,
      });

      if (res.status === 'dispo') {
        Alert.alert('Sin disponibilidad', res.msg ?? 'No hay habitaciones disponibles en ese hotel.');
        load();
        return;
      }
      if (!res.ok) {
        Alert.alert('No se pudo guardar', res.error ?? res.msg ?? 'Intenta de nuevo.');
        return;
      }

      Alert.alert(res.queued ? 'Guardada sin conexión' : 'Habitación agregada', (res.queued ? `${res.msg}

` : '') + '¿Quieres agregar otra habitación a esta O.S.?', [
        { text: 'Terminar', style: 'cancel', onPress: () => navigation.navigate('OpenOrders') },
        {
          text: 'Agregar otra',
          onPress: () => {
            setOcupation('');
            setPassengers([makePassenger(defaultFSalida, defaultHora)]);
            setPrefillActive(false);
            setAppliedPrefill(null);
            setOtraOsActive(false);
            load();
            loadPreregList();
          },
        },
      ]);
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
          <View>
            <Text style={styles.topTitle}>Agregar Habitación</Text>
            <Text style={styles.topSub}>#{folioDisplay}{iata ? ' · ' + iata : ''}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        {isLoading ? (
          <ActivityIndicator color={p.accentText} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {offlineSince && (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
                  <Text style={styles.offlineBannerText}>
                    Sin conexión: mostrando la disponibilidad guardada el {formatSavedAt(offlineSince)}.
                  </Text>
                </View>
              )}

              {prefillActive && appliedPrefill && (
                <View style={styles.prefillBanner}>
                  <Ionicons name="qr-code-outline" size={16} color={p.accentText} />
                  <Text style={styles.prefillBannerText}>
                    Datos precargados desde el pre-registro por QR ({1 + appliedPrefill.comps.length}{' '}
                    {1 + appliedPrefill.comps.length === 1 ? 'persona' : 'personas'}).
                    {appliedPrefill.idHotel && idHotel === appliedPrefill.idHotel
                      ? ` Hotel: ${appliedPrefill.hotelName ?? ''}.`
                      : ' Elige el hotel (el asignado ya no tiene habitaciones disponibles).'}{' '}
                    Revisa y guarda.
                  </Text>
                </View>
              )}

              {otraOsActive && otraOsPrefill && (
                <View style={styles.otraOsBanner}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={p.isDark ? '#93c5fd' : '#1d4ed8'} />
                  <Text style={styles.otraOsBannerText}>
                    Pasajero autorizado de otra O.S. Revisa y guarda para completar el movimiento.
                  </Text>
                </View>
              )}

              {!prefillActive && preregPending > 0 && (
                <View style={styles.passiveBannerWrap}>
                  <Pressable style={styles.passiveBanner} onPress={() => setShowPreregList((v) => !v)}>
                    <Ionicons name="qr-code-outline" size={16} color={p.warnText} />
                    <Text style={styles.passiveBannerText}>
                      {preregPending} {preregPending === 1 ? 'persona se' : 'personas se'} pre-registraron por QR para
                      esta O.S. · toca para usar sus datos
                    </Text>
                    <Ionicons name={showPreregList ? 'chevron-up' : 'chevron-down'} size={16} color={p.warnText} />
                  </Pressable>
                  {showPreregList && (
                    <View style={styles.passiveList}>
                      {preregList
                        .filter((item) => !item.ya)
                        .map((item) => (
                          <Pressable key={item.id} style={styles.passiveItem} onPress={() => handlePickPrereg(item)}>
                            <Text style={styles.passiveItemName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.passiveItemSub}>
                              {item.party > 1 ? `${item.party} personas` : '1 persona'}
                              {item.voucher ? ` · Voucher ${item.voucher}` : ''}
                            </Text>
                          </Pressable>
                        ))}
                    </View>
                  )}
                </View>
              )}

              <FieldLabel text="Hotel" />
              {hotels.length === 0 ? (
                <Text style={styles.noRooms}>No hay hoteles con habitaciones disponibles.</Text>
              ) : (
                <SelectField
                  label="Hotel"
                  placeholder="Seleccionar hotel"
                  options={hotels.map((h) => ({ id: h.id, label: `${h.name.trim()} (${h.rooms_dis} disp.)` }))}
                  selectedId={idHotel}
                  onSelect={setIdHotel}
                />
              )}

              {showOcupation && (
                <>
                  <FieldLabel text="Ocupación (de la habitación)" />
                  <ChipRow>
                    {['SGL', 'DBL', 'TPL', 'CDPL'].map((op) => (
                      <Chip key={op} label={op} active={ocupation === op} onPress={() => setOcupation(op)} />
                    ))}
                  </ChipRow>
                </>
              )}

              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>
                Pasajeros en esta habitación ({passengers.length})
              </Text>

              {passengers.map((p, index) => (
                <PassengerCard
                  key={index}
                  index={index}
                  passenger={p}
                  showMeals={showMeals}
                  canRemove={passengers.length > 1}
                  onChange={(patch) => updatePassenger(index, patch)}
                  onRemove={() => removePassenger(index)}
                  idOrder={folio}
                  idAirport={idAirport}
                />
              ))}

              <Pressable style={styles.addPassengerBtn} onPress={addPassenger}>
                <Ionicons name="add-circle-outline" size={18} color={p.accentText} />
                <Text style={styles.addPassengerText}>Agregar pasajero a este cuarto</Text>
              </Pressable>

              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                <Text style={styles.submitText}>{isSaving ? 'Guardando...' : 'Guardar Habitación'}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function PassengerCard({
  index,
  passenger,
  showMeals,
  canRemove,
  onChange,
  onRemove,
  idOrder,
  idAirport,
}: {
  index: number;
  passenger: PassengerForm;
  showMeals: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<PassengerForm>) => void;
  onRemove: () => void;
  idOrder: number;
  idAirport: number;
}) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.paxCard, p.shadowCard]}>
      <View style={styles.paxCardHead}>
        <Text style={styles.paxCardTitle}>Pasajero {index + 1}</Text>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={p.dangerText} />
          </Pressable>
        )}
      </View>

      <FieldLabel text="Nombre completo" />
      <TextInput
        value={passenger.name}
        onChangeText={(t) => onChange({ name: t })}
        placeholder="Nombre completo del pasajero"
        placeholderTextColor={p.placeholder}
        style={styles.input}
        autoCapitalize="words"
      />

      <View style={{ marginTop: 8, marginBottom: 4 }}>
        <VoucherScanButton
          idOrder={idOrder}
          idAirport={idAirport}
          onNameDetected={(detected) => onChange({ name: detected })}
        />
      </View>

      <FieldLabel text="Voucher (opcional)" />
      <TextInput
        value={passenger.voucher}
        onChangeText={(t) => onChange({ voucher: t })}
        placeholder="Número de voucher"
        placeholderTextColor={p.placeholder}
        style={styles.input}
        autoCapitalize="characters"
      />

      <View style={{ marginTop: 8, marginBottom: 4 }}>
        <SupportScanButton idOrder={idOrder} idAirport={idAirport} onDetected={(codigo) => onChange({ voucher: codigo })} />
      </View>

      <FieldLabel text="Early / Late (opcional)" />
      <ChipRow>
        <Chip label="Ninguno" active={passenger.chek === 0} onPress={() => onChange({ chek: 0 })} />
        <Chip label="Early Check-In" active={passenger.chek === 1} onPress={() => onChange({ chek: 1 })} />
        <Chip label="Late Check-Out" active={passenger.chek === 2} onPress={() => onChange({ chek: 2 })} />
      </ChipRow>

      <View style={styles.row2}>
        <View style={styles.row2Item}>
          <FieldLabel text="Fecha salida" />
          <TextInput
            value={passenger.fSalida}
            onChangeText={(t) => onChange({ fSalida: t })}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={p.placeholder}
            style={styles.input}
          />
        </View>
        <View style={styles.row2Item}>
          <FieldLabel text="Hora salida" />
          <TextInput
            value={passenger.hora}
            onChangeText={(t) => onChange({ hora: t })}
            placeholder="HH:MM"
            placeholderTextColor={p.placeholder}
            style={styles.input}
          />
        </View>
      </View>

      <FieldLabel text="Tipo de pasajero" />
      <ChipRow>
        <Chip label="Adulto" active={passenger.type === 'adulto'} onPress={() => onChange({ type: 'adulto' })} />
        <Chip label="Niño" active={passenger.type === 'nino'} onPress={() => onChange({ type: 'nino' })} />
        <Chip label="Infante" active={passenger.type === 'infante'} onPress={() => onChange({ type: 'infante' })} />
      </ChipRow>

      {passenger.type === 'nino' && (
        <>
          <FieldLabel text="Edad del niño" />
          <ChipRow>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
              <Chip key={n} label={String(n)} active={passenger.ageC === n} onPress={() => onChange({ ageC: n })} />
            ))}
          </ChipRow>
        </>
      )}
      {passenger.type === 'infante' && (
        <>
          <FieldLabel text="Edad del infante" />
          <ChipRow>
            <Chip label="0 años" active={passenger.ageI === 0} onPress={() => onChange({ ageI: 0 })} />
            <Chip label="1 año" active={passenger.ageI === 1} onPress={() => onChange({ ageI: 1 })} />
          </ChipRow>
        </>
      )}

      {showMeals && (
        <>
          <FieldLabel text="Comidas (número de veces)" />
          <MealCounter label="Desayuno" value={passenger.breakfast} onChange={(n) => onChange({ breakfast: n })} />
          <MealCounter label="Comida" value={passenger.lunch} onChange={(n) => onChange({ lunch: n })} />
          <MealCounter label="Cena" value={passenger.dinner} onChange={(n) => onChange({ dinner: n })} />
        </>
      )}
    </View>
  );
}

function FieldLabel({ text }: { text: string }) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function ChipRow({ children }: { children: React.ReactNode }) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.chipRow}>{children}</View>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MealCounter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.mealRow}>
      <Text style={styles.mealLabel}>{label}</Text>
      <View style={styles.mealCounter}>
        <Pressable style={styles.mealBtn} onPress={() => onChange(Math.max(0, value - 1))}>
          <Ionicons name="remove" size={16} color={p.accentText} />
        </Pressable>
        <Text style={styles.mealValue}>{value}</Text>
        <Pressable style={styles.mealBtn} onPress={() => onChange(Math.min(6, value + 1))}>
          <Ionicons name="add" size={16} color={p.accentText} />
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
  topTitle: { color: p.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
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
  prefillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.accentSoft,
    borderWidth: 1,
    borderColor: p.accentBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  prefillBannerText: { color: p.accentText, fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  otraOsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(37,99,235,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.35)',
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  otraOsBannerText: { color: p.isDark ? '#93c5fd' : '#1d4ed8', fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  passiveBannerWrap: { marginBottom: 14 },
  passiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.warnSoft,
    borderWidth: 1,
    borderColor: p.warnBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  passiveBannerText: { flex: 1, color: p.warnText, fontSize: 11.5, lineHeight: 16 },
  passiveList: {
    marginTop: 6,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    overflow: 'hidden',
  },
  passiveItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: p.divider,
  },
  passiveItemName: { color: p.text, fontWeight: '700', fontSize: 13 },
  passiveItemSub: { color: p.textMuted, fontSize: 11, marginTop: 2 },
  noRooms: { color: p.textMuted, fontSize: 13, marginBottom: 8 },
  divider: { height: 1, backgroundColor: p.divider, marginTop: 20, marginBottom: 14 },
  sectionTitle: { color: p.text, fontWeight: '800', fontSize: 13.5, marginBottom: 10 },
  paxCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 14,
  },
  paxCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  paxCardTitle: { color: p.accentText, fontWeight: '800', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  addPassengerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: p.accentText,
    borderStyle: 'dashed',
    borderRadius: radii.input,
    paddingVertical: 12,
    marginBottom: 20,
  },
  addPassengerText: { color: p.accentText, fontWeight: '800', fontSize: 13 },
  fieldLabel: {
    color: p.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    height: 46,
    color: p.text,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: p.accent, borderColor: p.accent },
  chipText: { color: p.text, fontSize: 12.5, fontWeight: '700' },
  chipTextActive: { color: p.onAccent },
  row2: { flexDirection: 'row', gap: 12 },
  row2Item: { flex: 1 },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: p.inputBg,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  mealLabel: { color: p.text, fontSize: 13, fontWeight: '700' },
  mealCounter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: p.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealValue: { color: p.text, fontWeight: '800', fontSize: 14, minWidth: 18, textAlign: 'center' },
  submitBtn: {
    backgroundColor: p.accent,
    borderRadius: radii.button,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: p.onAccent, fontWeight: '800', fontSize: 15 },
});
