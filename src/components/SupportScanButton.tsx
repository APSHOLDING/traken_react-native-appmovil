import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/colors';
import { scanSupportAI } from '../api/client';
import { resizeForUpload } from '../utils/imageResize';

type Props = {
  idOrder?: number;
  idAirport?: number;
  onDetected: (codigo: string) => void;
};

/**
 * Lee el PNR/voucher de una foto -- version movil de
 * op/modulos/open/leerSoporte.php (solo IA, ver src/api/client.ts). A
 * diferencia de VoucherScanButton (que adivina el NOMBRE), este botón llena
 * el campo "Voucher" y solo avisa (nunca bloquea) si el vuelo que trae la
 * foto no coincide con el de la O.S.
 */
export default function SupportScanButton({ idOrder, idAirport, onDetected }: Props) {
  const [scanning, setScanning] = useState(false);

  const pick = async (source: 'camera' | 'library'): Promise<string | null> => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso necesario', 'Activa el permiso de cámara.');
        return null;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (res.canceled) return null;
      const a = res.assets[0];
      return resizeForUpload(a.uri, a.width, a.height);
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Activa el permiso de galería.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return null;
    const a = res.assets[0];
    return resizeForUpload(a.uri, a.width, a.height);
  };

  const empezar = async (source: 'camera' | 'library') => {
    const uri = await pick(source);
    if (!uri) return;
    setScanning(true);
    try {
      const res = await scanSupportAI(uri, idOrder, idAirport);
      if (!res.ok || !res.codigo) {
        Alert.alert('No se detectó', res.msg ?? 'No se encontró un PNR/voucher claro en la foto.');
        return;
      }
      onDetected(res.codigo);
      if (res.vuelo_ok === false) {
        Alert.alert(
          'El vuelo no coincide',
          `La foto muestra el vuelo ${res.vuelo}, pero esta O.S. es del vuelo ${res.vuelo_os || '—'}. Revisa que sea el soporte correcto.`
        );
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo leer la imagen. Intenta de nuevo.');
    } finally {
      setScanning(false);
    }
  };

  if (scanning) {
    return (
      <View style={styles.scanBox}>
        <ActivityIndicator color={colors.teal} size="small" />
        <Text style={styles.scanText}>Leyendo PNR/voucher…</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={() => empezar('camera')}>
        <Ionicons name="camera-outline" size={14} color="#fff" />
        <Text style={styles.btnText}>Leer PNR/voucher (opcional)</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => empezar('library')}>
        <Ionicons name="images-outline" size={14} color="#0f172a" />
        <Text style={styles.btnGhostText}>Galería</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
  btnGhostText: { color: '#0f172a', fontWeight: '700', fontSize: 11.5 },
  scanBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: radii.input,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  scanText: { color: '#5b21b6', fontSize: 12.5 },
});
