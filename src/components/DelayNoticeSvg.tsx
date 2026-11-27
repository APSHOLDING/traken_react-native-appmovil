import React, { forwardRef } from 'react';
import { Platform } from 'react-native';
import Svg, { Defs, G, Image as SvgImage, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { NoticeLayout } from '../utils/delayNotice';

type Props = { layout: NoticeLayout; width: number };

// En el navegador se usa Arial (igual que el servidor); en el celular, la fuente del sistema.
const FONT = Platform.select({ web: 'Arial, Helvetica, sans-serif', default: undefined });

/**
 * Dibuja el aviso de retraso (diseno calculado por utils/delayNotice.ts). Es vectorial: se ve nitido a
 * cualquier tamano y el celular lo puede exportar a PNG con toDataURL (ver noticeToBase64).
 */
const DelayNoticeSvg = forwardRef<Svg, Props>(function DelayNoticeSvg({ layout, width }, ref) {
  const { W, H, items } = layout;
  const height = (H * width) / W;
  return (
    <Svg ref={ref} width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="dnGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0891b2" />
          <Stop offset="1" stopColor="#16214d" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      {items.map((it, i) => {
        switch (it.k) {
          case 'grad':
            return <Rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill="url(#dnGrad)" />;
          case 'text':
            return (
              <SvgText
                key={i}
                x={it.x}
                y={it.y}
                fontSize={it.size}
                fontWeight={it.bold ? 'bold' : 'normal'}
                fontFamily={FONT}
                fill={it.fill}
                textAnchor={it.anchor}
              >
                {it.text}
              </SvgText>
            );
          case 'line':
            return <Line key={i} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.stroke} strokeWidth={1} />;
          case 'rrect':
            return <Rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={it.r} ry={it.r} fill={it.fill} />;
          case 'qr':
            return (
              <G key={i} transform={`translate(${it.x} ${it.y})`}>
                <Rect x={0} y={0} width={it.size} height={it.size} fill="#ffffff" />
                <Path d={it.path} fill={it.color} />
              </G>
            );
          case 'logo':
            return (
              <SvgImage
                key={i}
                href={{ uri: it.uri }}
                x={it.x}
                y={it.y}
                width={it.w}
                height={it.h}
                preserveAspectRatio="xMidYMid meet"
              />
            );
          default:
            return null;
        }
      })}
    </Svg>
  );
});

export default DelayNoticeSvg;

/**
 * Exporta el aviso a PNG (base64) en el celular. Sale al doble de resolucion (1520 px de ancho) para que
 * se vea nitido al compartirlo. En web no existe: ahi se usa la descarga del servidor.
 */
export function noticeToBase64(svg: Svg | null, layout: NoticeLayout): Promise<string> {
  return new Promise((resolve, reject) => {
    const anySvg = svg as unknown as { toDataURL?: (cb: (b64: string) => void, opts?: object) => void } | null;
    if (!anySvg || typeof anySvg.toDataURL !== 'function') {
      reject(new Error('toDataURL no disponible'));
      return;
    }
    const t = setTimeout(() => reject(new Error('tiempo agotado al exportar')), 15000);
    anySvg.toDataURL(
      (b64: string) => {
        clearTimeout(t);
        resolve(b64);
      },
      { width: layout.W * 2, height: layout.H * 2 }
    );
  });
}
