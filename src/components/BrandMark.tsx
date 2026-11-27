import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/**
 * Emblema de Traken (el pulpo-cerebro) para el encabezado de cada pantalla: va en el hueco que queda a la
 * derecha del titulo, del mismo tamano que el boton de volver, asi el titulo sigue centrado. En los estilos
 * oscuros va sobre una insignia blanca para que se lea bien.
 */
export default function BrandMark() {
  const p = useTheme();
  return (
    <View style={[styles.box, p.isDark && styles.badge]} pointerEvents="none">
      <Image source={require('../../assets/logo-mark.png')} style={styles.img} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: '#ffffff', borderRadius: 12 },
  img: { width: 30, height: 30 },
});
