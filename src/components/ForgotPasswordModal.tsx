import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
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
import Ionicons from './Ionicons';
import { forgotPassword } from '../api/client';

type Props = { visible: boolean; initialEmail?: string; onClose: () => void };

const NAVY = '#16214d';
const NAVY2 = '#243a7a';
const TEAL = '#20b9b1';

/**
 * "¿Olvidaste tu contraseña?" -- con cuenta maestra (area de IT):
 *  - Tengo mi correo de Traken: se restablece y la nueva contraseña le llega SOLO al area de IT (cuenta maestra);
 *    hay que pedirsela al area de IT.
 *  - No tengo cuenta: se piden nombre completo, estacion, acceso deseado y telefono; IT crea la cuenta (sin contraseñas por aqui).
 * Responsivo y con el teclado: la hoja sube con el teclado y el boton principal siempre queda visible.
 */
export default function ForgotPasswordModal({ visible, initialEmail = '', onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const wide = width > 600; // en pantallas anchas: tarjeta centrada de ancho de celular
  const [kb, setKb] = useState(0); // alto del teclado (para que la hoja suba y no tape el boton)
  const [tab, setTab] = useState<'reset' | 'solicitud'>('reset');
  const [email, setEmail] = useState(initialEmail);
  const [nombre, setNombre] = useState('');
  const [estacion, setEstacion] = useState('');
  const [acceso, setAcceso] = useState('');
  const [telefono, setTelefono] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setEmail(initialEmail);
      setDone(null);
      setErr(null);
    }
  }, [visible, initialEmail]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKb(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Espacio real disponible: pantalla menos teclado. El contenido se desplaza dentro y el boton queda fijo abajo.
  const avail = Math.max(280, height - kb);
  const sheetMax = Math.round(avail * 0.94);
  const scrollMax = Math.max(120, sheetMax - 250); // 250 = cabecera + boton + margenes

  const send = async (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    Keyboard.dismiss();
    setBusy(true);
    setErr(null);
    try {
      const r = await fn();
      if (r.ok) setDone(r.message ?? 'Listo.');
      else setErr(r.error ?? 'No se pudo completar. Intenta de nuevo.');
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.userMessage ?? 'Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const doReset = () => {
    const mail = email.trim();
    if (!mail.includes('@')) {
      setErr('Escribe tu correo de Traken completo.');
      return;
    }
    Alert.alert(
      '¿Restablecer tu contraseña?',
      `Se cambiará la contraseña de ${mail} y se cerrarán sus sesiones abiertas.\n\nLa nueva contraseña NO te llegará a ti: le llega al área de IT y tendrás que pedírsela al área de IT.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, restablecer', style: 'destructive', onPress: () => send(() => forgotPassword({ modo: 'reset', email: mail })) },
      ]
    );
  };

  const doSolicitud = () => {
    if (nombre.trim().length < 5 || acceso.trim().length < 3) {
      setErr('Escribe tu nombre completo y el nombre de acceso (o correo) que quieres usar.');
      return;
    }
    send(() => forgotPassword({ modo: 'solicitud', nombre: nombre.trim(), acceso: acceso.trim(), estacion: estacion.trim(), telefono: telefono.trim() }));
  };

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, wide ? styles.overlayWide : null]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, wide && styles.sheetWide, { maxHeight: sheetMax, marginBottom: wide ? 0 : kb }]}
          onPress={() => {}}
        >
          <View style={styles.grab} />

          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name="shield-checkmark" size={22} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Recuperar acceso</Text>
              <Text style={styles.subtitle}>Te ayudamos a volver a entrar</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={NAVY} />
            </Pressable>
          </View>

          {done ? (
            <View style={styles.doneBox}>
              <View style={styles.doneCircle}>
                <Ionicons name="checkmark" size={34} color="#fff" />
              </View>
              <Text style={styles.doneTitle}>¡Listo!</Text>
              <Text style={styles.doneText}>{done}</Text>
              <Pressable onPress={onClose} style={[styles.btnWrap, { alignSelf: 'stretch' }]}>
                <LinearGradient colors={[NAVY, NAVY2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  <Text style={styles.btnText}>Entendido</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.seg}>
                {([['reset', 'Tengo mi correo de Traken'], ['solicitud', 'No tengo cuenta']] as const).map(([k, l]) => (
                  <Pressable
                    key={k}
                    style={[styles.segBtn, tab === k && styles.segBtnOn]}
                    onPress={() => {
                      setTab(k);
                      setErr(null);
                    }}
                  >
                    <Text style={[styles.segText, tab === k && styles.segTextOn]} numberOfLines={1}>
                      {l}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView
                style={{ flexGrow: 0, flexShrink: 0, maxHeight: scrollMax }}
                contentContainerStyle={{ paddingBottom: 6 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {tab === 'reset' ? (
                  <View>
                    <Text style={styles.label}>Tu correo de Traken</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="mail-outline" size={18} color="#64748b" />
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={(t) => {
                          setEmail(t);
                          setErr(null);
                        }}
                        placeholder="nombre@traken.mx"
                        placeholderTextColor="#94a3b8"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                      />
                    </View>

                    <View style={styles.info}>
                      <Text style={styles.infoTitle}>Así funciona</Text>
                      <Step n={1}>Se cambia la contraseña de ese usuario y se cierran sus sesiones abiertas.</Step>
                      <Step n={2}>
                        La nueva contraseña <Text style={styles.bold}>no se muestra aquí ni te llega a ti</Text>: llega al área de IT (cuenta maestra).
                      </Step>
                      <Step n={3}>
                        Pídesela al <Text style={styles.bold}>área de IT</Text>; te la darán después de confirmar que eres tú.
                      </Step>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sub}>Si todavía no tienes usuario de Traken, manda estos datos y el área de IT te crea tu acceso.</Text>
                    <Text style={styles.label}>Nombre completo *</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="person-outline" size={18} color="#64748b" />
                      <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre y apellidos" placeholderTextColor="#94a3b8" autoCapitalize="words" />
                    </View>
                    <Text style={styles.label}>Estación o área</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="location-outline" size={18} color="#64748b" />
                      <TextInput style={styles.input} value={estacion} onChangeText={setEstacion} placeholder="Ej. CUN, SJD, Operaciones" placeholderTextColor="#94a3b8" autoCapitalize="characters" />
                    </View>
                    <Text style={styles.label}>Nombre de acceso que quieres usar *</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="at-outline" size={18} color="#64748b" />
                      <TextInput style={styles.input} value={acceso} onChangeText={setAcceso} placeholder="Ej. juan.perez o tu correo" placeholderTextColor="#94a3b8" autoCapitalize="none" autoCorrect={false} />
                    </View>
                    <Text style={styles.label}>Teléfono / WhatsApp</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="call-outline" size={18} color="#64748b" />
                      <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} placeholder="Para que IT te contacte" placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
                    </View>
                    <View style={[styles.info, { marginTop: 14 }]}>
                      <Text style={styles.infoText}>🔒 Aquí no se pide ninguna contraseña: el área de IT te asignará una y te la dará directamente.</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Fijo abajo: siempre visible, aunque el contenido se desplace o el teclado este abierto */}
              {err ? <Text style={styles.err}>⚠ {err}</Text> : null}
              <Pressable style={[styles.btnWrap, busy && { opacity: 0.6 }]} disabled={busy} onPress={tab === 'reset' ? doReset : doSolicitud}>
                <LinearGradient colors={[NAVY, NAVY2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={tab === 'reset' ? 'key-outline' : 'paper-plane-outline'} size={18} color="#fff" />
                      <Text style={styles.btnText}>{tab === 'reset' ? 'Restablecer contraseña' : 'Solicitar acceso'}</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end', alignItems: 'stretch' },
  overlayWide: { justifyContent: 'center', alignItems: 'center' },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  sheetWide: { maxWidth: 480, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  grab: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#e8eefc', alignItems: 'center', justifyContent: 'center' },
  title: { color: NAVY, fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { color: '#64748b', fontSize: 12.5, marginTop: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 3, marginBottom: 6 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 11 },
  segBtnOn: { backgroundColor: NAVY },
  segText: { color: NAVY, fontWeight: '700', fontSize: 12.5 },
  segTextOn: { color: '#fff' },
  sub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 8 },
  label: { color: '#64748b', fontSize: 11, fontWeight: '800', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f1f5f9', borderRadius: 14, height: 50, paddingHorizontal: 14 },
  input: { flex: 1, color: NAVY, fontSize: 15 },
  info: { backgroundColor: '#f3f7ff', borderWidth: 1, borderColor: '#d6e2fb', borderRadius: 16, padding: 14, marginTop: 14 },
  infoTitle: { color: NAVY, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  infoText: { color: '#1e3a8a', fontSize: 12.5, lineHeight: 19 },
  step: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepText: { flex: 1, color: '#1e3a8a', fontSize: 12.5, lineHeight: 18 },
  bold: { fontWeight: '800' },
  err: { color: '#b91c1c', fontSize: 12.5, fontWeight: '700', marginTop: 10 },
  btnWrap: { marginTop: 14 },
  btn: { flexDirection: 'row', gap: 8, borderRadius: 16, height: 54, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15.5, letterSpacing: 0.2 },
  doneBox: { alignItems: 'center', paddingVertical: 8 },
  doneCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneTitle: { color: NAVY, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  doneText: { color: '#334155', fontSize: 14, textAlign: 'center', lineHeight: 21, paddingHorizontal: 6 },
});
