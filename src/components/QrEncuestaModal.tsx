import React, { useMemo } from 'react';
import { Image, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';

type Props = {
  visible: boolean;
  onClose: () => void;
  folioDisplay: string;
  iata: string;
};

/**
 * QR de la encuesta de satisfaccion -- mismo link que genera
 * op/modulos/open/inicio.php (abrirQR): apsholding.mx/encuestas/satisfaccion.
 * La web genera el QR con una libreria local y cae a esta misma API publica
 * como respaldo; aqui se usa directo (sin agregar ninguna dependencia nueva
 * al proyecto).
 */
export default function QrEncuestaModal({ visible, onClose, folioDisplay, iata }: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const encuestaUrl = useMemo(() => {
    let url = `https://apsholding.mx/encuestas/satisfaccion?folio=${encodeURIComponent(folioDisplay)}`;
    if (iata) url += `&estacion=${encodeURIComponent(iata)}`;
    return url;
  }, [folioDisplay, iata]);

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(encuestaUrl)}`;

  const handleShare = () => {
    Share.share({ message: encuestaUrl, url: encuestaUrl }).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <Text style={styles.brandAps}>APS</Text>
            <Text style={styles.brandTri}>▶</Text>
            <Text style={styles.brandHold}>Holding</Text>
          </View>
          <Text style={styles.tag}>WE ARE INNOVATION</Text>

          <View style={styles.qrWrap}>
            <Image source={{ uri: qrImageUrl }} style={styles.qrImg} resizeMode="contain" />
            <View style={styles.qrBadge}>
              <Text style={styles.qrBadgeText}>APS</Text>
            </View>
          </View>

          <Text style={styles.foot}>
            Escanea para responder la encuesta de satisfacción{'\n'}
            <Text style={styles.footFolio}>Folio {folioDisplay}</Text>
          </Text>

          <View style={styles.linkBox}>
            <Text style={styles.linkText} numberOfLines={2}>{encuestaUrl}</Text>
          </View>

          <View style={styles.acts}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cerrar</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnShare]} onPress={handleShare}>
              <Text style={styles.btnShareText}>Compartir</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: p.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    backgroundColor: p.modalBg,
    borderWidth: 1,
    borderColor: p.cardBorder,
    borderRadius: 20,
    padding: 22,
    paddingTop: 26,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandAps: { fontSize: 24, fontWeight: '900', color: p.text, letterSpacing: -0.5 },
  brandTri: { color: p.accentText, fontSize: 15 },
  brandHold: { fontSize: 24, fontWeight: '500', color: p.text },
  tag: { fontSize: 9, letterSpacing: 3, color: p.textFaint, fontWeight: '700', marginTop: 3, marginBottom: 16 },
  qrWrap: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImg: { width: 220, height: 220 },
  qrBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -18,
    marginLeft: -32,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: p.accent,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  qrBadgeText: { fontSize: 16, fontWeight: '900', color: '#16214d', letterSpacing: 0.5 },
  foot: { marginTop: 16, fontSize: 12, color: p.textMuted, textAlign: 'center', lineHeight: 18 },
  footFolio: { fontWeight: '800', color: p.text },
  linkBox: {
    marginTop: 14,
    backgroundColor: p.inputBg,
    borderRadius: 10,
    padding: 10,
    width: '100%',
  },
  linkText: { fontSize: 10.5, color: p.textMuted, textAlign: 'center' },
  acts: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnGhost: { backgroundColor: p.cardStrong },
  btnGhostText: { color: p.text, fontWeight: '700', fontSize: 13.5 },
  btnShare: { backgroundColor: p.accent },
  btnShareText: { color: p.onAccent, fontWeight: '800', fontSize: 13.5 },
});
