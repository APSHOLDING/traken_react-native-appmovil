import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Solo los 5 pesos que se usan (importar todo el paquete metia las 18 fuentes en la app: ~3 MB de mas).
import { useFonts } from 'expo-font';
import { Raleway_400Regular } from '@expo-google-fonts/raleway/400Regular';
import { Raleway_500Medium } from '@expo-google-fonts/raleway/500Medium';
import { Raleway_600SemiBold } from '@expo-google-fonts/raleway/600SemiBold';
import { Raleway_700Bold } from '@expo-google-fonts/raleway/700Bold';
import { Raleway_800ExtraBold } from '@expo-google-fonts/raleway/800ExtraBold';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import UpdateBanner from './src/components/UpdateBanner';
import BiometricGate from './src/components/BiometricGate';
import PendingSyncBanner from './src/components/PendingSyncBanner';
import FranjaPruebas from './src/components/FranjaPruebas';
import ErrorBoundary from './src/components/ErrorBoundary';
import GuardianBanner from './src/components/GuardianBanner';
import { startGuardian } from './src/utils/guardian';
import { colors } from './src/theme/colors';

function registerPwa() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export default function App() {
  React.useEffect(() => {
    registerPwa();
  }, []);
  // Guardian: vigila errores, lentitud y señal baja, y deja todo en la bitacora.
  React.useEffect(() => startGuardian(), []);

  const [fontsLoaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
    Raleway_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy }}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
      <ThemeProvider>
      <FranjaPruebas>
        <AuthProvider>
          <BiometricGate>
            <RootNavigator />
            <UpdateBanner />
            <PendingSyncBanner />
            <GuardianBanner />
          </BiometricGate>
        </AuthProvider>
      </FranjaPruebas>
      </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
