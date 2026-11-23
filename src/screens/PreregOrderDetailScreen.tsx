import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors, gradients, radii, shadow } from '../theme/colors';
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

function flightBadge(state: string): { text: string; color: string } | null {
  if (state === 'ok') return { text: 'Vuelo ✓', color: colors.ok };
  if (state === 'bad') return { text: 'Vuelo no coincide', color: colors.danger };
  if (state === 'num') return { text: 'Vuelo (otro código)', color: colors.warn };
  return null;
}

function voucherBadge(state: string): { text: string; color: string } | null {
  if (state === 'ok') return { text: 'Voucher ✓', color: colors.ok };
  if (state === 'other') return { text: 'Voucher de otro pax', color: colors.danger };
  if (state === 'missing') return { text: 'Voucher no encontrado', color: colors.warn };
  return null;
}

export default function PreregOrderDetailScreen({ route, navigation }: Props) {
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

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <LinearGradient colors={gradients.hero} style={styles.flex}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
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
          <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {token ? (
              <Pressable style={styles.tokenBox} onPress={verQr}>
                <Ionicons name="qr-code-outline" size={18} color={colors.teal} />
                <Text style={styles.tokenText} numberOfLines={1}>
                  QR de pre-registro de esta O.S. · toca para mostrarlo
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nombre, código, voucher..."
                placeholderTextColor={colors.placeholder}
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
                  <Ionicons name="person-add-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    {filter === 'pendiente' ? 'No hay pasajeros por asignar.' : 'Todavía no hay pre-registros.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const fBadge = flightBadge(item.check.flight.state);
                const vBadge = voucherBadge(item.check.voucher.state);
                const isBusy = busyId === item.id;
                const isSelected = selectedIds.has(item.id);
                return (
                  <View style={[styles.card, shadow.card]}>
                    <View style={styles.cardTop}>
                      {selectionMode ? (
                        <Pressable onPress={() => toggleSelected(item.id)} hitSlop={8}>
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={isSelected ? colors.teal : colors.textMuted}
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
                        <View style={[styles.checkBadge, { backgroundColor: fBadge.color + '33' }]}>
                          <Text style={[styles.checkBadgeText, { color: fBadge.color }]}>{fBadge.text}</Text>
                        </View>
                      ) : null}
                      {vBadge ? (
                        <View style={[styles.checkBadge, { backgroundColor: vBadge.color + '33' }]}>
                          <Text style={[styles.checkBadgeText, { color: vBadge.color }]}>{vBadge.text}</Text>
                        </View>
                      ) : null}
                      {item.check.in_os ? (
                        <View style={[styles.checkBadge, { backgroundColor: colors.ok + '33' }]}>
                          <Text style={[styles.checkBadgeText, { color: colors.ok }]}>
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
                            <Ionicons name="people-outline" size={13} color={colors.teal} />
                            <Text style={styles.actionLinkText}>Unir a...</Text>
                          </Pressable>
                          {item.done_at ? (
                            <Pressable style={styles.actionLink} onPress={() => handleReopen(item.id)} disabled={isBusy}>
                              <Ionicons name="refresh-outline" size={13} color={colors.teal} />
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

                    {isBusy ? <ActivityIndicator color={colors.teal} style={{ marginTop: 8 }} /> : null}
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
                <View style={[styles.bulkPickerCard, shadow.card]}>
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
                <View style={[styles.bulkPickerCard, shadow.card]}>
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

const styles = StyleSheet.create({
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
  selectToggle: { color: colors.teal, fontWeight: '800', fontSize: 13 },
  topTitle: { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  errorBox: { alignItems: 'center', gap: 10, padding: 30 },
  errorText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { color: '#06322f', fontWeight: '800', fontSize: 13 },
  tokenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(43,183,179,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(43,183,179,0.35)',
    borderRadius: radii.input,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tokenText: { flex: 1, color: colors.text, fontSize: 11.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#06322f' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { flex: 1, color: colors.white, fontWeight: '800', fontSize: 13.5 },
  statusPill: { backgroundColor: 'rgba(220,38,38,0.2)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  statusPillOk: { backgroundColor: 'rgba(22,163,74,0.22)' },
  statusPillText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  cardSub: { color: colors.textMuted, fontSize: 11.5, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  checkBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  checkBadgeText: { fontSize: 10, fontWeight: '800' },
  compsText: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  groupText: { color: colors.textMuted, fontSize: 11 },
  groupSeparar: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  hotelSection: { marginTop: 10 },
  hotelAsignadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(22,163,74,0.14)',
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  hotelAsignadoText: { color: colors.text, fontSize: 12.5, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  quitarText: { color: colors.danger, fontSize: 11.5, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionLinkText: { color: colors.teal, fontSize: 11.5, fontWeight: '700' },
  joinPickerWrap: { marginTop: 10 },
  joinCancel: { alignItems: 'center', paddingVertical: 8 },
  joinCancelText: { color: colors.textMuted, fontSize: 12 },
  bulkBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.navy2,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bulkCount: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkBtn: { backgroundColor: colors.teal, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  bulkBtnText: { color: '#06322f', fontWeight: '800', fontSize: 12.5 },
  bulkPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  bulkPickerCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.navy2,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 18,
  },
  bulkPickerTitle: { color: colors.white, fontSize: 14, fontWeight: '800', marginBottom: 14 },
});
