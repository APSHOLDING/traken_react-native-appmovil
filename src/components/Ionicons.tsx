import React from 'react';
import { View } from 'react-native';
import Base from '@expo/vector-icons/Ionicons';
import { useIconStyle } from '../utils/iconStyle';
import { hexA } from '../theme/themes';

type BaseProps = React.ComponentProps<typeof Base>;

// Flechas, cerrar, buscar, etc. no llevan pastilla (se ven mal mas chicos).
const NO_CHIP = /^(arrow|chevron|close|search|add|remove|ellipsis|caret|menu|checkmark$|trash|eye)/;

/**
 * Reemplazo de Ionicons para TODA la app. En estilo "classic" es identico al original.
 * En estilo "filled" (Inicio > Personalizar > Iconos):
 *  - los iconos de contorno pasan a su version rellena, y
 *  - los de tamano mediano/grande y color propio van dentro de una pastilla suave del mismo color
 *    (la caja mide lo mismo que el icono: no mueve nada del diseño).
 */
function Ionicons(props: BaseProps) {
  const style = useIconStyle();
  if (style !== 'filled') return <Base {...props} />;

  let name = props.name as string;
  if (name.endsWith('-outline')) {
    const filled = name.slice(0, -'-outline'.length);
    if (filled in (Base.glyphMap as Record<string, number>)) name = filled;
  }
  const size = typeof props.size === 'number' ? props.size : 12;
  const color = typeof props.color === 'string' ? props.color : '';
  const chipOk = size >= 18 && !props.style && /^#[0-9a-f]{6}$/i.test(color) && !/^#f{6}$/i.test(color) && !NO_CHIP.test(name);

  if (chipOk) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hexA(color, 0.14),
        }}
      >
        <Base {...props} name={name as BaseProps['name']} size={Math.round(size * 0.74)} />
      </View>
    );
  }
  return <Base {...props} name={name as BaseProps['name']} />;
}

Ionicons.glyphMap = Base.glyphMap;

export default Ionicons;
