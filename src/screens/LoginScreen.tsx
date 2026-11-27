import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { clearRememberedLogin, getLastEmail, getRememberedLogin, saveRememberedLogin, SavedLogin } from '../utils/credentials';
import { authenticateBiometric, isBiometricAvailable } from '../utils/biometric';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import { FIXED_ENVIRONMENT, PRODUCTION_UNLOCKED } from '../config/environment';

// Login en tema claro: el logo oficial es azul marino y celeste sobre blanco,
// asi que se ve limpio y profesional sobre fondo claro con una tarjeta elevada.
const L = {
  bg: ['#ffffff', '#e8f0fa'] as const,
  ink: colors.navy,
  muted: '#64748b',
  line: '#e2e8f0',
  field: '#f1f5f9',
  placeholder: '#94a3b8',
  accent: colors.teal,
  button: [colors.navy, colors.navy3] as const,
};

export default function LoginScreen() {
  const { login, isAuthenticating, error, clearError, environment, setEnvironment } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'user' | 'pass' | null>(null);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState<SavedLogin | null>(null);
  const [bioOk, setBioOk] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const autoTried = useRef(false);

  const doLogin = React.useCallback(
    async (u: string, p: string, fromSaved = false) => {
      const ok = await login(u.trim(), p);
      if (ok) {
        // "Recordar mi contraseña" lo elige la persona; se guarda cifrada solo en este telefono.
        if (remember || fromSaved) await saveRememberedLogin(u.trim(), p);
        else await clearRememberedLogin();
      } else if (fromSaved) {
        // La contraseña guardada ya no sirve (por ejemplo IT se la cambio): se olvida para que escriba la nueva.
        await clearRememberedLogin();
        setSaved(null);
        setPassword('');
      }
      return ok;
    },
    [login, remember]
  );

  // El correo se recuerda siempre; la contraseña solo si la persona lo eligio (almacen cifrado del telefono).
  // Con huella disponible se ofrece "Entrar con huella" (y se pide sola al abrir); sin huella se precarga la contraseña.
  React.useEffect(() => {
    (async () => {
      const [bio, rem, lastMail] = await Promise.all([isBiometricAvailable(), getRememberedLogin(), getLastEmail()]);
      setBioOk(bio);
      if (rem) {
        setSaved(rem);
        setUsername(rem.email);
        setRemember(true);
        if (bio) {
          if (!autoTried.current) {
            autoTried.current = true;
            setTimeout(async () => {
              if (await authenticateBiometric('Entra a Traken')) doLogin(rem.email, rem.password, true);
            }, 450);
          }
        } else {
          setPassword(rem.password);
        }
      } else if (lastMail) {
        setUsername(lastMail);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pressScale = useRef(new Animated.Value(1)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(logoFade, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(formFade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(formSlide, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const productionLoginDisabled = environment === 'production' && !PRODUCTION_UNLOCKED;
  const canSubmit = !productionLoginDisabled && username.trim().length > 0 && password.length > 0 && !isAuthenticating;

  const handlePressIn = () => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const handlePressOut = () => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await doLogin(username, password);
  };

  const handleBiometric = async () => {
    if (!saved || isAuthenticating) return;
    if (await authenticateBiometric('Entra a Traken')) await doLogin(saved.email, saved.password, true);
  };

  const forgetSaved = () => {
    Alert.alert('¿Olvidar la contraseña guardada?', 'La próxima vez tendrás que escribirla otra vez.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Olvidarla',
        style: 'destructive',
        onPress: async () => {
          await clearRememberedLogin();
          setSaved(null);
          setPassword('');
          setRemember(false);
        },
      },
    ]);
  };

  const handleTapProduction = () => {
    if (PRODUCTION_UNLOCKED) {
      setEnvironment('production');
      return;
    }
    Alert.alert(
      'Producción bloqueada',
      'Esta app todavía está en pruebas contra el ambiente Sandbox (datos de prueba). El modo Producción se activará cuando se confirme que todo funciona bien.'
    );
  };

  const version = Constants.expoConfig?.version ?? '';

  return (
    <LinearGradient colors={L.bg} style={styles.flex}>
      <StatusBar style="dark" />
      {/* Adornos de fondo: dos halos suaves con los colores de la marca */}
      <View style={styles.halo1} pointerEvents="none" />
      <View style={styles.halo2} pointerEvents="none" />

      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View style={[styles.brand, { opacity: logoFade }]}>
              <Image source={require('../../assets/logo-traken.png')} style={styles.logoImage} resizeMode="contain" />
              <View style={styles.tagline}>
                <View style={styles.taglineDot} />
                <Text style={styles.brandSubtitle}>OPERACIONES · GROUND CONTROL</Text>
                <View style={styles.taglineDot} />
              </View>
            </Animated.View>

            {!FIXED_ENVIRONMENT && (
              <View style={styles.envRow}>
                <Pressable style={[styles.envPill, environment === 'sandbox' && styles.envPillActiveSandbox]} onPress={() => setEnvironment('sandbox')}>
                  <Ionicons name="flask-outline" size={13} color={environment === 'sandbox' ? '#06322f' : L.muted} />
                  <Text style={[styles.envPillText, environment === 'sandbox' && styles.envPillTextActiveSandbox]}>Sandbox (pruebas)</Text>
                </Pressable>
                <Pressable
                  style={[styles.envPill, environment === 'production' && styles.envPillActiveProd, !PRODUCTION_UNLOCKED && styles.envPillLocked]}
                  onPress={handleTapProduction}
                >
                  <Ionicons name={PRODUCTION_UNLOCKED ? 'globe-outline' : 'lock-closed'} size={13} color={environment === 'production' ? '#fff' : L.muted} />
                  <Text style={[styles.envPillText, environment === 'production' && styles.envPillTextActiveProd]}>Producción</Text>
                </Pressable>
              </View>
            )}

            <Animated.View style={[styles.card, { opacity: formFade, transform: [{ translateY: formSlide }] }]}>
              <Text style={styles.welcome}>{saved ? `Hola de nuevo` : 'Bienvenido'}</Text>
              <Text style={styles.welcomeSub}>
                {productionLoginDisabled
                  ? 'El inicio de sesión en producción está temporalmente deshabilitado.'
                  : saved
                    ? saved.email
                    : 'Inicia sesión para continuar tu operación'}
              </Text>

              {saved && bioOk ? (
                <Pressable style={styles.bioBtn} onPress={handleBiometric} disabled={isAuthenticating}>
                  <Ionicons name="finger-print" size={26} color={colors.navy} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bioTitle}>Entrar con huella</Text>
                    <Text style={styles.bioSub}>Usa tu contraseña guardada en este teléfono</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={L.muted} />
                </Pressable>
              ) : null}

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={[styles.inputWrap, focusedField === 'user' && styles.inputWrapFocused]}>
                <Ionicons name="person-outline" size={18} color={focusedField === 'user' ? L.accent : L.muted} />
                <TextInput
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    if (error) clearError();
                  }}
                  onFocus={() => setFocusedField('user')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Usuario o correo"
                  placeholderTextColor={L.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  autoComplete="username"
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

              <View style={[styles.inputWrap, focusedField === 'pass' && styles.inputWrapFocused]}>
                <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'pass' ? L.accent : L.muted} />
                <TextInput
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) clearError();
                  }}
                  onFocus={() => setFocusedField('pass')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Contraseña"
                  placeholderTextColor={L.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  style={styles.input}
                  returnKeyType="go"
                  onSubmitEditing={handleSubmit}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={L.muted} />
                </Pressable>
              </View>

              <View style={styles.optionsRow}>
                <Pressable style={styles.checkRow} onPress={() => setRemember((v) => !v)} hitSlop={6}>
                  <View style={[styles.checkBox, remember && styles.checkBoxOn]}>
                    {remember ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <Text style={styles.checkText}>Recordar mi contraseña</Text>
                </Pressable>
                <Pressable onPress={() => setShowForgot(true)} hitSlop={8}>
                  <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
                </Pressable>
              </View>
              {remember ? <Text style={styles.rememberNote}>🔒 Se guarda cifrada solo en este teléfono, nunca en el servidor.</Text> : null}

              <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleSubmit} disabled={!canSubmit} style={{ marginTop: 14 }}>
                <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                  <LinearGradient
                    colors={canSubmit ? L.button : ['#cbd5e1', '#cbd5e1']}
                    style={[styles.button, canSubmit && styles.buttonShadow]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {isAuthenticating ? (
                      <Text style={styles.buttonText}>Verificando…</Text>
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Ingresar</Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </Animated.View>
              </Pressable>

              {saved ? (
                <Pressable onPress={forgetSaved} style={styles.forgetBtn} hitSlop={8}>
                  <Text style={styles.forgetText}>Olvidar la contraseña guardada en este teléfono</Text>
                </Pressable>
              ) : null}
            </Animated.View>

            <View style={styles.trust}>
              <Ionicons name="shield-checkmark" size={14} color={L.accent} />
              <Text style={styles.trustText}>Conexión segura · tus datos viajan cifrados</Text>
            </View>

            <Pressable onPress={() => setShowForgot(true)} style={styles.help} hitSlop={6}>
              <Ionicons name="help-buoy-outline" size={15} color={L.muted} />
              <Text style={styles.helpText}>¿Problemas para entrar? Pide ayuda al área de IT</Text>
            </Pressable>

            <Text style={styles.footer}>APS · Above All We Care{version ? `  ·  v${version}` : ''}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ForgotPasswordModal visible={showForgot} initialEmail={username.includes('@') ? username : ''} onClose={() => setShowForgot(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  halo1: { position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(32,185,177,0.13)' },
  halo2: { position: 'absolute', bottom: -110, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(22,33,77,0.07)' },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingVertical: 20, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 18 },
  logoImage: { width: 250, height: 128 },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  taglineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: L.accent },
  brandSubtitle: { color: L.muted, fontSize: 10.5, letterSpacing: 2, fontWeight: '800' },
  envRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  envPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: L.line, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  envPillActiveSandbox: { backgroundColor: colors.teal, borderColor: colors.teal },
  envPillActiveProd: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  envPillLocked: { opacity: 0.6 },
  envPillText: { color: L.muted, fontSize: 11, fontWeight: '700' },
  envPillTextActiveSandbox: { color: '#06322f' },
  envPillTextActiveProd: { color: '#fff' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    shadowColor: '#16214d',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  welcome: { color: L.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  welcomeSub: { color: L.muted, fontSize: 13.5, marginTop: 4, marginBottom: 18 },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eef6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  bioTitle: { color: L.ink, fontSize: 14.5, fontWeight: '800' },
  bioSub: { color: L.muted, fontSize: 11.5, marginTop: 1 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 },
  errorText: { color: '#b91c1c', fontSize: 12.5, flexShrink: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: L.field, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 14, height: 52, marginBottom: 12 },
  inputWrapFocused: { borderColor: L.accent, backgroundColor: '#fff' },
  input: { flex: 1, color: L.ink, fontSize: 15 },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkBoxOn: { backgroundColor: L.accent, borderColor: L.accent },
  checkText: { color: L.ink, fontSize: 12.5, fontWeight: '600' },
  link: { color: colors.navy3, fontSize: 12.5, fontWeight: '800' },
  rememberNote: { color: L.muted, fontSize: 11, marginTop: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 14 },
  buttonShadow: { shadowColor: colors.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 6 },
  buttonText: { color: '#fff', fontSize: 15.5, fontWeight: '700', letterSpacing: 0.2 },
  forgetBtn: { alignSelf: 'center', marginTop: 14 },
  forgetText: { color: '#94a3b8', fontSize: 11.5, textDecorationLine: 'underline' },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
  trustText: { color: L.muted, fontSize: 11.5, fontWeight: '600' },
  help: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  helpText: { color: L.muted, fontSize: 12, textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 11.5, marginTop: 18, letterSpacing: 0.5 },
});
