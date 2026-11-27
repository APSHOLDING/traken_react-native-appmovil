import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import type { ThemeTokens } from '../theme/themes';
import { radii } from '../theme/colors';
import { removeVoucherPhoto, restoreVoucherPhoto, rotateVoucherPhoto, uploadVoucherPhoto, logVoucherScan } from '../api/client';
import { iniciarEscaneoVoucher, escanearConOcrLocal, ScanStage } from '../utils/voucherScan';
import { resizeForUpload } from '../utils/imageResize';

type Props = {
  idPax: number;
  idOrder: number;
  idAirport: number;
  initialUrl: string | null;
  initialRemoved: boolean;
  initialRotation?: number;
  /** Se llama cuando se detecta/confirma un nombre, para autocompletar el
   * campo "Nombre" de la pantalla que use este componente. */
  onNameDetected?: (name: string) => void;
};

/**
 * Foto de soporte/voucher ligada a un pasajero -- equivalente movil de la
 * fila "Foto de soporte" en op/modulos/open/edit.php (web): muestra si ya
 * tiene soporte cargado, su miniatura, y deja reemplazar/quitar/recuperar.
 * Al capturar una foto nueva, primero la lee (IA con OCR local de
 * respaldo, igual que add.php en la web) para sugerir el nombre, y luego
 * la guarda como soporte del pasajero.
 */
export default function VoucherPhotoSection({
  idPax,
  idOrder,
  idAirport,
  initialUrl,
  initialRemoved,
  initialRotation,
  onNameDetected,
}: Props) {
  const p = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [removed, setRemoved] = useState(initialRemoved);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(
    initialRotation === 90 || initialRotation === 180 || initialRotation === 270 ? initialRotation : 0
  );
  const [isBusy, setIsBusy] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [showOcrOption, setShowOcrOption] = useState(false);
  const [guessedName, setGuessedName] = useState('');
  const [showGuess, setShowGuess] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const cancelRef = React.useRef<(() => void) | null>(null);

  const pickPhoto = async (source: 'camera' | 'library'): Promise<string | null> => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso necesario', 'Activa el permiso de cámara para escanear el voucher.');
        return null;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      if (res.canceled) return null;
      const a = res.assets[0];
      return resizeForUpload(a.uri, a.width, a.height);
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso necesario', 'Activa el permiso de galería para elegir la foto.');
        return null;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled) return null;
      const a = res.assets[0];
      return resizeForUpload(a.uri, a.width, a.height);
    }
  };

  const handleStage = (stage: ScanStage) => {
    if (stage.kind === 'ai-loading') {
      setScanMessage(stage.message);
    } else if (stage.kind === 'ai-slow') {
      setScanMessage(stage.message);
      setShowOcrOption(true);
    } else if (stage.kind === 'done') {
      setScanning(false);
      setShowOcrOption(false);
      setScanMessage(stage.message);
      setGuessedName(stage.nombre);
      setShowGuess(true);
    }
  };

  const empezarEscaneo = async (source: 'camera' | 'library') => {
    const uri = await pickPhoto(source);
    if (!uri) return;
    setPendingUri(uri);
    setScanning(true);
    setShowGuess(false);
    setShowOcrOption(false);
    setGuessedName('');
    cancelRef.current = iniciarEscaneoVoucher(uri, { idOrder, idAirport, onStage: handleStage });
  };

  const usarOcrLocal = async () => {
    if (!pendingUri) return;
    if (cancelRef.current) cancelRef.current();
    setShowOcrOption(false);
    setScanMessage('📄 Leyendo con OCR local, un momento…');
    try {
      const { nombre } = await escanearConOcrLocal(pendingUri);
      setScanning(false);
      setGuessedName(nombre);
      setShowGuess(true);
      setScanMessage(
        nombre
          ? '📄 Texto detectado por OCR local (revísalo, puede tener errores):'
          : '⚠️ El OCR local no encontró texto claro. Escríbelo aquí:'
      );
      logVoucherScan('ocr', !!nombre, idOrder, idAirport);
    } catch (e) {
      setScanning(false);
      setShowGuess(true);
      setGuessedName('');
      setScanMessage(
        '⚠️ El OCR local no está disponible en esta versión de la app (necesita una build compilada, no funciona en Expo Go). Escribe el nombre a mano:'
      );
      logVoucherScan('ocr', false, idOrder, idAirport, 'ML Kit no disponible (¿Expo Go?)');
    }
  };

  const escribirAMano = () => {
    if (cancelRef.current) cancelRef.current();
    setScanning(false);
    setShowOcrOption(false);
    setShowGuess(true);
    setGuessedName('');
    setScanMessage('Escribe el nombre que veas en la foto:');
    logVoucherScan('manual', false, idOrder, idAirport);
  };

  const confirmarNombreYGuardarFoto = async () => {
    if (guessedName.trim() && onNameDetected) {
      onNameDetected(guessedName.trim());
    }
    if (!pendingUri) {
      setShowGuess(false);
      return;
    }
    setIsBusy(true);
    try {
      const res = await uploadVoucherPhoto(idPax, idOrder, idAirport, pendingUri);
      if (res.ok && res.url) {
        setPhotoUrl(res.url);
        setRemoved(false);
      } else {
        Alert.alert('No se pudo guardar la foto', res.error || res.msg || 'Intenta de nuevo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo guardar la foto. Intenta de nuevo.');
    } finally {
      setIsBusy(false);
      setShowGuess(false);
      setPendingUri(null);
    }
  };

  const cancelarEscaneo = () => {
    if (cancelRef.current) cancelRef.current();
    setScanning(false);
    setShowGuess(false);
    setShowOcrOption(false);
    setPendingUri(null);
  };

  const handleRemove = () => {
    Alert.alert('Quitar soporte', '¿Quitar la foto de este pasajero? Se puede recuperar después.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            const res = await removeVoucherPhoto(idPax, idOrder, idAirport);
            if (res.ok) {
              setPhotoUrl(null);
              setRemoved(true);
            } else {
              Alert.alert('No se pudo quitar', res.error || res.msg || '');
            }
          } catch (e) {
            Alert.alert('Sin conexión', 'Intenta de nuevo.');
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  };

  const handleRotate = async () => {
    const previous = rotation;
    const next = ((rotation + 90) % 360) as 0 | 90 | 180 | 270;
    setRotation(next);
    setIsRotating(true);
    try {
      const res = await rotateVoucherPhoto(idPax, idOrder, idAirport, next);
      if (!res.ok) {
        setRotation(previous);
        Alert.alert('No se pudo guardar el giro', res.error || 'Intenta de nuevo.');
      }
    } catch (e) {
      setRotation(previous);
      Alert.alert('Sin conexión', 'No se pudo guardar el giro. Intenta de nuevo.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleRestore = async () => {
    setIsBusy(true);
    try {
      const res = await restoreVoucherPhoto(idPax, idOrder, idAirport);
      if (res.ok && res.url) {
        setPhotoUrl(res.url);
        setRemoved(false);
      } else {
        Alert.alert('No se pudo recuperar', res.error || res.msg || '');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'Intenta de nuevo.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.flag, photoUrl ? styles.flagOk : styles.flagWarn]}>
        <Ionicons name={photoUrl ? 'checkmark-circle' : 'alert-circle-outline'} size={14} color={photoUrl ? p.okText : p.warnText} />
        <Text style={[styles.flagText, photoUrl ? styles.flagTextOk : styles.flagTextWarn]}>
          {photoUrl ? 'Soporte cargado' : removed ? 'Soporte quitado (se puede recuperar)' : 'Sin soporte cargado'}
        </Text>
      </View>

      {photoUrl && !scanning && !showGuess && (
        <Image
          source={{ uri: photoUrl }}
          style={[styles.thumb, { transform: [{ rotate: `${rotation}deg` }] }]}
          resizeMode="cover"
        />
      )}

      {!scanning && !showGuess && (
        <View style={styles.actionsRow}>
          {!photoUrl && !removed && (
            <>
              <Pressable style={styles.actionBtn} onPress={() => empezarEscaneo('camera')} disabled={isBusy}>
                <Ionicons name="camera-outline" size={14} color={p.onAccent} />
                <Text style={styles.actionBtnText}>Escanear</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={() => empezarEscaneo('library')} disabled={isBusy}>
                <Ionicons name="images-outline" size={14} color={p.text} />
                <Text style={styles.actionBtnGhostText}>Galería</Text>
              </Pressable>
            </>
          )}
          {photoUrl && (
            <>
              <Pressable style={styles.actionBtn} onPress={() => empezarEscaneo('camera')} disabled={isBusy}>
                <Ionicons name="camera-outline" size={14} color={p.onAccent} />
                <Text style={styles.actionBtnText}>Reemplazar</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={handleRotate} disabled={isBusy || isRotating}>
                {isRotating ? (
                  <ActivityIndicator size="small" color={p.text} />
                ) : (
                  <Ionicons name="reload-outline" size={14} color={p.text} />
                )}
                <Text style={styles.actionBtnGhostText}>Girar</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleRemove} disabled={isBusy}>
                <Ionicons name="trash-outline" size={14} color={p.onAccent} />
                <Text style={styles.actionBtnText}>Quitar</Text>
              </Pressable>
            </>
          )}
          {removed && (
            <Pressable style={[styles.actionBtn, styles.actionBtnRestore]} onPress={handleRestore} disabled={isBusy}>
              <Ionicons name="refresh-outline" size={14} color={p.onAccent} />
              <Text style={styles.actionBtnText}>Recuperar</Text>
            </Pressable>
          )}
          {isBusy && <ActivityIndicator size="small" color={p.accentText} />}
        </View>
      )}

      {(scanning || showGuess) && (
        <View style={styles.scanBox}>
          <Text style={styles.scanMessage}>{scanMessage}</Text>
          {scanning && <ActivityIndicator color={p.accentText} style={{ marginTop: 8 }} />}
          {showOcrOption && (
            <View style={styles.fallbackRow}>
              <Pressable onPress={escribirAMano}>
                <Text style={styles.fallbackLink}>Escribir a mano</Text>
              </Pressable>
              <Pressable onPress={usarOcrLocal}>
                <Text style={styles.fallbackLink}>Leer con OCR local (sin internet)</Text>
              </Pressable>
            </View>
          )}
          {showGuess && (
            <>
              <TextInput
                value={guessedName}
                onChangeText={setGuessedName}
                placeholder="Nombre detectado (edítalo si hace falta)"
                placeholderTextColor={p.placeholder}
                style={styles.guessInput}
                autoCapitalize="characters"
              />
              <View style={styles.guessActions}>
                <Pressable style={styles.guessCancelBtn} onPress={cancelarEscaneo}>
                  <Text style={styles.guessCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.guessUseBtn} onPress={confirmarNombreYGuardarFoto} disabled={isBusy}>
                  <Text style={styles.guessUseText}>{isBusy ? 'Guardando...' : 'Usar este nombre'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (p: ThemeTokens) => StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  flagOk: { backgroundColor: p.okSoft },
  flagWarn: { backgroundColor: p.warnSoft },
  flagText: { fontSize: 11, fontWeight: '700' },
  flagTextOk: { color: p.okText },
  flagTextWarn: { color: p.warnText },
  thumb: { width: '100%', height: 160, borderRadius: radii.input, marginBottom: 10, backgroundColor: '#0000001a' },
  actionsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: p.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionBtnGhost: { backgroundColor: p.cardStrong },
  actionBtnDanger: { backgroundColor: p.danger },
  actionBtnRestore: { backgroundColor: '#2563eb' },
  actionBtnText: { color: p.onAccent, fontWeight: '700', fontSize: 11.5 },
  actionBtnGhostText: { color: p.text, fontWeight: '700', fontSize: 11.5 },
  scanBox: { backgroundColor: p.accentSoft, borderWidth: 1, borderColor: p.accentBorder, borderRadius: radii.input, padding: 12 },
  scanMessage: { color: p.accentText, fontSize: 12.5, lineHeight: 18 },
  fallbackRow: { flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' },
  fallbackLink: { color: p.accentText, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  guessInput: {
    marginTop: 10,
    backgroundColor: p.inputBg,
    borderWidth: 1,
    borderColor: p.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    color: p.text,
    fontSize: 13.5,
  },
  guessActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  guessCancelBtn: { flex: 1, backgroundColor: p.cardStrong, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  guessCancelText: { color: p.text, fontWeight: '700', fontSize: 12.5 },
  guessUseBtn: { flex: 1, backgroundColor: p.ok, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  guessUseText: { color: p.onAccent, fontWeight: '700', fontSize: 12.5 },
});
