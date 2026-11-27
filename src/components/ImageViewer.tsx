import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '../components/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logEvent } from '../utils/activityLog';

export type ViewerImage = { url: string; title?: string; /** grados guardados de la foto (0/90/180/270) */ rotation?: number };

type Props = {
  visible: boolean;
  images: ViewerImage[];
  startIndex?: number;
  onClose: () => void;
};

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Visor de fotos a pantalla completa:
 *  - Pellizca con 2 dedos para acercar/alejar, arrastra para moverte con zoom.
 *  - Doble toque: acerca / regresa.
 *  - Desliza a los lados para pasar a la foto anterior/siguiente SIN cerrar el visor
 *    (con las flechas tambien). Las fotos vecinas se precargan para que el cambio sea inmediato
 *    y las ya vistas se siguen mostrando aunque no haya internet.
 * Hecho solo con piezas de React Native (sin librerias nuevas): no suma peso a la app.
 */
export default function ImageViewer({ visible, images, startIndex = 0, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ViewerImage>>(null);
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    if (visible) {
      setIndex(startIndex);
      setZoomed(false);
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(t);
    }
  }, [visible, startIndex]);

  // Bitacora: que foto esta viendo (una vez por foto).
  useEffect(() => {
    if (!visible) return;
    const im = images[Math.min(index, images.length - 1)];
    if (im) logEvent('ver_foto', { text: `Vio la foto ${Math.min(index, images.length - 1) + 1} de ${images.length}${im.title ? ' (' + im.title + ')' : ''}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index]);

  // Precarga las fotos vecinas para que al deslizar ya esten listas.
  useEffect(() => {
    if (!visible) return;
    [index - 1, index + 1].forEach((i) => {
      const im = images[i];
      if (im) Image.prefetch(im.url).catch(() => {});
    });
  }, [visible, index, images]);

  const go = (to: number) => {
    if (to < 0 || to >= images.length) return;
    listRef.current?.scrollToIndex({ index: to, animated: true });
    setIndex(to);
    setZoomed(false);
  };

  if (!visible || images.length === 0) return null;
  const current = images[Math.min(index, images.length - 1)];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <RNStatusBar barStyle="light-content" />
        <FlatList
          key={width}
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(im, i) => im.url + i}
          initialScrollIndex={Math.min(startIndex, images.length - 1)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index) {
              setIndex(i);
              setZoomed(false);
            }
          }}
          renderItem={({ item, index: i }) => (
            <ZoomableImage uri={item.url} rotation={item.rotation ?? 0} width={width} height={height} active={i === index} onZoomChange={setZoomed} />
          )}
        />

        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {Math.min(index, images.length - 1) + 1} / {images.length}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </SafeAreaView>

        {!zoomed && images.length > 1 ? (
          <>
            {index > 0 ? (
              <Pressable style={[styles.arrow, { left: 8 }]} onPress={() => go(index - 1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Pressable>
            ) : null}
            {index < images.length - 1 ? (
              <Pressable style={[styles.arrow, { right: 8 }]} onPress={() => go(index + 1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={26} color="#fff" />
              </Pressable>
            ) : null}
          </>
        ) : null}

        <View style={styles.bottom} pointerEvents="none">
          {current?.title ? <Text style={styles.title} numberOfLines={1}>{current.title}</Text> : null}
          {showHint ? (
            <Text style={styles.hint}>
              Pellizca para acercar · Doble toque para zoom{images.length > 1 ? ' · Desliza para ver las demás' : ''}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function dist(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function ZoomableImage({
  uri,
  rotation,
  width,
  height,
  active,
  onZoomChange,
}: {
  uri: string;
  rotation: number;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (z: boolean) => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const ax = useRef(new Animated.Value(0)).current;
  const ay = useRef(new Animated.Value(0)).current;
  const st = useRef({ s: 1, x: 0, y: 0, zoomed: false, w: width, h: height });
  const g = useRef({
    pinch: null as null | { d0: number; s0: number },
    px: 0,
    py: 0,
    moved: false,
    t0: 0,
    lastTap: 0,
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  st.current.w = width;
  st.current.h = height;

  const apply = (s: number, x: number, y: number, animate = false) => {
    const cur = st.current;
    const ns = Math.max(1, Math.min(MAX_SCALE, s));
    const maxX = ((ns - 1) * cur.w) / 2;
    const maxY = ((ns - 1) * cur.h) / 2;
    const nx = ns <= 1 ? 0 : Math.max(-maxX, Math.min(maxX, x));
    const ny = ns <= 1 ? 0 : Math.max(-maxY, Math.min(maxY, y));
    cur.s = ns;
    cur.x = nx;
    cur.y = ny;
    if (animate) {
      Animated.parallel([
        Animated.timing(sc, { toValue: ns, duration: 180, useNativeDriver: true }),
        Animated.timing(ax, { toValue: nx, duration: 180, useNativeDriver: true }),
        Animated.timing(ay, { toValue: ny, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      sc.setValue(ns);
      ax.setValue(nx);
      ay.setValue(ny);
    }
    const z = ns > 1.02;
    if (z !== cur.zoomed) {
      cur.zoomed = z;
      onZoomChange(z);
    }
  };

  // Al cambiar de foto, la que se deja vuelve a su tamano normal.
  useEffect(() => {
    if (!active && st.current.s !== 1) apply(1, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Sin zoom, el deslizar lo toma la lista (para pasar de foto); con zoom nos lo quedamos.
      onPanResponderTerminationRequest: () => st.current.s <= 1.02,
      onPanResponderGrant: () => {
        g.current.pinch = null;
        g.current.moved = false;
        g.current.t0 = Date.now();
        g.current.px = st.current.x;
        g.current.py = st.current.y;
      },
      onPanResponderMove: (evt, gs) => {
        const t = evt.nativeEvent.touches;
        const cur = st.current;
        if (t && t.length >= 2) {
          g.current.moved = true;
          const d = dist(t[0], t[1]);
          if (!g.current.pinch) g.current.pinch = { d0: d, s0: cur.s };
          else apply((g.current.pinch.s0 * d) / g.current.pinch.d0, cur.x, cur.y);
          return;
        }
        if (g.current.pinch) {
          // Se levanto un dedo: se sigue arrastrando desde donde quedo.
          g.current.pinch = null;
          g.current.px = cur.x - gs.dx;
          g.current.py = cur.y - gs.dy;
        }
        if (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6) g.current.moved = true;
        if (cur.s > 1.02) apply(cur.s, g.current.px + gs.dx, g.current.py + gs.dy);
      },
      onPanResponderRelease: () => {
        const cur = st.current;
        const now = Date.now();
        if (!g.current.moved && now - g.current.t0 < 250) {
          if (now - g.current.lastTap < 320) {
            g.current.lastTap = 0;
            if (cur.s > 1.05) apply(1, 0, 0, true);
            else apply(DOUBLE_TAP_SCALE, 0, 0, true);
            return;
          }
          g.current.lastTap = now;
        }
        if (cur.s < 1.05) apply(1, 0, 0, true);
        g.current.pinch = null;
      },
    })
  ).current;

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} {...pan.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={{
          width: rotation % 180 === 0 ? width : height,
          height: rotation % 180 === 0 ? height : width,
          transform: [{ translateX: ax }, { translateY: ay }, { scale: sc }, { rotate: `${rotation}deg` }],
        }}
        resizeMode="contain"
        onLoadStart={() => {
          setLoading(true);
          setFailed(false);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
      />
      {loading && !failed ? <ActivityIndicator color="#fff" style={StyleSheet.flatten([styles.center])} /> : null}
      {failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={30} color="#fff" />
          <Text style={styles.failText}>No se pudo cargar esta foto.{'\n'}Sin internet solo se ven las que ya abriste antes.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  counter: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  counterText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  arrow: {
    position: 'absolute',
    top: '46%',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center', paddingHorizontal: 16, gap: 6 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  hint: { color: '#e5e7eb', fontSize: 12, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 30 },
  failText: { color: '#e5e7eb', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
});
