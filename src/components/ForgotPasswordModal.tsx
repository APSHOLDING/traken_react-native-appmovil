import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from './Ionicons';
import { forgotPassword } from '../api/client';

type Props = { visible: boolean; initialEmail?: string; onClose: () => void };

/**
 * "¿Olvidaste tu contraseña?" -- con cuenta maestra (area de IT):
 *  - Tengo mi correo de Traken: se restablece y la nueva contraseña le llega SOLO a IT; hay que pedirsela a Lara de IT.
 *  - No tengo cuenta: se piden nombre completo, estacion, acceso deseado y telefono; IT crea la cuenta (sin contraseñas por aqui).
 */
export default function ForgotPasswordModal({ visible, initialEmail = '', onClose }: Props) {
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

  const send = async (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
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
      `Se cambiará la contraseña de ${mail} y se cerrarán sus sesiones abiertas.\n\nLa nueva contraseña NO te llegará a ti: le llega al área de IT y tendrás que pedírsela a Lara de IT.`,
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ justifyContent: 'flex-end' }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <Text style={styles.title}>Recuperar acceso</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color="#16214d" />
              </Pressable>
            </View>

            {done ? (
              <View style={styles.doneBox}>
                <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
                <Text style={styles.doneText}>{done}</Text>
                <Pressable style={styles.btn} onPress={onClose}>
                  <Text style={styles.btnText}>Entendido</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                      <Text style={[styles.segText, tab === k && styles.segTextOn]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>

                {tab === 'reset' ? (
                  <View>
                    <Text style={styles.label}>Tu correo de Traken</Text>
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
                    <View style={styles.info}>
                      <Text style={styles.infoTitle}>🔐 Cómo funciona</Text>
                      <Text style={styles.infoText}>
                        • Se cambia la contraseña de ese usuario y se cierran sus sesiones abiertas.{'\n'}• La nueva contraseña{' '}
                        <Text style={{ fontWeight: '800' }}>no se muestra aquí ni te llega a ti</Text>: llega al área de IT (cuenta
                        maestra).{'\n'}• Pídesela a <Text style={{ fontWeight: '800' }}>Lara de IT</Text>, quien te la dará después de
                        confirmar que eres tú.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sub}>Si todavía no tienes usuario de Traken, manda estos datos y el área de IT te crea tu acceso.</Text>
                    <Text style={styles.label}>Nombre completo *</Text>
                    <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre y apellidos" placeholderTextColor="#94a3b8" autoCapitalize="words" />
                    <Text style={styles.label}>Estación o área</Text>
                    <TextInput style={styles.input} value={estacion} onChangeText={setEstacion} placeholder="Ej. CUN, SJD, Operaciones" placeholderTextColor="#94a3b8" autoCapitalize="characters" />
                    <Text style={styles.label}>Nombre de acceso que quieres usar *</Text>
                    <TextInput style={styles.input} value={acceso} onChangeText={setAcceso} placeholder="Ej. juan.perez o tu correo" placeholderTextColor="#94a3b8" autoCapitalize="none" autoCorrect={false} />
                    <Text style={styles.label}>Teléfono / WhatsApp</Text>
                    <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} placeholder="Para que IT te contacte" placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
                    <View style={styles.info}>
                      <Text style={styles.infoText}>
                        🔒 Aquí no se pide ninguna contraseña: el área de IT te asignará una y te la dará directamente.
                      </Text>
                    </View>
                  </View>
                )}

                {err ? <Text style={styles.err}>⚠ {err}</Text> : null}

                <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={tab === 'reset' ? doReset : doSolicitud}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{tab === 'reset' ? 'Restablecer contraseña' : 'Solicitar acceso'}</Text>}
                </Pressable>
              </ScrollView>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, maxHeight: '90%' },
  grab: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: '#16214d', fontSize: 20, fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 3, marginBottom: 14 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  segBtnOn: { backgroundColor: '#16214d' },
  segText: { color: '#16214d', fontWeight: '700', fontSize: 12.5 },
  segTextOn: { color: '#fff' },
  sub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  label: { color: '#64748b', fontSize: 11.5, fontWeight: '800', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 14, height: 50, paddingHorizontal: 14, color: '#16214d', fontSize: 15 },
  info: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 14, padding: 12, marginTop: 14 },
  infoTitle: { color: '#1e3a8a', fontWeight: '800', fontSize: 13, marginBottom: 4 },
  infoText: { color: '#1e3a8a', fontSize: 12.5, lineHeight: 19 },
  err: { color: '#b91c1c', fontSize: 12.5, fontWeight: '700', marginTop: 12 },
  btn: { backgroundColor: '#16214d', borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  doneBox: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  doneText: { color: '#16214d', fontSize: 14.5, textAlign: 'center', lineHeight: 21 },
});
