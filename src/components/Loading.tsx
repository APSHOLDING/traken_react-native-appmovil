import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { hexA } from '../theme/themes';

type Props = {
  label?: string;
  style?: StyleProp<ViewStyle>;
  /** Diametro del aro (por defecto 58). */
  size?: number;
};

/**
 * "Cargando" elegante: un aro que gira con el color del tema y la marca de Traken latiendo al centro.
 * Todo con animaciones nativas (sin librerias nuevas ni peso extra: reusa el logo que ya trae la app).
 */
export default function Loading({ label = 'Cargando…', style, size = 58 }: Props) {
  const p = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [spin, beat]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.08] });
  const opacity = beat.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  const logo = Math.round(size * 0.5);

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: hexA(p.accent, 0.16),
              borderTopColor: p.accent,
              borderRightColor: hexA(p.accent, 0.5),
              transform: [{ rotate }],
            },
          ]}
        />
        <Animated.Image
          source={require('../../assets/logo-mark.png')}
          style={{ width: logo, height: logo, opacity, transform: [{ scale }] }}
          resizeMode="contain"
        />
      </View>
      {label ? <Text style={[styles.label, { color: p.textMuted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  ring: { position: 'absolute', borderWidth: 3 },
  label: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.2 },
});
