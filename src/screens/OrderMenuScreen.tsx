import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../components/Ionicons';
import type { ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  cancelOrder,
  confirmPruebaCode,
  getAuthHeader,
  getPreregListForOs,
  getVoucherPdfUrl,
  PreregListItem,
  requestPruebaCode,
  sendOrderEmail,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { OutboxSummary, subscribeOutbox } from '../utils/outbox';
import { closeOrder } from '../api/queuedWrites';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'OrderMenu'>;
type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Equivalente movil de op/modulos/open/submenu.php (la pantalla que abre
 * "Agregar" en cada tarjeta de Ordenes Abiertas en la web): un menu de
 * acciones por O.S. Igual que en Home, lo que ya esta construido navega a
 * la accion real; lo pendiente va a "Coming Soon" para no fingir que algo
 * esta listo.
 */
export default function OrderMenuScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, iata, typeAirline, airline, flight, esPrueba: esPruebaInicial } = route.params;
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDownloadingVouchers, setIsDownloadingVouchers] = useState(false);

  // Igual que la web (submenu.php): a los usuarios de rol 4 se les ocultan transporte, cerrar y cancelar.
  const { user } = useAuth();
  const limitado = user?.role_id === 4;

  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  // Acciones guardadas en el telefono que aun no se envian (cola sin internet).
  const [ob, setOb] = useState<OutboxSummary>({ pending: 0, failed: 0, syncing: false, justSynced: 0 });
  useEffect(() => subscribeOutbox(setOb), []);

  // Pre-registrados por QR de esta O.S. (como la caja de arriba del menu en la web).
  const [prereg, setPrereg] = useState<PreregListItem[]>([]);
  const [showPre, setShowPre] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPreregListForOs(folio, idAirport)
      .then((res) => {
        if (!cancelled && res.ok) setPrereg(res.items ?? []);
      })
      .catch(() => {}); // sin internet o pre-registro apagado: simplemente no se muestra la caja
    return () => {
      cancelled = true;
    };
  }, [folio, idAirport]);
  const preFaltan = prereg.filter((x) => !x.ya);
  const preYa = prereg.length - preFaltan.length;

  const [esPrueba, setEsPrueba] = useState(!!esPruebaInicial);
  const [isRequestingPrueba, setIsRequestingPrueba] = useState(false);
  const [pruebaAccion, setPruebaAccion] = useState<'marcar' | 'quitar' | null>(null);
  const [pruebaCodigo, setPruebaCodigo] = useState('');
  const [isConfirmingPrueba, setIsConfirmingPrueba] = useState(false);

  const handleTogglePrueba = async () => {
    const accion: 'marcar' | 'quitar' = esPrueba ? 'quitar' : 'marcar';
    setIsRequestingPrueba(true);
    try {
      const res = await requestPruebaCode(folio, idAirport, accion);
      if (res.ok) {
        setPruebaAccion(accion);
        setPruebaCodigo('');
      } else {
        Alert.alert('No se pudo pedir el código', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo pedir el código. Intenta de nuevo.');
    } finally {
      setIsRequestingPrueba(false);
    }
  };

  const handleConfirmPrueba = async () => {
    if (!pruebaAccion || pruebaCodigo.trim().length < 6) return;
    setIsConfirmingPrueba(true);
    try {
      const res = await confirmPruebaCode(folio, idAirport, pruebaAccion, pruebaCodigo.trim());
      if (res.ok) {
        setEsPrueba(!!res.prueba);
        setPruebaAccion(null);
        Alert.alert(res.prueba ? 'Marcada como PRUEBA' : 'Ya no es PRUEBA', '');
      } else {
        Alert.alert('No se pudo confirmar', res.error ?? 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo confirmar. Intenta de nuevo.');
    } finally {
      setIsConfirmingPrueba(false);
    }
  };

  const goComingSoon = (title: string, icon: IconName) => () =>
    navigation.navigate('ComingSoon', { title, icon });

  const handleDownloadVouchers = async () => {
    setIsDownloadingVouchers(true);
    try {
      const fileName = `Vouchers-${folioDisplay.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
      const destination = new File(Paths.cache, fileName);
      if (destination.exists) destination.delete();

      const authHeader = getAuthHeader();
      const task = File.createDownloadTask(getVoucherPdfUrl(folio, idAirport), destination, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      const downloaded = await task.downloadAsync();

      if (!downloaded || !downloaded.exists || downloaded.size === 0) {
        throw new Error('empty-download');
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: 'application/pdf', dialogTitle: 'Vouchers de la O.S.' });
      } else {
        Alert.alert('Descargado', 'El PDF se guardó, pero este dispositivo no puede compartirlo/abrirlo directo.');
      }
    } catch (e) {
      Alert.alert(
        'No se pudo descargar',
        'No hay vouchers guardados para esta O.S., o hubo un problema de conexión. Intenta de nuevo.'
      );
    } finally {
      setIsDownloadingVouchers(false);
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Cerrar Orden de Servicio',
      `¿Cerrar la O.S. ${folioDisplay}? Se requiere transporte de salida registrado y todos los pasajeros con nombre y fecha de salida completos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar O.S.',
          onPress: async () => {
            setIsClosing(true);
            try {
              const res = await closeOrder(folio, idAirport, folioDisplay);
              if (res.ok) {
                Alert.alert(res.queued ? 'Cierre guardado' : 'O.S. cerrada', res.msg ?? '', [
                  { text: 'OK', onPress: () => navigation.navigate('OpenOrders') },
                ]);
              } else {
                const reasons = res.reasons?.length ? '\n\n• ' + res.reasons.join('\n• ') : '';
                Alert.alert('No se pudo cerrar', (res.error ?? 'Faltan requisitos.') + reasons);
              }
            } catch (e) {
              Alert.alert('Sin conexión', 'No se pudo cerrar la O.S. Intenta de nuevo.');
            } finally {
              setIsClosing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancelar Orden de Servicio',
      `Esta acción es difícil de revertir. ¿Seguro que quieres cancelar la O.S. ${folioDisplay}?`,
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar O.S.',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const res = await cancelOrder(folio, idAirport);
              if (res.ok) {
                Alert.alert('O.S. cancelada', res.msg ?? '', [
                  { text: 'OK', onPress: () => navigation.navigate('OpenOrders') },
                ]);
              } else {
                Alert.alert('No se pudo cancelar', res.error ?? res.msg ?? 'Intenta de nuevo.');
              }
            } catch (e) {
              Alert.alert('Sin conexión', 'No se pudo cancelar la O.S. Intenta de nuevo.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleSendEmail = () => {
    Alert.alert(
      'Enviar correo de la O.S.',
      `¿Enviar el correo con el detalle de la O.S. ${folioDisplay} a los destinatarios registrados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            setIsSendingEmail(true);
            try {
              const res = await sendOrderEmail(folio, idAirport);
              Alert.alert(res.ok ? 'Enviado' : 'No se pudo enviar', res.msg ?? res.error ?? '');
            } catch (e) {
              Alert.alert('Sin conexión', 'No se pudo enviar el correo. Intenta de nuevo.');
            } finally {
              setIsSendingEmail(false);
            }
          },
        },
      ]
    );
  };

  const items: {
    key: string;
    label: string;
    sub: string;
    icon: IconName;
    color: string;
    onPress: () => void;
    loading?: boolean;
  }[] = [
    {
      key: 'pax',
      label: 'Pax',
      sub: 'Agregar pasajero',
      icon: 'person-add-outline',
      color: '#2563eb',
      onPress: () => navigation.navigate('AddPax', { folio, idAirport, folioDisplay, iata, typeAirline }),
    },
    {
      key: 'pax-edit',
      label: 'Editar Pax',
      sub: 'Buscar y editar un pasajero',
      icon: 'create-outline',
      color: '#2563eb',
      onPress: () => navigation.navigate('EditPaxList', { folio, idAirport, folioDisplay, iata, typeAirline }),
    },
    {
      key: 'transp-in',
      label: 'Transp. Llegada',
      sub: 'Agregar transporte',
      icon: 'car-outline',
      color: '#0891b2',
      onPress: () =>
        navigation.navigate('AddTransport', { folio, idAirport, folioDisplay, iata, typeAirline, direction: 'in' }),
    },
    {
      key: 'transp-out',
      label: 'Transp. Salida',
      sub: 'Agregar transporte',
      icon: 'car-sport-outline',
      color: '#0891b2',
      onPress: () =>
        navigation.navigate('AddTransport', { folio, idAirport, folioDisplay, iata, typeAirline, direction: 'out' }),
    },
    {
      key: 'delay',
      label: 'Delay',
      sub: 'Generar Aviso de Retraso',
      icon: 'time-outline',
      color: '#0891b2',
      onPress: () =>
        navigation.navigate('Delay', { folio, idAirport, folioDisplay, iata, typeAirline, airline, flight }),
    },
    {
      key: 'email',
      label: 'Enviar Correo O.S.',
      sub: 'A los destinatarios registrados',
      icon: 'mail-outline',
      color: '#7c3aed',
      onPress: handleSendEmail,
      loading: isSendingEmail,
    },
    {
      key: 'vouchers',
      label: 'Vouchers de esta O.S.',
      sub: 'Descargar comprobantes',
      icon: 'image-outline',
      color: '#0891b2',
      onPress: handleDownloadVouchers,
      loading: isDownloadingVouchers,
    },
    {
      key: 'close',
      label: 'Cerrar Orden',
      sub: 'Requiere transporte y pax completos',
      icon: 'lock-closed-outline',
      color: '#16a34a',
      onPress: handleClose,
      loading: isClosing,
    },
    {
      key: 'cancel',
      label: 'Cancelar Orden',
      sub: 'Acción difícil de revertir',
      icon: 'close-circle-outline',
      color: '#dc2626',
      onPress: handleCancel,
      loading: isCancelling,
    },
    {
      key: 'otra-os',
      label: 'Mover pasajero de otra O.S.',
      sub: 'De la misma estación, con código de autorización',
      icon: 'swap-horizontal-outline',
      color: '#2563eb',
      onPress: () => navigation.navigate('OtraOs', { folio, idAirport, folioDisplay, iata, typeAirline }),
    },
    {
      key: 'prueba',
      label: esPrueba ? 'Quitar marca de PRUEBA' : 'Marcar como PRUEBA',
      sub: esPrueba ? 'Se pedirá código por correo a Gerencia TI' : 'Etiqueta: no es una operación real',
      icon: 'flask-outline',
      color: '#f59e0b',
      onPress: handleTogglePrueba,
      loading: isRequestingPrueba,
    },
    ...(iata?.toUpperCase() === 'SJD'
      ? [
          {
            key: 'importar-lista',
            label: 'Importar lista (Excel)',
            sub: 'Pegar/elegir lista de pasajeros',
            icon: 'cloud-upload-outline' as IconName,
            color: '#0f766e',
            onPress: () => navigation.navigate('ImportarLista', { folio, idAirport, folioDisplay, iata, typeAirline }),
          },
        ]
      : []),
  ];

  // Que se puede hacer SIN internet (se guarda en el telefono y se envia solo) y que necesita el servidor.
  const NEEDS_NET = new Set(['pax-edit', 'otra-os', 'importar-lista', 'email', 'vouchers', 'cancel', 'prueba']);
  const GROUPS: { title: string; keys: string[]; hideIfLimited?: boolean }[] = [
    { title: 'Pasajeros', keys: ['pax', 'pax-edit', 'otra-os', 'importar-lista'] },
    { title: 'Transporte', keys: ['transp-in', 'transp-out'], hideIfLimited: true },
    { title: 'Avisos y documentos', keys: ['delay', 'email', 'vouchers'] },
    { title: 'Cierre de la O.S.', keys: ['close', 'cancel'], hideIfLimited: true },
    { title: 'Otros', keys: ['prueba'] },
  ];

  const press = (it: (typeof items)[number]) => {
    if (offline && NEEDS_NET.has(it.key)) {
      Alert.alert(
        'Necesita internet',
        'Esta acción se hace con el servidor. En cuanto vuelva la señal podrás hacerla.\n\nMientras tanto puedes agregar pasajeros y transporte, y cerrar la O.S.: se guardan en el teléfono y se envían solos.'
      );
      return;
    }
    it.onPress();
  };

  const showHelp = () =>
    Alert.alert(
      'Acciones de la O.S.',
      '• Pasajeros: agrega, edita o mueve pasajeros. "Agregar" también funciona sin internet.\n\n' +
        '• Pre-registrados: quienes se registraron por QR; con un toque los agregas a la O.S. ya con sus datos.\n\n' +
        '• Transporte: de llegada y de salida.\n\n' +
        '• Avisos y documentos: aviso de retraso (sale aunque no haya internet), correo y vouchers.\n\n' +
        '• Cierre: para cerrar hace falta transporte de salida y todos los pasajeros completos.\n\n' +
        '• Sin internet: lo que agregues se guarda en el teléfono y se envía solo al volver la señal, sin duplicarse. Lo marcado "Requiere internet" espera a que haya señal.'
    );

  const renderTile = (it: (typeof items)[number], wide?: boolean) => {
    const needs = NEEDS_NET.has(it.key);
    const dim = offline && needs;
    const isClose = it.key === 'close';
    const isCancel = it.key === 'cancel';
    return (
      <Pressable
        key={it.key}
        style={[
          styles.tile,
          wide && styles.tileWide,
          p.isDark ? null : p.shadowCard,
          isClose && styles.tileClose,
          isCancel && styles.tileCancel,
          dim && { opacity: 0.55 },
        ]}
        onPress={() => press(it)}
        disabled={it.loading}
      >
        <View style={[styles.tileIcon, { backgroundColor: it.color }]}>
          {it.loading ? (
            <ActivityIndicator color={p.onAccent} size="small" />
          ) : (
            <Ionicons name={it.icon} size={22} color={p.onAccent} />
          )}
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {it.label}
        </Text>
        <Text style={styles.tileSub} numberOfLines={2}>
          {it.loading ? 'Procesando...' : it.sub}
        </Text>
        {offline && (
          <Text style={[styles.tileTag, dim ? { color: p.warnText } : { color: p.okText }]}>
            {dim ? 'Requiere internet' : '✓ Funciona sin internet'}
          </Text>
        )}
      </Pressable>
    );
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
            <Text style={styles.topTitle}>#{folioDisplay}</Text>
            <Text style={styles.topSub}>{iata ? iata + ' · ' : ''}Acciones de la O.S.</Text>
          </View>
          <BrandMark />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[p.accent, p.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="apps" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>¿Qué quieres hacer?</Text>
                <Text style={styles.heroSub} numberOfLines={2}>
                  {airline ? airline : 'O.S. ' + folioDisplay}
                  {flight ? ' · Vuelo ' + String(flight).trim() : ''}
                  {iata ? ' · ' + iata : ''}
                </Text>
              </View>
              <Pressable style={styles.helpBtn} onPress={showHelp} hitSlop={8}>
                <Text style={styles.helpBtnText}>?</Text>
              </Pressable>
            </View>
            <View style={styles.heroChips}>
              <View style={styles.heroChip}>
                <View style={[styles.netDot, { backgroundColor: offline ? '#fbbf24' : '#4ade80' }]} />
                <Text style={styles.heroChipText}>{offline ? 'Sin internet' : 'Conexión exitosa'}</Text>
              </View>
              {ob.pending > 0 && (
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>
                    {ob.pending} por enviar
                  </Text>
                </View>
              )}
              {esPrueba && (
                <View style={[styles.heroChip, { backgroundColor: 'rgba(245,158,11,0.9)', borderColor: 'transparent' }]}>
                  <Text style={styles.heroChipText}>PRUEBA</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          {offline && (
            <View style={styles.offlineNote}>
              <Ionicons name="cloud-offline-outline" size={16} color={p.warnText} />
              <Text style={styles.offlineNoteText}>
                Sin internet: puedes agregar pasajeros y transporte, hacer el aviso de retraso y cerrar la O.S. Se guarda en el
                teléfono y se envía solo al volver la señal.
              </Text>
            </View>
          )}

          {prereg.length > 0 && (
            <View style={styles.preBox}>
              <Pressable style={styles.preHead} onPress={() => setShowPre((v) => !v)}>
                <Ionicons name="qr-code" size={20} color={p.accentText} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.preTitle}>Pre-registrados por QR</Text>
                  <Text style={styles.preSub}>
                    {preFaltan.length} por agregar · {preYa} ya en la O.S.
                  </Text>
                </View>
                {preFaltan.length > 0 && (
                  <View style={styles.preBadge}>
                    <Text style={styles.preBadgeText}>{preFaltan.length}</Text>
                  </View>
                )}
                <Ionicons name={showPre ? 'chevron-up' : 'chevron-down'} size={18} color={p.textMuted} />
              </Pressable>
              {showPre &&
                prereg.map((x) => (
                  <View key={x.id} style={styles.preRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.preName} numberOfLines={1}>
                        {x.name}
                      </Text>
                      <Text style={styles.preMeta} numberOfLines={1}>
                        {x.party} {x.party === 1 ? 'persona' : 'personas'} ·{' '}
                        {x.hotel_name ? 'Hotel: ' + x.hotel_name : 'sin hotel asignado'}
                      </Text>
                    </View>
                    {x.ya ? (
                      <Text style={styles.preYa}>✓ Ya está</Text>
                    ) : (
                      <Pressable
                        style={styles.preBtn}
                        onPress={() =>
                          navigation.navigate('AddPax', {
                            folio,
                            idAirport,
                            folioDisplay,
                            iata,
                            typeAirline,
                            prefill: {
                              preregId: x.id,
                              name: x.name,
                              voucher: x.voucher ?? '',
                              comps: x.comps ?? [],
                              idHotel: x.id_hotel,
                              hotelName: x.hotel_name || null,
                            },
                          })
                        }
                      >
                        <Text style={styles.preBtnText}>Agregar a la O.S.</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
            </View>
          )}

          {(() => {
            const pax = items.find((i) => i.key === 'pax');
            return pax ? (
              <Pressable
                style={[styles.primaryCard, p.isDark ? null : p.shadowCard]}
                onPress={() => press(pax)}
              >
                <View style={styles.primaryIcon}>
                  <Ionicons name="person-add" size={26} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.primaryTitle}>Agregar pasajero</Text>
                  <Text style={styles.primarySub}>
                    {offline ? '✓ Funciona sin internet: se guarda en el teléfono' : 'Hotel, habitación y pasajeros de esta O.S.'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            ) : null;
          })()}

          {GROUPS.filter((g) => !(g.hideIfLimited && limitado)).map((g) => {
            const list = g.keys
              .map((k) => items.find((i) => i.key === k))
              .filter((i): i is (typeof items)[number] => !!i && i.key !== 'pax');
            if (list.length === 0) return null;
            const cierre = g.title === 'Cierre de la O.S.';
            return (
              <View key={g.title} style={styles.group}>
                <Text style={[styles.groupTitle, cierre && { color: p.dangerText }]}>{g.title.toUpperCase()}</Text>
                {cierre && (
                  <Text style={styles.groupHint}>Para cerrar hace falta transporte de salida y todos los pasajeros completos.</Text>
                )}
                <View style={styles.tileGrid}>{list.map((it) => renderTile(it, cierre))}</View>
              </View>
            );
          })}
        </ScrollView>

        <Modal visible={!!pruebaAccion} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, p.shadowCard]}>
              <Text style={styles.modalTitle}>
                {pruebaAccion === 'quitar' ? 'Quitar marca de PRUEBA' : 'Marcar como PRUEBA'}
              </Text>
              <Text style={styles.modalText}>
                Se mandó un código de 6 dígitos por correo a Gerencia TI. Pídeselo y escríbelo aquí para confirmar.
              </Text>
              <TextInput
                value={pruebaCodigo}
                onChangeText={(t) => setPruebaCodigo(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={p.placeholder}
                style={styles.modalInput}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setPruebaAccion(null)} disabled={isConfirmingPrueba}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirmBtn, pruebaCodigo.trim().length < 6 && styles.modalConfirmBtnDisabled]}
                  onPress={handleConfirmPrueba}
                  disabled={pruebaCodigo.trim().length < 6 || isConfirmingPrueba}
                >
                  {isConfirmingPrueba ? (
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
  content: { padding: 16, paddingBottom: 40 },
  heroCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    shadowColor: p.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: p.isDark ? 0.35 : 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2 },
  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: { color: '#16214d', fontWeight: '900', fontSize: 14 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  netDot: { width: 8, height: 8, borderRadius: 4 },
  heroChipText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  offlineNote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: p.warnSoft,
    borderWidth: 1,
    borderColor: p.warnBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  offlineNoteText: { color: p.warnText, fontSize: 12, flex: 1, lineHeight: 17 },
  preBox: {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    ...(p.isDark ? {} : p.shadowCard),
  },
  preHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preTitle: { color: p.text, fontSize: 13.5, fontWeight: '800' },
  preSub: { color: p.textMuted, fontSize: 11.5, marginTop: 1 },
  preBadge: { backgroundColor: p.accent, borderRadius: 12, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' },
  preBadgeText: { color: p.onAccent, fontSize: 12, fontWeight: '900' },
  preRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: p.divider,
  },
  preName: { color: p.text, fontSize: 13, fontWeight: '700' },
  preMeta: { color: p.textMuted, fontSize: 11.5, marginTop: 1 },
  preYa: { color: p.okText, fontSize: 11.5, fontWeight: '800' },
  preBtn: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  preBtnText: { color: p.onAccent, fontSize: 12, fontWeight: '800' },
  primaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2563eb',
    borderRadius: 20,
    padding: 16,
    marginBottom: 6,
  },
  primaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTitle: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  primarySub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  group: { marginTop: 14 },
  groupTitle: { color: p.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8, marginLeft: 4 },
  groupHint: { color: p.textMuted, fontSize: 11.5, marginLeft: 4, marginBottom: 8, lineHeight: 16 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  tileWide: { width: '100%' },
  tileClose: { backgroundColor: p.okSoft, borderColor: p.okBorder },
  tileCancel: { backgroundColor: p.dangerSoft, borderColor: p.dangerBorder },
  tileIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tileLabel: { color: p.text, fontWeight: '800', fontSize: 13.5, lineHeight: 17 },
  tileSub: { color: p.textMuted, fontSize: 11.5, lineHeight: 15 },
  tileTag: { fontSize: 10.5, fontWeight: '800', marginTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: p.cardBorder,
    backgroundColor: p.card,
    padding: 14,
    marginBottom: 10,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1 },
  itemLabel: { color: p.text, fontWeight: '800', fontSize: 13.5 },
  itemSub: { color: p.textMuted, fontSize: 11.5, marginTop: 2 },
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
