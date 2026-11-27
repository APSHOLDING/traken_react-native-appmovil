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
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { getLastEmail } from '../utils/credentials';
import { FIXED_ENVIRONMENT, PRODUCTION_UNLOCKED } from '../config/environment';

// Login en tema claro: el logo oficial es azul marino y celeste sobre blanco,
// asi que se ve limpio y profesional directo sobre fondo blanco, sin tarjeta.
const L = {
  bg: ['#ffffff', '#f3f6fb'] as const,
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

  // El correo se recuerda aunque hayas cerrado sesion antes (se guarda al
  // iniciar sesion con exito, ver AuthContext). La contrasena NO se guarda
  // aqui por seguridad -- el propio telefono la ofrece autocompletar solo
  // (Llavero en iOS, Autofill/Smart Lock en Android) gracias a
  // textContentType/autoComplete en los inputs de abajo.
  React.useEffect(() => {
    getLastEmail().then((saved) => {
      if (saved) setUsername(saved);
    });
  }, []);

  const pressScale = useRef(new Animated.Value(1)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(20)).current;

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

  const handlePressIn = () =>
    Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const handlePressOut = () =>
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await login(username.trim(), password);
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

  return (
    <LinearGradient colors={L.bg} style={styles.flex}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.brand, { opacity: logoFade }]}>
              <Image source={require('../../assets/logo-traken.png')} style={styles.logoImage} resizeMode="contain" />
              <Text style={styles.brandSubtitle}>OPERACIONES · GROUND CONTROL</Text>
            </Animated.View>

            {!FIXED_ENVIRONMENT && (
              <View style={styles.envRow}>
                <Pressable
                  style={[styles.envPill, environment === 'sandbox' && styles.envPillActiveSandbox]}
                  onPress={() => setEnvironment('sandbox')}
                >
                  <Ionicons name="flask-outline" size={13} color={environment === 'sandbox' ? '#06322f' : L.muted} />
                  <Text style={[styles.envPillText, environment === 'sandbox' && styles.envPillTextActiveSandbox]}>
                    Sandbox (pruebas)
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.envPill,
                    environment === 'production' && styles.envPillActiveProd,
                    !PRODUCTION_UNLOCKED && styles.envPillLocked,
                  ]}
                  onPress={handleTapProduction}
                >
                  <Ionicons
                    name={PRODUCTION_UNLOCKED ? 'globe-outline' : 'lock-closed'}
                    size={13}
                    color={environment === 'production' ? '#fff' : L.muted}
                  />
                  <Text style={[styles.envPillText, environment === 'production' && styles.envPillTextActiveProd]}>
                    Producción
                  </Text>
                </Pressable>
              </View>
            )}

            <Animated.View style={[styles.form, { opacity: formFade, transform: [{ translateY: formSlide }] }]}>
              <Text style={styles.welcome}>Bienvenido</Text>
              <Text style={styles.welcomeSub}>
                {productionLoginDisabled
                  ? 'El inicio de sesión en producción está temporalmente deshabilitado.'
                  : 'Inicia sesión para continuar tu operación'}
              </Text>

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

              <View style={styles.beforeButton} />

              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                  <LinearGradient
                    colors={canSubmit ? L.button : ['#cbd5e1', '#cbd5e1']}
                    style={styles.button}
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
            </Animated.View>

            <Text style={styles.footer}>APS · Above All We Care</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logoImage: {
    width: 260,
    height: 140,
  },
  brandSubtitle: {
    color: L.muted,
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 2,
    fontWeight: '700',
  },
  envRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  envPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: L.line,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  envPillActiveSandbox: { backgroundColor: colors.teal, borderColor: colors.teal },
  envPillActiveProd: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  envPillLocked: { opacity: 0.6 },
  envPillText: { color: L.muted, fontSize: 11, fontWeight: '700' },
  envPillTextActiveSandbox: { color: '#06322f' },
  envPillTextActiveProd: { color: '#fff' },
  form: {
    paddingTop: 4,
  },
  welcome: {
    color: L.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  welcomeSub: {
    color: L.muted,
    fontSize: 13.5,
    marginTop: 4,
    marginBottom: 22,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12.5,
    flexShrink: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L.field,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 14,
  },
  inputWrapFocused: {
    borderColor: L.accent,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    color: L.ink,
    fontSize: 15,
  },
  beforeButton: {
    height: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footer: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 11.5,
    marginTop: 30,
    letterSpacing: 0.5,
  },
});
