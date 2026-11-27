import React, { useEffect } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../theme/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { getSiteBaseUrl, logPreregOsQr } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

import BrandMark from '../components/BrandMark';
type Props = NativeStackScreenProps<RootStackParamList, 'PreregQrDisplay'>;

/**
 * QR de la O.S. (equivalente movil del boton "QR pasajeros" de
 * op/modulos/open/inicio.php): el pasajero lo escanea para auto-registrarse
 * (registro/index.php). El token ya viene firmado por el servidor
 * (pr_token, en detail.php) -- aqui solo se pinta, no se genera nada nuevo.
 */
export default function PreregQrDisplayScreen({ route, navigation }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { folio, idAirport, folioDisplay, token } = route.params;
  const url = `${getSiteBaseUrl()}/registro/?t=${encodeURIComponent(token)}`;

  useEffect(() => {
    // Bitacora de que se mostro el QR, igual que hace la web al abrirlo (no bloquea la pantalla si falla).
    logPreregOsQr(folio, idAirport).catch(() => {});
  }, [folio, idAirport]);

  const compartir = async () => {
    try {
      await Share.share({ message: `Pre-regístrate aquí para tu traslado: ${url}` });
    } catch (e) {
      // Silencioso: el usuario pudo cancelar el panel de compartir.
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
            <Text style={styles.topSub}>QR de pre-registro</Text>
          </View>
          <BrandMark />
        </View>

        <View style={styles.content}>
          <Text style={styles.instructions}>
            El pasajero escanea este código y llena sus datos (nombre completo, vuelo, etc.) para quedar listo para
            agregarse a la O.S.
          </Text>

          <View style={[styles.qrCard, p.shadowCard]}>
            <QRCode value={url} size={240} backgroundColor="#fff" color="#0f172a" />
          </View>

          <Text style={styles.codeLabel}>Enlace de respaldo (si no se puede escanear):</Text>
          <Text style={styles.code} selectable>
            {url}
          </Text>

          <Pressable style={styles.shareBtn} onPress={compartir}>
            <Ionicons name="share-outline" size={18} color={p.onAccent} />
            <Text style={styles.shareBtnText}>Compartir enlace</Text>
          </Pressable>
        </View>
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
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 10 },
  instructions: { color: p.textMuted, fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: radii.card,
    padding: 20,
    marginBottom: 20,
  },
  codeLabel: { color: p.textMuted, fontSize: 11.5, marginBottom: 6 },
  code: {
    color: p.text,
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: p.inputBg,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 26,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: p.accent,
    borderRadius: radii.button,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  shareBtnText: { color: p.onAccent, fontWeight: '800', fontSize: 14 },
});
