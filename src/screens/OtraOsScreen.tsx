import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { confirmOtraOsCode, OtraOsItem, requestOtraOsCode, searchOtraOs } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'OtraOs'>;

/**
 * Mover un pasajero de OTRA O.S. (misma estación) a esta -- equivalente de
 * op/modulos/open/otraOs.php. Flujo de 3 pasos: buscar -> pedir código
 * (le llega a Santiago, con copia a Gerencia TI) -> confirmar código. El
 * movimiento real queda pendiente hasta guardar en AddPaxScreen (el token
 * se manda ahí como otra_os_tokens).
 */
export default function OtraOsScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, iata, typeAirline } = route.params;

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<OtraOsItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [solId, setSolId] = useState<number | null>(null);
  const [pendingItem, setPendingItem] = useState<OtraOsItem | null>(null);
  const [codigo, setCodigo] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchOtraOs(folio, idAirport, q);
        if (!cancelled) setItems(res.ok ? res.items ?? [] : []);
      } catch (e) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, folio, idAirport]);

  const handlePedirCodigo = async (item: OtraOsItem) => {
    setBusyId(item.id);
    try {
      const res = await requestOtraOsCode(folio, idAirport, item.id);
      if (res.ok && res.sol_id) {
        setSolId(res.sol_id);
        setPendingItem(item);
        setCodigo('');
        Alert.alert('Código enviado', 'Se mandó un código de 6 dígitos por correo a Santiago (con copia a Gerencia TI). Pídeselo para confirmar.');
      } else {
        Alert.alert('No se pudo pedir el código', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo pedir el código. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmar = async () => {
    if (!solId || !pendingItem || codigo.trim().length < 6) return;
    setIsConfirming(true);
    try {
      const res = await confirmOtraOsCode(folio, idAirport, solId, codigo.trim());
      if (res.ok && res.token && res.pax) {
        setSolId(null);
        setPendingItem(null);
        navigation.navigate('AddPax', {
          folio,
          idAirport,
          folioDisplay,
          iata,
          typeAirline,
          otraOsPrefill: {
            token: res.token,
            name: res.pax.nombre,
            tipo: res.pax.tipo,
            edad: res.pax.edad,
            voucher: res.pax.voucher,
          },
        });
      } else {
        Alert.alert('No se pudo confirmar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo confirmar. Intenta de nuevo.');
    } finally {
      setIsConfirming(false);
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
            <Text style={styles.topTitle}>O.S. {folioDisplay}</Text>
            <Text style={styles.topSub}>Mover pasajero de otra O.S.</Text>
          </View>
          <BrandMark />
        </View>

        <View style={styles.introBox}>
          <Text style={styles.introText}>
            Busca por nombre o folio a un pasajero que esté en OTRA O.S. abierta de esta misma estación. Se pedirá un
            código de confirmación por correo antes de moverlo.
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={p.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nombre o folio..."
            placeholderTextColor={p.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching ? <ActivityIndicator color={p.accent} size="small" /> : null}
        </View>

        <FlatList
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            query.trim().length >= 3 && !isSearching ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={28} color={p.textMuted} />
                <Text style={styles.emptyText}>No encontré a nadie con ese nombre/folio en otra O.S. abierta.</Text>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            const isBusy = busyId === item.id;
            return (
              <View style={[styles.card, p.shadowCard]}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.nombre}
                </Text>
                <Text style={styles.cardSub}>
                  O.S. {item.os}
                  {item.hotel ? ` · ${item.hotel}` : ''} · {item.tipo}
                </Text>
                <Pressable style={styles.pedirBtn} onPress={() => handlePedirCodigo(item)} disabled={isBusy}>
                  {isBusy ? (
                    <ActivityIndicator color={p.onAccent} size="small" />
                  ) : (
                    <Text style={styles.pedirBtnText}>Pedir código para moverlo aquí</Text>
                  )}
                </Pressable>
              </View>
            );
          }}
        />

        <Modal visible={!!pendingItem} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, p.shadowCard]}>
              <Text style={styles.modalTitle}>Confirmar movimiento</Text>
              <Text style={styles.modalText}>
                Código de 6 dígitos enviado a Santiago para mover a {pendingItem?.nombre} desde la O.S. {pendingItem?.os}{' '}
                hasta aquí.
              </Text>
              <TextInput
                value={codigo}
                onChangeText={(t) => setCodigo(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={p.placeholder}
                style={styles.modalInput}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setSolId(null);
                    setPendingItem(null);
                  }}
                  disabled={isConfirming}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirmBtn, codigo.trim().length < 6 && styles.modalConfirmBtnDisabled]}
                  onPress={handleConfirmar}
                  disabled={codigo.trim().length < 6 || isConfirming}
                >
                  {isConfirming ? (
                    <ActivityIndicator color={p.onAccent} size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Confirmar</Text>
                  )}
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: p.text, fontSize: 14 },
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
  cardName: { color: p.text, fontWeight: '800', fontSize: 13.5 },
  cardSub: { color: p.textMuted, fontSize: 11.5, marginTop: 3 },
  pedirBtn: {
    marginTop: 10,
    backgroundColor: p.accent,
    borderRadius: radii.button,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pedirBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 12.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: p.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: p.modalBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    padding: 20,
  },
  modalTitle: { color: p.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  modalText: { color: p.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  modalInput: {
    backgroundColor: p.inputBg,
    borderWidth: p.isDark ? 0 : 1,
    borderColor: p.inputBorder,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 50,
    color: p.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: p.textMuted, fontWeight: '700', fontSize: 13 },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: p.accent,
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmBtnDisabled: { opacity: 0.5 },
  modalConfirmText: { color: p.onAccent, fontWeight: '800', fontSize: 13 },
});
