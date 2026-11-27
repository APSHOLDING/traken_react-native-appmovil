import React, { useCallback, useState } from 'react';
import Loading from '../components/Loading';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getOrderPax } from '../api/client';
import { useOfflineLoad, formatSavedAt } from '../utils/useOfflineLoad';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'EditPaxList'>;

/**
 * Lista + buscador de pasajeros ya registrados en la O.S. -- equivalente
 * "modo movil" del boton "Editar" que en la web abre op/modulos/open/edit.php
 * (un formulario gigante con TODOS los pasajeros de la orden a la vez).
 * En ordenes reales con decenas o cientos de pasajeros esa pantalla no
 * tiene sentido en un celular, asi que aqui se busca a la persona y se
 * edita una por una (EditPaxScreen).
 */
export default function EditPaxListScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, iata, typeAirline } = route.params;

  const [query, setQuery] = useState('');

  const {
    data: items,
    isLoading,
    error,
    offlineSince,
    reload,
  } = useOfflineLoad(
    `edit_pax_list_${folio}_${idAirport}`,
    () => getOrderPax(folio, idAirport),
    (res) => res.items ?? [],
    [folio, idAirport]
  );

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const q = query.trim().toLowerCase();
  const list = items ?? [];
  const filtered = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;

  return (
    <LinearGradient colors={p.bg} style={styles.flex}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={p.text} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Editar Pasajero</Text>
            <Text style={styles.topSub}>#{folioDisplay}{iata ? ' · ' + iata : ''}</Text>
          </View>
          <BrandMark />
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={p.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nombre..."
            placeholderTextColor={p.placeholder}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>

        {isLoading ? (
          <Loading style={{ marginTop: 30 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={p.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reload}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            ListHeaderComponent={
              offlineSince ? (
                <View style={styles.offlineBanner}>
                  <Ionicons name="cloud-offline-outline" size={16} color="#fde68a" />
                  <Text style={styles.offlineBannerText}>
                    Sin conexión: mostrando la lista guardada el {formatSavedAt(offlineSince)}.
                  </Text>
                </View>
              ) : null
            }
            data={filtered}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={26} color={p.textMuted} />
                <Text style={styles.emptyText}>
                  {q ? 'Sin resultados para tu búsqueda.' : 'Esta O.S. no tiene pasajeros registrados.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, p.shadowCard]}
                onPress={() =>
                  navigation.navigate('EditPax', { folio, idAirport, folioDisplay, iata, typeAirline, pax: item })
                }
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="person-outline" size={18} color={p.onAccent} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardSub}>{item.hotel_name.trim()} · {item.date_out}</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    navigation.navigate('AddPax', {
                      folio, idAirport, folioDisplay, iata, typeAirline,
                      room: {
                        idOrdersOpen: item.id_orders_open,
                        idHotel: item.id_hotel,
                        hotelName: item.hotel_name,
                        ocupation: item.ocupation,
                        people: (items ?? []).filter((x) => x.id_orders_open === item.id_orders_open && x.type !== 'infante').length,
                      },
                    })
                  }
                  style={{ marginRight: 8 }}
                >
                  <Ionicons name="person-add-outline" size={18} color={p.accentText} />
                </Pressable>
                <Ionicons
                  name={item.voucher_img_url ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={16}
                  color={item.voucher_img_url ? p.okText : p.warn}
                  style={{ marginRight: 4 }}
                />
                <Ionicons name="chevron-forward" size={18} color={p.textMuted} />
              </Pressable>
            )}
          />
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
    marginHorizontal: 16,
    marginBottom: 10,
  },
  offlineBannerText: { color: p.warnText, fontSize: 11.5, flexShrink: 1, lineHeight: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: p.textMuted, fontSize: 13, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 12,
    marginBottom: 10,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: p.isDark ? '#2b3f86' : p.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardName: { color: p.text, fontWeight: '700', fontSize: 13.5 },
  cardSub: { color: p.textMuted, fontSize: 11.5, marginTop: 2 },
});
