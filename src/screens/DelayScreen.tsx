import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { DelayFormData, getDelayImageUrl, sendDelayEmail } from '../api/client';
import type Svg from 'react-native-svg';
import DelayNoticeSvg, { noticeToBase64 } from '../components/DelayNoticeSvg';
import { buildNotice, NoticeLogo } from '../utils/delayNotice';
import { getCachedLogo, refreshLogo } from '../utils/delayLogos';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Delay'>;

const LANGS: { code: string; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const CYAN = '#0891b2';

/**
 * Equivalente movil del modal "Delay" (Aviso de Retraso) de
 * op/modulos/open/inicio.php. El aviso se DIBUJA EN EL TELEFONO (utils/delayNotice.ts
 * es un calco del generador de la web, di_render.php): sale igual que en la web y
 * funciona SIN INTERNET. El logo de la aerolinea se pide al servidor solo cuando
 * hace falta y se guarda en el telefono (utils/delayLogos.ts). Solo el envio por
 * correo necesita internet, porque lo manda el servidor.
 */
export default function DelayScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, iata, airline, flight } = route.params;

  const [lang, setLang] = useState('es');
  const [airlineText, setAirlineText] = useState(airline ?? '');
  const [flightText, setFlightText] = useState(flight ?? '');
  const [dest, setDest] = useState('');
  const [pickup, setPickup] = useState('01:00');
  const [departure, setDeparture] = useState('04:30');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [showNotice, setShowNotice] = useState(false);
  const [logo, setLogo] = useState<NoticeLogo>(null);
  const svgRef = useRef<Svg>(null);
  const { width: screenW } = useWindowDimensions();
  const [isDownloading, setIsDownloading] = useState(false);
  const [mail, setMail] = useState('');
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const formData: DelayFormData = {
    lang,
    airline: airlineText,
    flight: flightText,
    dest,
    pickup,
    departure,
    date,
    // Igual que en la web (op/modulos/open/inicio.php): el "folio" que se
    // manda al generador es el codigo completo (ej. "APS-CUN-6780"), no solo
    // el numero -- asi el pie del QR dice "Folio APS-CUN-6780" igual que ahi.
    folio: folioDisplay,
    estacion: iata ?? '',
  };

  // Logo de la aerolinea: primero lo que ya hay guardado (rapido, sin internet) y luego se revisa si cambio en el servidor.
  useEffect(() => {
    let cancelled = false;
    const name = airlineText.trim();
    if (!name) {
      setLogo(null);
      return;
    }
    const timer = setTimeout(async () => {
      const cached = await getCachedLogo(name);
      if (!cancelled) setLogo(cached);
      const fresh = await refreshLogo(name);
      if (!cancelled) setLogo(fresh);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [airlineText]);

  // Diseno del aviso (se recalcula al cambiar cualquier dato o el logo).
  const layout = useMemo(() => {
    try {
      return buildNotice(formData, logo);
    } catch (e) {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, airlineText, flightText, dest, pickup, departure, date, folioDisplay, iata, logo]);

  const showPreview = () => setShowNotice(true);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const fileName = `DelayInfo_${(airlineText || 'delay').replace(/[^A-Za-z0-9]/g, '')}_${(flightText || '').replace(/[^A-Za-z0-9]/g, '')}.png`;
      const destination = new File(Paths.cache, fileName);
      if (destination.exists) destination.delete();

      let fileUri = '';
      // 1) En el celular: se exporta a PNG directo, sin internet.
      if (Platform.OS !== 'web' && layout) {
        try {
          const b64 = await noticeToBase64(svgRef.current, layout);
          destination.create();
          destination.write(b64, { encoding: 'base64' });
          if (destination.exists && destination.size > 0) fileUri = destination.uri;
        } catch (e) {
          fileUri = ''; // si falla, se intenta con el servidor
        }
      }
      // 2) Respaldo: la imagen que genera el servidor (web, o si la exportacion local fallo).
      if (!fileUri) {
        if (destination.exists) destination.delete();
        const task = File.createDownloadTask(await getDelayImageUrl(formData), destination);
        const downloaded = await task.downloadAsync();
        if (!downloaded || !downloaded.exists || downloaded.size === 0) {
          throw new Error('empty-download');
        }
        fileUri = downloaded.uri;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle: 'Aviso de Retraso' });
      } else {
        Alert.alert('Descargado', 'La imagen se guardó, pero este dispositivo no puede compartirla/abrirla directo.');
      }
    } catch (e) {
      Alert.alert('No se pudo guardar la imagen', 'Intenta de nuevo. Si el problema sigue, avísanos con una captura.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendMail = async () => {
    const to = mail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setMailMsg({ ok: false, text: 'Escribe un correo válido.' });
      return;
    }
    setIsSendingMail(true);
    setMailMsg(null);
    try {
      const res = await sendDelayEmail(to, formData);
      setMailMsg({ ok: !!res.ok, text: res.msg ?? (res.ok ? 'Enviado' : 'No se pudo enviar. Intenta de nuevo.') });
    } catch (e) {
      setMailMsg({ ok: false, text: 'Sin internet: el correo lo envía el servidor. Descarga la imagen y compártela por WhatsApp o correo desde tu teléfono.' });
    } finally {
      setIsSendingMail(false);
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
            <Text style={styles.topTitle}>Aviso de Retraso</Text>
            <Text style={styles.topSub}>#{folioDisplay}{iata ? ' · ' + iata : ''}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <FieldLabel text="Idioma del aviso" />
            <View style={styles.chipRow}>
              {LANGS.map((l) => (
                <Pressable
                  key={l.code}
                  style={[styles.chip, lang === l.code && styles.chipActive]}
                  onPress={() => setLang(l.code)}
                >
                  <Text style={[styles.chipText, lang === l.code && styles.chipTextActive]}>{l.label}</Text>
                </Pressable>
              ))}
            </View>

            <FieldLabel text="Aerolínea" />
            <TextInput
              value={airlineText}
              onChangeText={setAirlineText}
              placeholder="Ej: AEROMEXICO"
              placeholderTextColor={p.placeholder}
              style={styles.input}
            />

            <FieldLabel text="No. de Vuelo" />
            <TextInput
              value={flightText}
              onChangeText={setFlightText}
              placeholder="Ej: AM-431"
              placeholderTextColor={p.placeholder}
              style={styles.input}
              autoCapitalize="characters"
            />

            <FieldLabel text="Destino" />
            <TextInput
              value={dest}
              onChangeText={setDest}
              placeholder="Ej: CANCUN (CUN)"
              placeholderTextColor={p.placeholder}
              style={styles.input}
              autoCapitalize="characters"
            />

            <View style={styles.row2}>
              <View style={styles.row2Item}>
                <FieldLabel text="Pick Up Time" />
                <TextInput
                  value={pickup}
                  onChangeText={setPickup}
                  placeholder="HH:MM"
                  placeholderTextColor={p.placeholder}
                  style={styles.input}
                />
              </View>
              <View style={styles.row2Item}>
                <FieldLabel text="Hora Est. Salida" />
                <TextInput
                  value={departure}
                  onChangeText={setDeparture}
                  placeholder="HH:MM"
                  placeholderTextColor={p.placeholder}
                  style={styles.input}
                />
              </View>
            </View>

            <FieldLabel text="Fecha (Only passengers from)" />
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={p.placeholder}
              style={styles.input}
            />

            <Pressable style={styles.previewBtn} onPress={showPreview}>
              <Text style={styles.previewBtnText}>Vista Previa</Text>
            </Pressable>

            {showNotice && (
              <>
                <View style={styles.imageWrap}>
                  {layout ? (
                    <DelayNoticeSvg ref={svgRef} layout={layout} width={Math.min(screenW - 32, 560)} />
                  ) : (
                    <View style={styles.imageErrorBox}>
                      <Ionicons name="alert-circle-outline" size={22} color={p.dangerText} />
                      <Text style={styles.imageErrorText}>No se pudo armar el aviso. Revisa los datos.</Text>
                    </View>
                  )}
                </View>

                <Pressable style={styles.downloadBtn} onPress={handleDownload} disabled={isDownloading}>
                  {isDownloading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={16} color="#fff" />
                      <Text style={styles.downloadBtnText}>Descargar Imagen</Text>
                    </>
                  )}
                </Pressable>

                <FieldLabel text="Enviar a este correo" />
                <TextInput
                  value={mail}
                  onChangeText={setMail}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor={p.placeholder}
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Pressable style={styles.mailBtn} onPress={handleSendMail} disabled={isSendingMail}>
                  {isSendingMail ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="mail-outline" size={16} color="#fff" />
                      <Text style={styles.mailBtnText}>Enviar por correo</Text>
                    </>
                  )}
                </Pressable>
                {mailMsg && (
                  <View style={[styles.mailMsgBox, { backgroundColor: mailMsg.ok ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={{ color: mailMsg.ok ? '#166534' : '#991b1b', fontWeight: '700', fontSize: 12.5 }}>
                      {mailMsg.text}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function FieldLabel({ text }: { text: string }) {
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
  topTitle: { color: p.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  topSub: { color: p.textMuted, fontSize: 11.5, textAlign: 'center', marginTop: 1 },
  content: { padding: 16, paddingBottom: 50 },
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
  row2: { flexDirection: 'row', gap: 12 },
  row2Item: { flex: 1 },
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
  previewBtn: {
    backgroundColor: CYAN,
    borderRadius: radii.button,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  previewBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  imageWrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginTop: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageErrorBox: { alignItems: 'center', gap: 10, padding: 30 },
  imageErrorText: { color: '#64748b', fontSize: 12.5, textAlign: 'center' },
  imageErrorDetail: { color: '#94a3b8', fontSize: 11.5, textAlign: 'center', lineHeight: 16 },
  retryImageBtn: { backgroundColor: CYAN, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryImageText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: radii.button,
    height: 48,
    marginTop: 16,
  },
  downloadBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CYAN,
    borderRadius: radii.button,
    height: 48,
    marginTop: 12,
  },
  mailBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mailMsgBox: { borderRadius: 10, padding: 10, marginTop: 10, alignItems: 'center' },
});
