import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import Loading from '../components/Loading';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { addPaxToRoom, getHotelSuggestions, getHotelsForOrder, HotelSuggestion, getPreregListForOs, HotelDTO, PaxType, PreregListItem } from '../api/client';
import { addPax } from '../api/queuedWrites';
import VoucherScanButton from '../components/VoucherScanButton';
import SupportScanButton from '../components/SupportScanButton';
import SelectField from '../components/SelectField';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import { getCache, saveCache } from '../utils/offlineCache';
import type { PreregPrefill, RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
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

/** Tipos de habitacion y cuantas personas caben (igual que la web: los infantes no cuentan). */
const OC: Record<string, { name: string; cap: number }> = {
  SGL: { name: 'Sencilla', cap: 1 },
  DBL: { name: 'Doble', cap: 2 },
  TPL: { name: 'Triple', cap: 3 },
  CDPL: { name: 'Cuádruple', cap: 4 },
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
  const { folio, idAirport, folioDisplay, iata, typeAirline, prefill, otraOsPrefill, room } = route.params;

  const showOcupation = !room && (typeAirline === 'ep' || (typeAirline === 'all' && idAirport === 14));
  const showMeals = typeAirline === 'ep';

  const [isSaving, setIsSaving] = useState(false);

  const [idHotel, setIdHotel] = useState<number | null>(room ? room.idHotel : null);
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
    if (prefill || otraOsPrefill || room) return;
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

  // Sugerencias de hotel (uso real + acuerdo comercial + disponibilidad). Con internet se actualizan; sin internet queda lo ultimo guardado.
  const [suggest, setSuggest] = useState<HotelSuggestion[]>([]);
  useEffect(() => {
    if (room) return;
    let cancelled = false;
    const key = `hotel_suggest_${folio}_${idAirport}`;
    getCache<HotelSuggestion[]>(key)
      .then((c) => {
        if (!cancelled && c) setSuggest(c.data);
      })
      .catch(() => {});
    getHotelSuggestions(folio, idAirport)
      .then((r) => {
        if (cancelled || !r.ok) return;
        setSuggest(r.ranking ?? []);
        saveCache(key, r.ranking ?? []).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [folio, idAirport, room]);

  // La lista de hoteles sale ordenada: primero los recomendados.
  const hotels: HotelDTO[] = useMemo(() => {
    const base = hotelData?.hotels ?? [];
    if (suggest.length === 0) return base;
    const rank = new Map(suggest.map((x, i) => [x.id, i]));
    return [...base].sort((a, b) => (rank.has(a.id) ? rank.get(a.id)! : 999) - (rank.has(b.id) ? rank.get(b.id)! : 999));
  }, [hotelData, suggest]);
  const topSuggest = suggest.length ? suggest[0] : null;
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
    if (!room && hotelData.hotels.length === 1) setIdHotel(hotelData.hotels[0].id);

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

  // Personas que cuentan para la ocupacion: con nombre y que no sean infantes (regla de la web).
  const peopleCount = passengers.filter((x) => x.name.trim().length > 0 && x.type !== 'infante').length;
  const ocCap = ocupation && OC[ocupation] ? OC[ocupation].cap : 0;
  const ocupationInvalid = showOcupation && !!ocupation && peopleCount > ocCap;
  const roomCap = room && OC[room.ocupation] ? OC[room.ocupation].cap : 0;
  const roomFull = !!room && roomCap > 0 && room.people + peopleCount > roomCap;

  // Lista de lo que falta, para decirselo a la persona en vez de dejar el boton apagado sin explicar.
  const missing: string[] = [];
  if (!idHotel) missing.push('elegir el hotel');
  if (showOcupation && !ocupation) missing.push('elegir el tipo de habitación');
  if (roomFull) missing.push(`quitar personas (la habitación ${room!.ocupation} ya lleva ${room!.people} de ${roomCap})`);
  if (ocupationInvalid) missing.push(`cambiar la ocupación (caben ${ocCap} y llevas ${peopleCount})`);
  passengers.forEach((x, i) => {
    const who = passengers.length > 1 ? `pasajero ${i + 1}` : 'pasajero';
    if (!x.name.trim()) missing.push(`nombre del ${who}`);
    else if (!x.fSalida.trim()) missing.push(`fecha de salida del ${who}`);
    else if (!x.hora.trim()) missing.push(`hora de salida del ${who}`);
  });
  const canSubmit = passengers.length > 0 && missing.length === 0 && !isSaving;

  const pickOcupation = (code: string) => {
    if (peopleCount > OC[code].cap) {
      Alert.alert(
        'Esta ocupación no corresponde',
        `Caben ${OC[code].cap} persona(s) y llevas ${peopleCount} (los infantes no cuentan).\n\nQuita personas o elige una ocupación con más lugares.`
      );
      return;
    }
    setOcupation(code);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !idHotel) return;
    setIsSaving(true);
    try {
      if (room) {
        const r = await addPaxToRoom({
          id_order: folio,
          id_airport: idAirport,
          id_orders_open: room.idOrdersOpen,
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
        });
        if (!r.ok) {
          Alert.alert('No se pudo guardar', r.error ?? r.msg ?? 'Intenta de nuevo.');
          return;
        }
        Alert.alert('Pasajero agregado', 'Ya quedó dentro de la habitación.', [
          { text: 'Listo', onPress: () => navigation.goBack() },
        ]);
        return;
      }
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
            <Text style={styles.topTitle}>{room ? 'Agregar a habitación' : 'Agregar Habitación'}</Text>
            <Text style={styles.topSub}>#{folioDisplay}{iata ? ' · ' + iata : ''}</Text>
          </View>
          <BrandMark />
        </View>

        {isLoading ? (
          <Loading style={{ marginTop: 40 }} />
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
              <LinearGradient
                colors={[p.accent, p.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroIcon}>
                  <Ionicons name="person-add" size={24} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Agregar pasajero</Text>
                  <Text style={styles.heroSub}>
                    O.S. {folioDisplay}
                    {iata ? ' · ' + iata : ''}
                  </Text>
                </View>
              </LinearGradient>

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

              {!room && !prefillActive && preregPending > 0 && (
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

              {room && (
                <View style={styles.noRooms}>
                  <Text style={{ color: p.text, fontWeight: '800' }}>{room.hotelName.trim()}</Text>
                  <Text style={{ color: p.textMuted }}>
                    {room.ocupation ? `Habitación ${room.ocupation} · ` : ''}ya lleva {room.people} persona(s)
                  </Text>
                </View>
              )}
              {!room && topSuggest && hotels.some((h) => h.id === topSuggest.id) ? (
                idHotel === topSuggest.id ? (
                  <View style={styles.suggestOk}>
                    <Text style={styles.suggestOkText}>✓ Elegiste el hotel recomendado: {topSuggest.name}</Text>
                  </View>
                ) : (
                  <View style={styles.suggestBox}>
                    <Text style={styles.suggestTitle}>💡 Te recomiendo: {topSuggest.name}</Text>
                    {topSuggest.reasons.slice(0, 2).map((r, i) => (
                      <Text key={i} style={styles.suggestReason}>• {r}</Text>
                    ))}
                    <Pressable style={styles.suggestBtn} onPress={() => setIdHotel(topSuggest.id)}>
                      <Text style={styles.suggestBtnText}>Usar este hotel</Text>
                    </Pressable>
                  </View>
                )
              ) : null}
              {!room && <StepCard n={1} icon="bed" title="Hotel" hint="Toca el hotel; ves cuántas habitaciones quedan">
                {hotels.length === 0 ? (
                  <Text style={styles.noRooms}>No hay hoteles con habitaciones disponibles.</Text>
                ) : hotels.length <= 8 ? (
                  <View style={styles.tileGrid}>
                    {hotels.map((h) => {
                      const on = idHotel === h.id;
                      const low = h.rooms_dis <= 3;
                      return (
                        <Pressable key={h.id} style={[styles.tile, on && styles.tileOn]} onPress={() => setIdHotel(h.id)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tileName} numberOfLines={2}>
                              {h.name.trim()}
                            </Text>
                            <Text style={[styles.tileTag, low && { color: p.warnText, fontWeight: '800' }]}>
                              {low ? `⚠ Quedan ${h.rooms_dis}` : `${h.rooms_dis} hab. disponibles`}
                            </Text>
                          </View>
                          {on && <Ionicons name="checkmark-circle" size={22} color={p.accent} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <SelectField
                    label="Hotel"
                    placeholder="Seleccionar hotel"
                    options={hotels.map((h) => ({ id: h.id, label: `${h.name.trim()} (${h.rooms_dis} disp.)` }))}
                    selectedId={idHotel}
                    onSelect={setIdHotel}
                  />
                )}
              </StepCard>}

              {showOcupation && (
                <StepCard n={2} icon="moon" title="Tipo de habitación" hint="Cuántas personas caben (los infantes no cuentan)">
                  <View style={styles.tileGrid}>
                    {Object.keys(OC).map((code) => {
                      const on = ocupation === code;
                      const blocked = peopleCount > OC[code].cap;
                      return (
                        <Pressable
                          key={code}
                          style={[styles.tile, styles.tileHalf, on && styles.tileOn, blocked && styles.tileBlocked]}
                          onPress={() => pickOcupation(code)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.tileName}>
                              {blocked ? '🔒 ' : ''}
                              {code} · {OC[code].name}
                            </Text>
                            <Text style={[styles.tileTag, blocked && { color: p.dangerText }]}>
                              {blocked ? `No corresponde: caben ${OC[code].cap}, llevas ${peopleCount}` : `${OC[code].cap} persona${OC[code].cap === 1 ? '' : 's'}`}
                            </Text>
                          </View>
                          {on && <Ionicons name="checkmark-circle" size={20} color={p.accent} />}
                        </Pressable>
                      );
                    })}
                  </View>
                </StepCard>
              )}

              <StepCard
                n={showOcupation ? 3 : 2}
                icon="people"
                title={`En esta habitación: ${passengers.filter((x) => x.name.trim()).length}`}
                hint="Agrega a todos los que van en el mismo cuarto"
              >
                {passengers.some((x) => x.name.trim()) && (
                  <View style={styles.whoRow}>
                    {passengers
                      .filter((x) => x.name.trim())
                      .map((x, i) => (
                        <View key={i} style={[styles.whoChip, x.type === 'infante' && styles.whoChipInf]}>
                          <Text style={styles.whoChipText} numberOfLines={1}>
                            {x.name.trim()}
                            {x.type === 'infante' ? ' (infante)' : ''}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}

                {passengers.map((pax, index) => (
                  <PassengerCard
                    key={index}
                    index={index}
                    passenger={pax}
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
                  <Text style={styles.addPassengerText}>Agregar otro pasajero a este cuarto</Text>
                </Pressable>
              </StepCard>
            </ScrollView>

            {/* Barra fija: dice que falta (o que ya esta listo) y guarda */}
            <View style={styles.footerBar}>
              {missing.length > 0 ? (
                <Text style={styles.footerHint} numberOfLines={2}>
                  Falta: {missing.slice(0, 2).join(' · ')}
                  {missing.length > 2 ? ` · y ${missing.length - 2} más` : ''}
                </Text>
              ) : (
                <Text style={styles.footerOk} numberOfLines={1}>
                  ✓ Todo listo · {passengers.length} {passengers.length === 1 ? 'pasajero' : 'pasajeros'}
                </Text>
              )}
              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {isSaving ? (
                  <ActivityIndicator color={p.onAccent} />
                ) : (
                  <Text style={styles.submitText}>{room ? 'Agregar a la habitación' : 'Guardar habitación'}</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

/** Un paso del formulario: numero, icono, titulo y una pista corta; adentro van los campos. */
function StepCard({
  n,
  icon,
  title,
  hint,
  children,
}: {
  n: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHead}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Ionicons name={icon} size={16} color={p.accentText} />
        <Text style={styles.stepTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {!!hint && <Text style={styles.stepHint}>{hint}</Text>}
      {children}
    </View>
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
  suggestBox: { backgroundColor: p.okSoft, borderWidth: 1, borderColor: p.okBorder, borderRadius: radii.card, padding: 14, marginBottom: 14, gap: 4 },
  suggestTitle: { color: p.okText, fontSize: 14, fontWeight: '900' },
  suggestReason: { color: p.okText, fontSize: 12, lineHeight: 17 },
  suggestBtn: { alignSelf: 'flex-start', backgroundColor: p.accent, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  suggestBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12.5 },
  suggestOk: { backgroundColor: p.okSoft, borderRadius: radii.input, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  suggestOkText: { color: p.okText, fontSize: 12, fontWeight: '800' },
  noRooms: { color: p.textMuted, fontSize: 13, marginBottom: 8 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: p.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: p.isDark ? 0.35 : 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 },
  stepCard: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    ...(p.isDark ? {} : p.shadowCard),
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: p.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: p.onAccent, fontSize: 12.5, fontWeight: '900' },
  stepTitle: { flex: 1, color: p.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
  stepHint: { color: p.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12, lineHeight: 16 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderWidth: 1.5,
    borderColor: p.isDark ? 'transparent' : p.inputBorder,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tileHalf: { width: '48%', flexGrow: 1 },
  tileOn: { borderColor: p.accent, backgroundColor: p.accentSoft },
  tileBlocked: { opacity: 0.6, backgroundColor: p.dangerSoft, borderColor: p.dangerBorder },
  tileName: { color: p.text, fontSize: 13.5, fontWeight: '800' },
  tileTag: { color: p.textMuted, fontSize: 11.5, marginTop: 2 },
  whoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  whoChip: {
    backgroundColor: p.accentSoft,
    borderWidth: 1,
    borderColor: p.accentBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  whoChipInf: { backgroundColor: p.warnSoft, borderColor: p.warnBorder },
  whoChipText: { color: p.text, fontSize: 12, fontWeight: '700' },
  footerBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: p.isDark ? p.modalBg : '#ffffff',
    borderTopWidth: 1,
    borderTopColor: p.divider,
    gap: 8,
  },
  footerHint: { color: p.warnText, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  footerOk: { color: p.okText, fontSize: 12.5, fontWeight: '800' },
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
