import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { esEntornoPruebas } from '../config/environment';

// Identifica «Traken Pruebas» en el login y en todas las pantallas. Ocupa su
// espacio para no tapar encabezados. Ámbar oscuro porque las pantallas dejan
// la barra de estado con íconos claros.
export default function FranjaPruebas({ children }: { children: React.ReactNode }) {
  if (!esEntornoPruebas()) return <>{children}</>;

  return (
    <>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.franja}>
        <Text style={styles.texto}>PRUEBAS · SANDBOX</Text>
      </SafeAreaView>
      {/* Las pantallas calculan su área segura desde debajo de la franja. */}
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </>
  );
}

const styles = StyleSheet.create({
  franja: { backgroundColor: '#b45309' },
  texto: {
    color: '#fff',
    fontFamily: 'Raleway_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 4,
  },
});
