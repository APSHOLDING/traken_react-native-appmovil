import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Marcas visuales de las O.S. de PRUEBA (las que se marcaron como test): siempre en amarillo y con la leyenda,
 * para que nadie las confunda con una operacion real. Por defecto las listas NO las muestran.
 */
export const PRUEBA_BORDER = '#f59e0b';

export function PruebaBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>🧪 PRUEBA</Text>
    </View>
  );
}

/** Aviso + filtro: "N O.S. de prueba ocultas · Mostrar" / "Mostrando O.S. de prueba · Ocultar". */
export function PruebaToggle({ hidden, show, onToggle }: { hidden: number; show: boolean; onToggle: () => void }) {
  if (!show && hidden <= 0) return null;
  return (
    <Pressable style={styles.bar} onPress={onToggle}>
      <Text style={styles.barText} numberOfLines={2}>
        {show
          ? '🧪 Mostrando O.S. de PRUEBA (marcadas en amarillo). No las tomes en cuenta.'
          : `🧪 ${hidden} O.S. de prueba ocultas (no se muestran por ser test).`}
      </Text>
      <View style={styles.btn}>
        <Text style={styles.btnText}>{show ? 'Ocultar' : 'Mostrar'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: '#f59e0b', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  barText: { flex: 1, color: '#78350f', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  btn: { backgroundColor: '#d97706', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
