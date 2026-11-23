import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, gradients, radii, shadow } from '../theme/colors';
import { lookupPreregByQr, PreregLookupResponse } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'PreregScan'>;

function flightBadge(state?: string): { text: string; color: string } | null {
  if (state === 'ok') return { text: 'Vuelo ✓', color: colors.ok };
  if (state === 'bad') return { text: 'Vuelo no coincide', color: colors.danger };
  if (state === 'num') return { text: 'Vuelo (otro código)', color: colors.warn };
  return null;
}

/**
 * Escaneo del QR PERSONAL de un pasajero pre-registrado (el que le sale al
 * terminar su auto-registro) -- equivalente movil de op/modulos/prereg/
 * api.php (action=lookup). A diferencia de la web, no arma URLs de
 * navegador: al confirmar, navega directo a AddPax ya pre-rellenada.
 */
export default function PreregScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scanning' | 'manual' | 'loading' | 'result'>('scanning');
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreregLookupResponse | null>(null);
  const handledRef = useRef(false);

  const runLookup = async (q: string) => {
    setMode('loading');
    setError(null);
    try {
      const res = await lookupPreregByQr(q);
      if (res.ok) {
        setResult(res);
        setMode('result');
      } else {
        setError(res.error ?? 'No se pudo leer ese QR.');
        setMode('scanning');
      }
    } catch (e) {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      setMode('scanning');
    } finally {
      handledRef.current = false;
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (handledRef.current || mode !== 'scanning') return;
    handledRef.current = true;
    runLookup(data);
  };

  const buscarManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    runLookup(code);
  };

  const escanearOtro = () => {
    setResult(null);
    setError(null);
    setManualCode('');
    handledRef.current = false;
    setMode('scanning');
  };

  const confirmarAlta = () => {
    if (!result || !result.ok) return;
    navigation.navigate('AddPax', {
      folio: result.folio!,
      idAirport: result.id_airport!,
      folioDisplay: result.folio_display ?? '',
      iata: result.iata ?? '',
      typeAirline: result.type_airline ?? 'all',
      flight: result.flight,
      prefill: {
        preregId: result.id!,
        name: result.name ?? '',
        voucher: result.voucher ?? '',
        comps: result.comps ?? [],
        idHotel: result.id_hotel ?? null,
        hotelName: result.hotel_name ?? null,
      },
    });
  };

  const fBadge = flightBadge(result?.flight_state);

  return (
    <LinearGradient colors={gradients.hero} style={styles.flex}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>
          <View>
            <Text style={styles.topTitle}>Escanear pasajero</Text>
            <Text style={styles.topSub}>QR personal de pre-registro</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        {mode === 'result' && result ? (
          <View style={styles.content}>
            <View style={[styles.resultCard, shadow.card]}>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultSub}>
                O.S. {result.folio_display} · {result.iata}
                {result.flight ? ` · Vuelo ${result.flight.trim()}` : ''}
              </Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {result.party} {result.party === 1 ? 'persona' : 'personas'}
                  </Text>
                </View>
                {fBadge ? (
                  <View style={[styles.badge, { backgroundColor: fBadge.color + '33' }]}>
                    <Text style={[styles.badgeText, { color: fBadge.color }]}>{fBadge.text}</Text>
                  </View>
                ) : null}
              </View>
              {result.comps && result.comps.length > 0 ? (
                <Text style={styles.compsText}>Acompañantes: {result.comps.map((c) => c.name).join(', ')}</Text>
              ) : null}

              {result.already_in_os ? (
                <View style={styles.blockBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.blockText}>
                    Este pasajero ya está capturado en la O.S.
                    {result.already_in_os.hotel ? ` (hotel ${result.already_in_os.hotel})` : ''}. No se puede agregar
                    otra vez.
                  </Text>
                </View>
              ) : (
                <Pressable style={styles.confirmBtn} onPress={confirmarAlta}>
                  <Ionicons name="add-circle-outline" size={18} color="#06322f" />
                  <Text style={styles.confirmBtnText}>Agregar a la O.S.</Text>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.rescanLink} onPress={escanearOtro}>
              <Text style={styles.rescanLinkText}>Escanear otro</Text>
            </Pressable>
          </View>
        ) : mode === 'manual' ? (
          <View style={styles.content}>
            <Text style={styles.instructions}>Escribe el código que le salió al pasajero al terminar su registro:</Text>
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Ej. 7K4P2M"
              placeholderTextColor={colors.placeholder}
              style={styles.manualInput}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable style={styles.confirmBtn} onPress={buscarManual} disabled={!manualCode.trim()}>
              <Text style={styles.confirmBtnText}>Buscar</Text>
            </Pressable>
            <Pressable style={styles.rescanLink} onPress={() => setMode('scanning')}>
              <Text style={styles.rescanLinkText}>Volver a la cámara</Text>
            </Pressable>
          </View>
        ) : mode === 'loading' ? (
          <View style={styles.content}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={styles.instructions}>Buscando pasajero…</Text>
          </View>
        ) : !permission ? (
          <View style={styles.content}>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.content}>
            <Ionicons name="camera-outline" size={36} color={colors.textMuted} />
            <Text style={styles.instructions}>Activa el permiso de cámara para escanear el QR del pasajero.</Text>
            <Pressable style={styles.confirmBtn} onPress={requestPermission}>
              <Text style={styles.confirmBtnText}>Activar cámara</Text>
            </Pressable>
            <Pressable style={styles.rescanLink} onPress={() => setMode('manual')}>
              <Text style={styles.rescanLinkText}>Escribir código a mano</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcodeScanned}
            />
            <View style={styles.cameraOverlay}>
              <View style={styles.scanBox} />
              {error ? <Text style={styles.errorTextOverlay}>{error}</Text> : null}
              <Text style={styles.cameraHint}>Apunta la cámara al QR personal del pasajero</Text>
              <Pressable style={styles.manualLink} onPress={() => setMode('manual')}>
                <Text style={styles.manualLinkText}>Escribir código a mano</Text>
              </Pressable>
            </View>
          </View>
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: colors.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  instructions: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorText: { color: colors.danger, fontSize: 12.5, textAlign: 'center' },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  scanBox: {
    width: 230,
    height: 230,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cameraHint: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  errorTextOverlay: {
    color: '#fecaca',
    fontSize: 12.5,
    textAlign: 'center',
    backgroundColor: 'rgba(127,29,29,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  manualLink: { marginTop: 4 },
  manualLinkText: { color: '#fff', fontSize: 12.5, fontWeight: '700', textDecorationLine: 'underline' },
  manualInput: {
    width: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    height: 48,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 2,
  },
  resultCard: {
    width: '100%',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 18,
  },
  resultName: { color: colors.white, fontWeight: '800', fontSize: 16 },
  resultSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  compsText: { color: colors.textMuted, fontSize: 11.5, marginTop: 10 },
  blockBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.14)',
    borderRadius: radii.input,
    padding: 12,
    marginTop: 14,
  },
  blockText: { flex: 1, color: '#fecaca', fontSize: 12, lineHeight: 17 },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.teal,
    borderRadius: radii.button,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 14,
  },
  confirmBtnText: { color: '#06322f', fontWeight: '800', fontSize: 14 },
  rescanLink: { marginTop: 16, alignItems: 'center' },
  rescanLinkText: { color: colors.teal, fontSize: 13, fontWeight: '700' },
});
