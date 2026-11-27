import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Loading from '../components/Loading';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getHotelSuggestions, getHotelsForOrder, getOpenOrders, HotelSuggestion, OpenOrderDTO } from '../api/client';
import { addPax } from '../api/queuedWrites';
import { getCache, saveCache } from '../utils/offlineCache';
import { useOfflineLoad } from '../utils/useOfflineLoad';
import { CaptureRoom, CapturePax, OCUPATION_CAP, OCUPATION_NAME, parseCapture } from '../utils/quickCapture';
import { logEvent } from '../utils/activityLog';
import VoucherScanButton from '../components/VoucherScanButton';
import type { RootStackParamList } from '../navigation/RootNavigator';
import BrandMark from '../components/BrandMark';

type Props = NativeStackScreenProps<RootStackParamList, 'QuickCapture'>;
type HotelInfo = { hotels: { id: number; name: string; rooms_dis: number }[]; defaultFSalida: string; defaultHora: string };

const EXAMPLE =
  'Juan Perez y Maria Lopez, doble, hotel Fiesta, salida 28 nov 6am\nPedro Gomez, sencilla, voucher AB123';
const HOTEL_MSG = 'Falta elegir el hotel';
const TIPO: Record<string, string> = { adulto: 'Adulto', nino: 'Niño', infante: 'Infante' };

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
}

/**
 * Captura rapida (BETA) -- se escribe o dicta (con el microfono del teclado) en
 * texto normal y la app arma las habitaciones para revisarlas y confirmarlas.
 * Funciona sin internet: lo confirmado se guarda en el telefono y se envia solo
 * cuando vuelva la señal (igual que "Agregar pasajero").
 */
export default function QuickCaptureScreen({ navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [order, setOrder] = useState<OpenOrderDTO | null>(null);
  const [text, setText] = useState('');
  const [rooms, setRooms] = useState<CaptureRoom[] | null>(null);
  const [hotelInfo, setHotelInfo] = useState<HotelInfo | null>(null);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [suggest, setSuggest] = useState<HotelSuggestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [micTip, setMicTip] = useState(false);
  const inputRef = React.useRef<React.ElementRef<typeof TextInput>>(null);

  // El texto escrito no se pierde si sales de la pantalla o se cierra la app.
  useEffect(() => {
    getCache<string>('quick_capture_draft')
      .then((c) => {
        if (c && typeof c.data === 'string') setText((cur) => (cur ? cur : c.data));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      saveCache('quick_capture_draft', text).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [text]);

  const pasteFromClipboard = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (!clip || !clip.trim()) {
        Alert.alert('Portapapeles vacío', 'Copia primero la lista (por ejemplo desde WhatsApp) y vuelve a tocar «Pegar».');
        return;
      }
      setText((cur) => (cur.trim() ? cur.replace(/\s+$/, '') + '\n' + clip.trim() : clip.trim()));
    } catch (e) {
      Alert.alert('No se pudo pegar', 'Mantén presionado el cuadro de texto y elige «Pegar».');
    }
  };

  const { data: openData, isLoading, error, reload } = useOfflineLoad(
    'open_orders',
    getOpenOrders,
    (res) => ({ orders: res.orders ?? [], totalAnteriores: res.total_anteriores ?? 0 }),
    []
  );
  const orders = openData?.orders ?? [];

  // Hoteles de la O.S. elegida (con internet; si no, lo ultimo guardado).
  const loadHotels = useCallback(async (o: OpenOrderDTO) => {
    setLoadingHotels(true);
    const key = `add_pax_hotels_${o.folio}_${o.id_airport}`;
    try {
      const res = await getHotelsForOrder(o.folio, o.id_airport);
      if (res.ok) {
        const info: HotelInfo = {
          hotels: (res.hotels ?? []).filter((h) => h.rooms_dis !== 0),
          defaultFSalida: res.default_date_out ? res.default_date_out.slice(0, 10) : '',
          defaultHora: res.default_hour ? res.default_hour.slice(0, 5) : '',
        };
        setHotelInfo(info);
        await saveCache(key, info);
      } else {
        setHotelInfo({ hotels: [], defaultFSalida: '', defaultHora: '' });
      }
    } catch (e) {
      const cached = await getCache<HotelInfo>(key);
      setHotelInfo(cached ? cached.data : { hotels: [], defaultFSalida: '', defaultHora: '' });
    } finally {
      setLoadingHotels(false);
    }
  }, []);

  useEffect(() => {
    if (!order) return;
    loadHotels(order);
    // Sugerencias: lo ultimo guardado al instante y, con internet, actualizadas.
    const key = `hotel_suggest_${order.folio}_${order.id_airport}`;
    let cancelled = false;
    getCache<HotelSuggestion[]>(key).then((c) => !cancelled && c && setSuggest(c.data)).catch(() => {});
    getHotelSuggestions(order.folio, order.id_airport)
      .then((r) => {
        if (cancelled || !r.ok) return;
        setSuggest(r.ranking ?? []);
        saveCache(key, r.ranking ?? []).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order, loadHotels]);

  const showOcupation = !!order && (order.type_airline === 'ep' || (order.type_airline === 'all' && order.id_airport === 14));

  const interpret = () => {
    if (!order || !hotelInfo) return;
    const parsed = parseCapture(text, {
      hotels: hotelInfo.hotels,
      defaultDate: hotelInfo.defaultFSalida,
      defaultHora: hotelInfo.defaultHora,
      showOcupation,
    });
    if (parsed.length === 0) {
      Alert.alert('No encontré pasajeros', 'Escribe al menos un nombre. Ejemplo:\n\n' + EXAMPLE);
      return;
    }
    // Si no mencionaron hotel, se propone el recomendado (se ve y se puede cambiar antes de confirmar).
    const top = suggest.find((x) => hotelInfo.hotels.some((h) => h.id === x.id));
    if (top) {
      parsed.forEach((r) => {
        if (r.idHotel === null) {
          r.idHotel = top.id;
          r.hotelName = top.name;
          r.notes = [...r.notes, '💡 Hotel sugerido por uso con la aerolínea, acuerdo comercial y disponibilidad (cámbialo si quieres)'];
        }
      });
    }
    logEvent('captura_rapida', {
      text: `Interpretó ${parsed.length} habitación(es) del texto: ${text.replace(/\s+/g, ' ').slice(0, 600)}`,
      folio: order.folio,
      id_airport: order.id_airport,
    });
    setRooms(parsed);
  };

  /** Lo que falta o esta mal en una habitacion, calculado en vivo (se corrige editando el formulario). */
  const validate = (r: CaptureRoom): string[] => {
    const out: string[] = [];
    if (r.idHotel === null) out.push('Falta elegir el hotel');
    if (showOcupation && !r.ocupation) out.push('Falta el tipo de habitación');
    r.pax.forEach((x, i) => {
      if (!x.name.trim()) out.push(`Falta el nombre del pasajero ${i + 1}`);
    });
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.fSalida.trim());
    const dt = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : null;
    if (!d || !dt || dt.getMonth() !== Number(d[2]) - 1 || dt.getDate() !== Number(d[3])) out.push('La fecha debe ser AAAA-MM-DD (ej. 2026-11-28)');
    const h = /^(\d{1,2}):(\d{2})$/.exec(r.hora.trim());
    if (!h || Number(h[1]) > 23 || Number(h[2]) > 59) out.push('La hora debe ser HH:MM (ej. 06:00)');
    if (showOcupation && r.ocupation && OCUPATION_CAP[r.ocupation]) {
      const people = r.pax.filter((x) => x.type !== 'infante' && x.name.trim()).length;
      if (people > OCUPATION_CAP[r.ocupation]) out.push(`Caben ${OCUPATION_CAP[r.ocupation]} en ${OCUPATION_NAME[r.ocupation]} y hay ${people} (los infantes no cuentan)`);
    }
    return out;
  };

  const updateRoom = (roomId: number, patch: Partial<CaptureRoom>) =>
    setRooms((prev) => (prev ?? []).map((r) => (r.id === roomId ? { ...r, ...patch } : r)));

  const updatePax = (roomId: number, idx: number, patch: Partial<CapturePax>) =>
    setRooms((prev) => (prev ?? []).map((r) => (r.id === roomId ? { ...r, pax: r.pax.map((x, i) => (i === idx ? { ...x, ...patch } : x)) } : r)));

  const addPaxTo = (roomId: number) =>
    setRooms((prev) => (prev ?? []).map((r) => (r.id === roomId ? { ...r, pax: [...r.pax, { name: '', type: 'adulto' }] } : r)));

  const removePaxFrom = (roomId: number, idx: number) =>
    setRooms((prev) => (prev ?? []).map((r) => (r.id === roomId ? { ...r, pax: r.pax.filter((_, i) => i !== idx) } : r)));

  const setRoomHotel = (roomId: number, hotelId: number) => {
    const h = hotelInfo?.hotels.find((x) => x.id === hotelId);
    updateRoom(roomId, { idHotel: hotelId, hotelName: h ? h.name.trim() : '' });
  };

  const removeRoom = (roomId: number) => setRooms((prev) => (prev ?? []).filter((r) => r.id !== roomId));

  const blocked = (rooms ?? []).length === 0 || (rooms ?? []).some((r) => validate(r).length > 0);

  const confirm = async () => {
    if (!order || !rooms || blocked || isSaving) return;
    setIsSaving(true);
    let saved = 0;
    let queued = 0;
    let remaining = [...rooms];
    try {
      for (const r of rooms) {
        const res = await addPax({
          id_order: order.folio,
          id_airport: order.id_airport,
          id_hotel: r.idHotel as number,
          type_airline: order.type_airline,
          ocupation: showOcupation ? r.ocupation : undefined,
          passengers: r.pax.map((x) => ({
            name: x.name,
            voucher: r.voucher,
            f_salida: r.fSalida,
            hora: r.hora,
            type: x.type,
            chek: 0,
            age_c: 0,
            age_i: 0,
            breakfast: 0,
            lunch: 0,
            dinner: 0,
          })),
        });
        if (res.status === 'dispo') {
          Alert.alert('Sin disponibilidad', `${r.hotelName || 'Ese hotel'} ya no tiene habitaciones disponibles. Elige otro hotel para esa habitación.`);
          break;
        }
        if (!res.ok) {
          Alert.alert('No se pudo guardar', res.error ?? res.msg ?? 'Intenta de nuevo.');
          break;
        }
        saved += 1;
        if (res.queued) queued += 1;
        remaining = remaining.filter((x) => x.id !== r.id);
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo guardar. Lo que ya se guardó no se duplica; revisa e intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
    if (saved > 0) {
      logEvent('captura_rapida', {
        text: `Confirmó ${saved} habitación(es)${queued ? ' (guardadas sin internet)' : ''}: ` + rooms.slice(0, saved).map((x) => x.pax.map((y) => y.name).join(' + ')).join(' | '),
        folio: order.folio,
        id_airport: order.id_airport,
      });
    }
    setRooms(remaining.length ? remaining : null);
    if (saved > 0 && remaining.length === 0) {
      Alert.alert(
        queued ? 'Guardado sin conexión' : 'Listo',
        `${saved} habitación${saved === 1 ? '' : 'es'} ${queued ? 'guardada(s) en el teléfono; se enviarán solas cuando vuelva el internet' : 'agregada(s) a la O.S.'}.`,
        [{ text: 'Aceptar', onPress: () => navigation.goBack() }]
      );
      setText('');
      saveCache('quick_capture_draft', '').catch(() => {});
    }
  };

  const TopBar = (
    <View style={styles.topBar}>
      <Pressable
        style={styles.backBtn}
        onPress={() => (rooms ? setRooms(null) : order ? setOrder(null) : navigation.goBack())}
        hitSlop={10}
      >
        <Ionicons name="arrow-back" size={20} color={p.text} />
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <View style={styles.titleRow}>
          <Text style={styles.topTitle}>Captura rápida</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </View>
        <Text style={styles.topSub}>{order ? `${order.folio_display} · ${order.iata}` : 'Escribe o dicta los pasajeros'}</Text>
      </View>
      <BrandMark />
    </View>
  );

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        {TopBar}

        {!order ? (
          // ---------- PASO 1: elegir O.S. ----------
          isLoading ? (
            <Loading style={{ marginTop: 40 }} />
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{error}</Text>
              <Pressable style={styles.primaryBtn} onPress={reload}>
                <Text style={styles.primaryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(o) => `${o.folio}-${o.id_airport}`}
              contentContainerStyle={styles.content}
              ListHeaderComponent={
                <View>
                  <View style={[styles.explain, p.shadowCard]}>
                    <View style={styles.explainHead}>
                      <Ionicons name="flash" size={18} color={p.accentText} />
                      <Text style={styles.explainTitle}>¿Qué es la Captura rápida?</Text>
                    </View>
                    <Text style={styles.explainText}>
                      En lugar de llenar el formulario campo por campo, escribes (o dictas con el micrófono del teclado) a los
                      pasajeros como lo dirías hablando. La app arma las habitaciones y te las muestra para que las revises y
                      confirmes. Sirve sin internet: se guarda en el teléfono y se envía cuando vuelva la señal.
                    </Text>
                    <Text style={styles.explainBeta}>
                      🧪 Versión BETA (prueba): siempre revisa el resumen antes de confirmar. Si algo no sale bien, usa «Agregar
                      pasajero».
                    </Text>
                  </View>
                  <Text style={styles.sectionTitle}>1. ¿En qué O.S. vas a capturar?</Text>
                </View>
              }
              ListEmptyComponent={<Text style={styles.muted}>No hay O.S. abiertas guardadas todavía.</Text>}
              renderItem={({ item }) => (
                <Pressable style={[styles.osCard, p.shadowCard]} onPress={() => setOrder(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.osTitle}>
                      {item.folio_display} · {item.iata}
                    </Text>
                    <Text style={styles.osSub} numberOfLines={1}>
                      {item.airline}
                      {item.flight ? ` · ${item.flight}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={p.textMuted} />
                </Pressable>
              )}
            />
          )
        ) : !rooms ? (
          // ---------- PASO 2: escribir ----------
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>2. Escribe o dicta los pasajeros</Text>
              <Text style={styles.hint}>
                Una habitación por renglón. Puedes decir: nombres, tipo de habitación (sencilla/doble/triple/cuádruple), hotel,
                «salida 28 nov» y hora («6am»). Puedes decirlo natural: «Juan con su esposa María y su hijo Pedro de 5 años». La app toma solo los nombres y
                marca niño o infante sola (no se mete «hijo» como nombre). Si lo dictas, di «otra habitación» entre una y otra.
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.dictBtn}
                  onPress={() => {
                    setMicTip(true);
                    inputRef.current?.focus();
                  }}
                >
                  <Ionicons name="mic" size={18} color={p.onAccent} />
                  <Text style={styles.dictText}>Dictar</Text>
                </Pressable>
              </View>
              {micTip ? (
                <View style={styles.tipBox}>
                  <Text style={styles.tipText}>
                    🎤 Ya se abrió el teclado. Toca el micrófono del teclado (a un lado de la barra espaciadora; en Samsung/Google dice «Voz») y habla. No importa si el texto sale mal escrito: se entiende igual y lo revisas antes de guardar.
                  </Text>
                </View>
              ) : null}
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                multiline
                placeholder={EXAMPLE}
                placeholderTextColor={p.textMuted}
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
              <View style={styles.linksRow}>
                <Pressable onPress={pasteFromClipboard} hitSlop={8} style={styles.linkBtn}>
                  <Ionicons name="clipboard-outline" size={14} color={p.accentText} />
                  <Text style={styles.linkText}>Pegar</Text>
                </Pressable>
                <Pressable onPress={() => setText(EXAMPLE)} hitSlop={8} style={styles.linkBtn}>
                  <Ionicons name="bulb-outline" size={14} color={p.accentText} />
                  <Text style={styles.linkText}>Usar un ejemplo</Text>
                </Pressable>
                {text.length > 0 ? (
                  <Pressable onPress={() => setText('')} hitSlop={8} style={styles.linkBtn}>
                    <Ionicons name="close-circle-outline" size={14} color={p.textMuted} />
                    <Text style={[styles.linkText, { color: p.textMuted }]}>Borrar</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.hint, { marginTop: 14 }]}>
                📷 ¿Tienes el voucher o una identificación? Tómale foto y la app lee el nombre y lo agrega al texto.
              </Text>
              <VoucherScanButton
                idOrder={order!.folio}
                idAirport={order!.id_airport}
                onNameDetected={(name) => setText((cur) => (cur.trim() ? cur.replace(/\s+$/, '') + '\n' : '') + name)}
              />
              {loadingHotels ? (
                <Text style={[styles.hint, { marginTop: 10 }]}>Cargando hoteles de la O.S.…</Text>
              ) : hotelInfo && hotelInfo.hotels.length === 0 ? (
                <Text style={[styles.hint, { marginTop: 10, color: p.warnText }]}>
                  No hay hoteles guardados para esta O.S. (abre «Agregar pasajero» una vez con internet).
                </Text>
              ) : null}
              <Pressable
                style={[styles.primaryBtn, (!text.trim() || !hotelInfo) && styles.btnDisabled]}
                disabled={!text.trim() || !hotelInfo}
                onPress={interpret}
              >
                <Ionicons name="sparkles" size={16} color={p.onAccent} />
                <Text style={styles.primaryText}>Interpretar y ver resumen</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          // ---------- PASO 3: revisar y confirmar ----------
          <View style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.sectionTitle}>3. Revisa y confirma</Text>
              <Text style={styles.hint}>
                Así quedaría en «Agregar pasajero». Puedes corregir cualquier dato aquí mismo; lo marcado en rojo hay que arreglarlo
                para poder confirmar.
              </Text>
              {rooms.map((r, i) => {
                const probs = validate(r);
                return (
                  <View key={r.id} style={[styles.roomCard, p.shadowCard, probs.length > 0 && styles.roomCardBad]}>
                    <View style={styles.roomHead}>
                      <Text style={styles.roomTitle}>Habitación {i + 1}</Text>
                      <Pressable onPress={() => removeRoom(r.id)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={18} color={p.dangerText} />
                      </Pressable>
                    </View>

                    <Text style={styles.fieldLabel}>Hotel</Text>
                    <View style={styles.chipRow}>
                      {[...(hotelInfo?.hotels ?? [])]
                        .sort((a, b) => {
                          const ia = suggest.findIndex((x) => x.id === a.id);
                          const ib = suggest.findIndex((x) => x.id === b.id);
                          return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                        })
                        .map((h) => (
                        <Pressable key={h.id} style={[styles.chip, r.idHotel === h.id && styles.chipOn]} onPress={() => setRoomHotel(r.id, h.id)}>
                          <Text style={[styles.chipText, r.idHotel === h.id && styles.chipTextOn]}>
                            {suggest[0]?.id === h.id ? '⭐ ' : ''}
                            {h.name.trim()}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {showOcupation ? (
                      <>
                        <Text style={styles.fieldLabel}>Tipo de habitación</Text>
                        <View style={styles.chipRow}>
                          {Object.keys(OCUPATION_NAME).map((code) => (
                            <Pressable key={code} style={[styles.chip, r.ocupation === code && styles.chipOn]} onPress={() => updateRoom(r.id, { ocupation: code })}>
                              <Text style={[styles.chipText, r.ocupation === code && styles.chipTextOn]}>{OCUPATION_NAME[code]}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}

                    {r.pax.map((x, k) => (
                      <View key={k} style={styles.paxBox}>
                        <View style={styles.paxBoxHead}>
                          <Text style={styles.fieldLabel}>Pasajero {k + 1}</Text>
                          {r.pax.length > 1 ? (
                            <Pressable onPress={() => removePaxFrom(r.id, k)} hitSlop={8}>
                              <Ionicons name="close-circle" size={18} color={p.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                        <TextInput
                          style={styles.field}
                          value={x.name}
                          onChangeText={(v) => updatePax(r.id, k, { name: v })}
                          placeholder="Nombre completo"
                          placeholderTextColor={p.textMuted}
                          autoCapitalize="words"
                        />
                        <View style={styles.chipRow}>
                          {(['adulto', 'nino', 'infante'] as const).map((tp) => (
                            <Pressable key={tp} style={[styles.chip, x.type === tp && styles.chipOn]} onPress={() => updatePax(r.id, k, { type: tp })}>
                              <Text style={[styles.chipText, x.type === tp && styles.chipTextOn]}>{TIPO[tp]}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                    <Pressable onPress={() => addPaxTo(r.id)} hitSlop={8} style={styles.linkBtn}>
                      <Ionicons name="person-add-outline" size={14} color={p.accentText} />
                      <Text style={styles.linkText}>Agregar otro pasajero a esta habitación</Text>
                    </Pressable>

                    <View style={styles.twoCols}>
                      <View style={{ flex: 1.3 }}>
                        <Text style={styles.fieldLabel}>Fecha de salida</Text>
                        <TextInput style={styles.field} value={r.fSalida} onChangeText={(v) => updateRoom(r.id, { fSalida: v })} placeholder="AAAA-MM-DD" placeholderTextColor={p.textMuted} keyboardType="numbers-and-punctuation" />
                        {r.fSalida ? <Text style={styles.note}>{prettyDate(r.fSalida)}</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Hora</Text>
                        <TextInput style={styles.field} value={r.hora} onChangeText={(v) => updateRoom(r.id, { hora: v })} placeholder="HH:MM" placeholderTextColor={p.textMuted} keyboardType="numbers-and-punctuation" />
                      </View>
                    </View>

                    <Text style={styles.fieldLabel}>Voucher (opcional)</Text>
                    <TextInput style={styles.field} value={r.voucher} onChangeText={(v) => updateRoom(r.id, { voucher: v })} placeholder="Número de voucher" placeholderTextColor={p.textMuted} autoCapitalize="characters" />

                    {probs.map((m, k) => (
                      <Text key={'p' + k} style={styles.problem}>
                        ⚠ {m}
                      </Text>
                    ))}
                    {r.notes.map((m, k) => (
                      <Text key={'n' + k} style={styles.note}>
                        ℹ {m}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.footerBar}>
              <Pressable style={[styles.primaryBtn, (blocked || isSaving) && styles.btnDisabled]} disabled={blocked || isSaving} onPress={confirm}>
                {isSaving ? (
                  <ActivityIndicator color={p.onAccent} />
                ) : (
                  <Text style={styles.primaryText}>
                    {blocked ? 'Corrige lo marcado para confirmar' : `Confirmar ${rooms.length} habitación${rooms.length === 1 ? '' : 'es'}`}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (p: ThemeTokens) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { alignItems: 'center', gap: 12, padding: 30 },
    muted: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 8,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    topTitle: { color: p.text, fontSize: 15, fontWeight: '800' },
    topSub: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
    betaPill: { backgroundColor: p.warnSoft, borderWidth: 1, borderColor: p.warnBorder, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
    betaText: { color: p.warnText, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
    content: { padding: 16, paddingBottom: 40 },
    explain: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: radii.card, padding: 14, marginBottom: 16 },
    explainHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    explainTitle: { color: p.text, fontSize: 14, fontWeight: '800' },
    explainText: { color: p.textMuted, fontSize: 12.5, lineHeight: 18 },
    explainBeta: { color: p.warnText, fontSize: 12, lineHeight: 17, marginTop: 8, fontWeight: '700' },
    sectionTitle: { color: p.text, fontWeight: '800', fontSize: 14, marginBottom: 8 },
    hint: { color: p.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
    osCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: radii.card,
      padding: 14,
      marginBottom: 10,
    },
    osTitle: { color: p.text, fontSize: 14, fontWeight: '800' },
    osSub: { color: p.textMuted, fontSize: 12, marginTop: 2 },
    input: {
      minHeight: 150,
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: radii.input,
      padding: 12,
      color: p.text,
      fontSize: 15,
      lineHeight: 21,
    },
    linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    linkText: { color: p.accentText, fontSize: 12.5, fontWeight: '700' },
    primaryBtn: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: p.accent,
      borderRadius: radii.button,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      paddingHorizontal: 16,
    },
    primaryText: { color: p.onAccent, fontWeight: '800', fontSize: 14.5 },
    btnDisabled: { opacity: 0.5 },
    roomCard: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: radii.card, padding: 14, marginBottom: 12 },
    roomCardBad: { borderColor: p.dangerText },
    roomHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    roomTitle: { color: p.text, fontSize: 14, fontWeight: '800' },
    paxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    paxName: { color: p.text, fontSize: 14, flex: 1 },
    paxType: { color: p.textMuted, fontSize: 11.5, fontWeight: '700' },
    metaRow: { marginTop: 8, gap: 3 },
    metaText: { color: p.textMuted, fontSize: 12.5 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    chip: { backgroundColor: p.card, borderWidth: 1, borderColor: p.cardBorder, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    chipOn: { backgroundColor: p.accent, borderColor: p.accent },
    chipText: { color: p.text, fontSize: 12, fontWeight: '700' },
    chipTextOn: { color: p.onAccent },
    fieldLabel: { color: p.textMuted, fontSize: 11.5, fontWeight: '800', marginTop: 12, marginBottom: 5 },
    field: { backgroundColor: p.isDark ? p.modalBg : '#ffffff', borderWidth: 1, borderColor: p.cardBorder, borderRadius: radii.input, paddingHorizontal: 12, height: 44, color: p.text, fontSize: 14.5 },
    paxBox: { borderTopWidth: 1, borderTopColor: p.divider, marginTop: 6 },
    paxBoxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    twoCols: { flexDirection: 'row', gap: 10 },
    actionsRow: { flexDirection: 'row', marginBottom: 10 },
    dictBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: p.accent, borderRadius: 24, paddingHorizontal: 18, height: 44 },
    dictText: { color: p.onAccent, fontWeight: '800', fontSize: 14 },
    tipBox: { backgroundColor: p.warnSoft, borderWidth: 1, borderColor: p.warnBorder, borderRadius: radii.input, padding: 10, marginBottom: 10 },
    tipText: { color: p.warnText, fontSize: 12, lineHeight: 17 },
    problem: { color: p.dangerText, fontSize: 12, fontWeight: '700', marginTop: 8 },
    note: { color: p.textMuted, fontSize: 11.5, marginTop: 4 },
    footerBar: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 12,
      backgroundColor: p.isDark ? p.modalBg : '#ffffff',
      borderTopWidth: 1,
      borderTopColor: p.divider,
    },
  });
