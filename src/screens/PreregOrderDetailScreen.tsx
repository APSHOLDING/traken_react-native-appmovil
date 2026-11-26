import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
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
import {
  assignPreregHotel,
  assignPreregHotelMany,
  getPreregDetail,
  joinManyPreregGroup,
  joinPreregGroup,
  PreregPaxItem,
  reopenPreregPax,
  unjoinPreregGroup,
} from '../api/client';
import SelectField from '../components/SelectField';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PreregOrderDetail'>;

type FilterKey = 'pendiente' | 'todos';

type BadgeTone = { text: string; color: string; bg: string };

// Oscuro: colores de siempre; claro: texto oscuro sobre fondo suave.
function tone(p: ThemeTokens, k: 'ok' | 'danger' | 'warn', text: string): BadgeTone {
  if (p.isDark) return { text, color: p[k], bg: p[k] + '33' };
  const c = k === 'ok' ? [p.okText, p.okSoft] : k === 'danger' ? [p.dangerText, p.dangerSoft] : [p.warnText, p.warnSoft];
  return { text, color: c[0], bg: c[1] };
}

function flightBadge(state: string, p: ThemeTokens): BadgeTone | null {
  if (state === 'ok') return tone(p, 'ok', 'Vuelo ✓');
  if (state === 'bad') return tone(p, 'danger', 'Vuelo no coincide');
  if (state === 'num') return tone(p, 'warn', 'Vuelo (otro código)');
  return null;
}

function voucherBadge(state: string, p: ThemeTokens): BadgeTone | null {
  if (state === 'ok') return tone(p, 'ok', 'Voucher ✓');
  if (state === 'other') return tone(p, 'danger', 'Voucher de otro pax');
  if (state === 'missing') return tone(p, 'warn', 'Voucher no encontrado');
  return null;
}

export default function PreregOrderDetailScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay } = route.params;

  const [pax, setPax] = useState<PreregPaxItem[]>([]);
  const [hotels, setHotels] = useState<{ id: number; name: string }[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [filter, setFilter] = useState<FilterKey>('pendiente');
  const [query, setQuery] = useState('');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkHotelFor, setBulkHotelFor] = useState(false);
  const [bulkJoinFor, setBulkJoinFor] = useState(false);

  const [joinPickerFor, setJoinPickerFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getPreregDetail(folio, idAirport);
      if (res.ok) {
        setPax(res.pax ?? []);
        setHotels(res.hotels ?? []);
        setToken(res.token ?? null);
      } else {
        setError(res.error ?? 'No se pudo cargar la información.');
      }
    } catch (e) {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [folio, idAirport]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pax.filter((p) => {
        if (filter === 'pendiente' && p.status !== 'pendiente') return false;
        if (!q) return true;
        return `${p.name} ${p.code} ${p.phone ?? ''} ${p.voucher ?? ''}`.toLowerCase().includes(q);
      }),
    [pax, filter, q]
  );

  const hotelOptions = useMemo(() => hotels.map((h) => ({ id: h.id, label: h.name })), [hotels]);
  const otherPaxOptions = useCallback(
    (excludeId: number) => pax.filter((p) => p.id !== excludeId).map((p) => ({ id: p.id, label: p.name })),
    [pax]
  );

  const handleAssign = async (id: number, idHotel: number) => {
    setBusyId(id);
    try {
      const res = await assignPreregHotel(id, idHotel);
      if (res.ok) {
        await load();
      } else {
        Alert.alert('No se pudo asignar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuitarHotel = async (id: number) => {
    setBusyId(id);
    try {
      const res = await assignPreregHotel(id, 0);
      if (res.ok) {
        await load();
      } else {
        Alert.alert('No se pudo quitar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnjoin = async (id: number) => {
    setBusyId(id);
    try {
      const res = await unjoinPreregGroup(id);
      if (res.ok) {
        await load();
      } else {
        Alert.alert('No se pudo separar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleJoin = async (id: number, target: number) => {
    setBusyId(id);
    try {
      const res = await joinPreregGroup(id, target);
      if (res.ok) {
        setJoinPickerFor(null);
        await load();
      } else {
        Alert.alert('No se pudo unir', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReopen = async (id: number) => {
    setBusyId(id);
    try {
      const res = await reopenPreregPax(id);
      if (res.ok) {
        await load();
      } else {
        Alert.alert('No se pudo reabrir', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkAssign = async (idHotel: number) => {
    setBulkHotelFor(false);
    try {
      const res = await assignPreregHotelMany(Array.from(selectedIds), idHotel);
      if (res.ok) {
        exitSelection();
        await load();
      } else {
        Alert.alert('No se pudo asignar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    }
  };

  const handleBulkJoin = async (leaderId: number) => {
    setBulkJoinFor(false);
    try {
      const ids = Array.from(selectedIds).filter((id) => id !== leaderId);
      const res = await joinManyPreregGroup(leaderId, ids);
      if (res.ok) {
        exitSelection();
        await load();
      } else {
        Alert.alert('No se pudo unir', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    }
  };

  const verQr = () => {
    if (!token) return;
    navigation.navigate('PreregQrDisplay', { folio, idAirport, folioDisplay, token });
  };

  const verListas = () => {
    navigation.navigate('PreregListas', { folio, idAirport, folioDisplay });
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
            <Text style={styles.topSub}>Pre-registro de Pax</Text>
          </View>
          <Pressable style={styles.backBtn} onPress={() => (selectionMode ? exitSelection() : setSelectionMode(true))}>
            <Text style={styles.selectToggle}>{selectionMode ? 'Listo' : 'Varios'}</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={p.accentText} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {token ? (
              <Pressable style={styles.tokenBox} onPress={verQr}>
                <Ionicons name="qr-code-outline" size={18} color={p.accentText} />
                <Text style={styles.tokenText} numberOfLines={1}>
                  QR de pre-registro de esta O.S. · toca para mostrarlo
                </Text>
                <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
              </Pressable>
            ) : null}

            <Pressable style={styles.tokenBox} onPress={verListas}>
              <Ionicons name="document-text-outline" size={18} color={p.accentText} />
              <Text style={styles.tokenText} numberOfLines={1}>
                Listas de aerolínea / subir lista con IA
              </Text>
              <Ionicons name="chevron-forward" size={16} color={p.textMuted} />
            </Pressable>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={p.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nombre, código, voucher..."
                placeholderTextColor={p.placeholder}
                style={styles.searchInput}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, filter === 'pendiente' && styles.chipActive]}
                onPress={() => setFilter('pendiente')}
              >
                <Text style={[styles.chipText, filter === 'pendiente' && styles.chipTextActive]}>Por asignar</Text>
              </Pressable>
              <Pressable style={[styles.chip, filter === 'todos' && styles.chipActive]} onPress={() => setFilter('todos')}>
                <Text style={[styles.chipText, filter === 'todos' && styles.chipTextActive]}>Todos</Text>
              </Pressable>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="person-add-outline" size={28} color={p.textMuted} />
                  <Text style={styles.emptyText}>
                    {filter === 'pendiente' ? 'No hay pasajeros por asignar.' : 'Todavía no hay pre-registros.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const fBadge = flightBadge(item.check.flight.state, p);
                const vBadge = voucherBadge(item.check.voucher.state, p);
                const isBusy = busyId === item.id;
                const isSelected = selectedIds.has(item.id);
                return (
                  <View style={[styles.card, p.shadowCard]}>
                    <View style={styles.cardTop}>
                      {selectionMode ? (
                        <Pressable onPress={() => toggleSelected(item.id)} hitSlop={8}>
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={isSelected ? p.accentText : p.textMuted}
                          />
                        </Pressable>
                      ) : null}
                      <Text style={styles.cardName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={[styles.statusPill, item.status === 'asignado' && styles.statusPillOk]}>
                        <Text style={styles.statusPillText}>{item.status === 'asignado' ? 'Asignado' : 'Pendiente'}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardSub}>
                      {item.party_size > 1 ? `${item.party_size} personas · ` : ''}
                      {item.phone ?? ''}
                      {item.voucher ? ` · Voucher ${item.voucher}` : ''}
                    </Text>

                    <View style={styles.badgeRow}>
                      {fBadge ? (
                        <View style={[styles.checkBadge, { backgroundColor: fBadge.bg }]}>
                          <Text style={[styles.checkBadgeText, { color: fBadge.color }]}>{fBadge.text}</Text>
                        </View>
                      ) : null}
                      {vBadge ? (
                        <View style={[styles.checkBadge, { backgroundColor: vBadge.bg }]}>
                          <Text style={[styles.checkBadgeText, { color: vBadge.color }]}>{vBadge.text}</Text>
                        </View>
                      ) : null}
                      {item.check.in_os ? (
                        <View style={[styles.checkBadge, { backgroundColor: p.isDark ? p.ok + '33' : p.okSoft }]}>
                          <Text style={[styles.checkBadgeText, { color: p.isDark ? p.ok : p.okText }]}>
                            Ya en la O.S. ({item.check.in_os.hotel})
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {item.comps.length > 0 ? (
                      <Text style={styles.compsText}>
                        Acompañantes: {item.comps.map((c) => c.name).join(', ')}
                      </Text>
                    ) : null}

                    {item.group_code ? (
                      <View style={styles.groupRow}>
                        <Text style={styles.groupText}>Parte de un grupo (código {item.group_code})</Text>
                        <Pressable onPress={() => handleUnjoin(item.id)} disabled={isBusy}>
                          <Text style={styles.groupSeparar}>Separar</Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {!selectionMode && (
                      <>
                        <View style={styles.hotelSection}>
                          {item.status === 'asignado' ? (
                            <View style={styles.hotelAsignadoRow}>
                              <Text style={styles.hotelAsignadoText} numberOfLines={1}>
                                🏨 {item.hotel_name}
                              </Text>
                              <Pressable onPress={() => handleQuitarHotel(item.id)} disabled={isBusy}>
                                <Text style={styles.quitarText}>Quitar</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <SelectField
                              label="Asignar hotel"
                              placeholder="Asignar hotel..."
                              options={hotelOptions}
                              selectedId={null}
                              onSelect={(idHotel) => handleAssign(item.id, idHotel)}
                              disabled={isBusy}
                              emptyText="Esta O.S. no tiene hoteles."
                            />
                          )}
                        </View>

                        <View style={styles.actionsRow}>
                          <Pressable style={styles.actionLink} onPress={() => setJoinPickerFor(item.id)} disabled={isBusy}>
                            <Ionicons name="people-outline" size={13} color={p.accentText} />
                            <Text style={styles.actionLinkText}>Unir a...</Text>
                          </Pressable>
                          {item.done_at ? (
                            <Pressable style={styles.actionLink} onPress={() => handleReopen(item.id)} disabled={isBusy}>
                              <Ionicons name="refresh-outline" size={13} color={p.accentText} />
                              <Text style={styles.actionLinkText}>Reabrir</Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {joinPickerFor === item.id ? (
                          <View style={styles.joinPickerWrap}>
                            <SelectField
                              label="Unir a..."
                              placeholder="Elige a quién unir..."
                              options={otherPaxOptions(item.id)}
                              selectedId={null}
                              onSelect={(target) => handleJoin(item.id, target)}
                              emptyText="No hay más pasajeros en esta O.S."
                            />
                            <Pressable onPress={() => setJoinPickerFor(null)} style={styles.joinCancel}>
                              <Text style={styles.joinCancelText}>Cancelar</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </>
                    )}

                    {isBusy ? <ActivityIndicator color={p.accentText} style={{ marginTop: 8 }} /> : null}
                  </View>
                );
              }}
            />

            {selectionMode && selectedIds.size > 0 ? (
              <View style={styles.bulkBar}>
                <Text style={styles.bulkCount}>{selectedIds.size} seleccionados</Text>
                <View style={styles.bulkActions}>
                  <Pressable style={styles.bulkBtn} onPress={() => setBulkHotelFor(true)}>
                    <Text style={styles.bulkBtnText}>Asignar hotel</Text>
                  </Pressable>
                  <Pressable style={styles.bulkBtn} onPress={() => setBulkJoinFor(true)}>
                    <Text style={styles.bulkBtnText}>Unir a...</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {bulkHotelFor ? (
              <View style={styles.bulkPickerOverlay}>
                <View style={[styles.bulkPickerCard, p.shadowCard]}>
                  <Text style={styles.bulkPickerTitle}>Asignar hotel a {selectedIds.size} pasajeros</Text>
                  <SelectField
                    label="Hotel"
                    placeholder="Elige el hotel..."
                    options={hotelOptions}
                    selectedId={null}
                    onSelect={handleBulkAssign}
                  />
                  <Pressable onPress={() => setBulkHotelFor(false)} style={styles.joinCancel}>
                    <Text style={styles.joinCancelText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {bulkJoinFor ? (
              <View style={styles.bulkPickerOverlay}>
                <View style={[styles.bulkPickerCard, p.shadowCard]}>
                  <Text style={styles.bulkPickerTitle}>Unir {selectedIds.size} pasajeros al grupo de...</Text>
                  <SelectField
                    label="Titular del grupo"
                    placeholder="Elige el titular..."
                    options={pax.filter((p) => selectedIds.has(p.id)).map((p) => ({ id: p.id, label: p.name }))}
                    selectedId={null}
                    onSelect={handleBulkJoin}
                  />
                  <Pressable onPress={() => setBulkJoinFor(false)} style={styles.joinCancel}>
                    <Text style={styles.joinCancelText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
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
  backBtn: { width: 46, height: 40, alignItems: 'center', justifyContent: 'center' },
  selectToggle: { color: p.accentText, fontWeight: '800', fontSize: 13 },
  topTitle: { color: p.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
  tokenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.accentSoft,
    borderWidth: 1,
    borderColor: p.accentBorder,
    borderRadius: radii.input,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tokenText: { flex: 1, color: p.text, fontSize: 11.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: p.text, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
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
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { flex: 1, color: p.text, fontWeight: '800', fontSize: 13.5 },
  statusPill: { backgroundColor: p.dangerSoft, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  statusPillOk: { backgroundColor: p.okSoft },
  statusPillText: { color: p.text, fontSize: 10, fontWeight: '800' },
  cardSub: { color: p.textMuted, fontSize: 11.5, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  checkBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  checkBadgeText: { fontSize: 10, fontWeight: '800' },
  compsText: { color: p.textMuted, fontSize: 11, marginTop: 8 },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  groupText: { color: p.textMuted, fontSize: 11 },
  groupSeparar: { color: p.dangerText, fontSize: 11, fontWeight: '700' },
  hotelSection: { marginTop: 10 },
  hotelAsignadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: p.okSoft,
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  hotelAsignadoText: { color: p.text, fontSize: 12.5, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  quitarText: { color: p.dangerText, fontSize: 11.5, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionLinkText: { color: p.accentText, fontSize: 11.5, fontWeight: '700' },
  joinPickerWrap: { marginTop: 10 },
  joinCancel: { alignItems: 'center', paddingVertical: 8 },
  joinCancelText: { color: p.textMuted, fontSize: 12 },
  bulkBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: p.modalBg,
    borderTopWidth: 1,
    borderTopColor: p.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkCount: { color: p.text, fontWeight: '700', fontSize: 12.5 },
  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  bulkBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12.5 },
  bulkPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: p.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bulkPickerCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: p.modalBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 18,
  },
  bulkPickerTitle: { color: p.text, fontSize: 14, fontWeight: '800', marginBottom: 14 },
});
