import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radii } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { hexA } from '../theme/themes';
import ThemePickerModal from '../components/ThemePickerModal';
import HomeCustomizeModal from '../components/HomeCustomizeModal';
import { useAuth } from '../context/AuthContext';
import { warmOfflineData } from '../utils/prefetch';
import { getManualUrl, getNotifications, getOpenOrders, getPreregOrders, getSiteBaseUrl } from '../api/client';
import { getLastSeenNotifications } from '../utils/notificationsSeen';
import { getCache, saveCache } from '../utils/offlineCache';
import { OutboxSummary, subscribeOutbox } from '../utils/outbox';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
type IconName = ComponentProps<typeof Ionicons>['name'];

type ModuleCard = {
  key: string;
  label: string;
  icon: IconName;
  gradient: readonly [string, string];
  onPress: () => void;
  badge?: number;
  /** Etiqueta chica (ej. BETA) en lugar de la flecha. */
  tag?: string;
  loading?: boolean;
};

/** Una tarjeta del menu. Memorizada: cambiar un contador o el punto de notificaciones ya no redibuja las demas. */
const ModuleTile = React.memo(function ModuleTile({ c, t }: { c: ModuleCard; t: ReturnType<typeof useTheme> }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        t.cardShadow,
        { backgroundColor: t.surface, borderColor: t.surfaceBorder },
        pressed && styles.cardPressed,
      ]}
      onPress={c.onPress}
      disabled={c.loading}
      android_ripple={{ color: t.mode === 'oscuro' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }}
    >
      {/* marca de agua grande, del color del modulo */}
      <Ionicons name={c.icon} size={104} color={c.gradient[0]} style={styles.watermark} />

      <View style={styles.cardTop}>
        <View style={[styles.iconShadow, { shadowColor: c.gradient[1] }]}>
          <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconBadge}>
            {c.loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name={c.icon} size={27} color={colors.white} />
            )}
            <LinearGradient colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
          </LinearGradient>
        </View>

        {c.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{c.badge}</Text>
          </View>
        ) : c.tag ? (
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{c.tag}</Text>
          </View>
        ) : (
          <View style={[styles.arrow, { backgroundColor: hexA(c.gradient[0], 0.14) }]}>
            <Ionicons name="arrow-forward" size={14} color={c.gradient[0]} />
          </View>
        )}
      </View>

      <Text style={[styles.cardLabel, { color: t.cardLabel }]} numberOfLines={2}>
        {c.label}
      </Text>
    </Pressable>
  );
});

/** Dibujo propio de cada modulo en la vista de iconos: simbolo principal + insignia chica que dice de que trata. */
const ICON_ART: Record<string, { main: IconName; sub: IconName }> = {
  crear: { main: 'document-text', sub: 'add' },
  abiertos: { main: 'folder-open', sub: 'checkmark' },
  captura: { main: 'mic', sub: 'flash' },
  detalles: { main: 'albums', sub: 'search' },
  reportes: { main: 'bar-chart', sub: 'trending-up' },
  editar: { main: 'document-text', sub: 'pencil' },
  resumen: { main: 'stats-chart', sub: 'location' },
  vuelos: { main: 'airplane', sub: 'pulse' },
  qrHist: { main: 'qr-code', sub: 'time' },
  sla: { main: 'timer', sub: 'checkmark' },
  prereg: { main: 'person-add', sub: 'qr-code' },
  manual: { main: 'book', sub: 'help' },
  incidenciasSc: { main: 'warning', sub: 'chatbubble-ellipses' },
  bitacora: { main: 'shield-checkmark', sub: 'list' },
};

/** Vista de iconos: icono redondeado con su nombre abajo, 4 por renglon. Tambien memorizada. */
const IconTile = React.memo(function IconTile({ c, t }: { c: ModuleCard; t: ReturnType<typeof useTheme> }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.iconTile, pressed && styles.iconTilePressed]}
      onPress={c.onPress}
      disabled={c.loading}
      accessibilityLabel={c.label}
    >
      <View style={[styles.appIconShadow, { shadowColor: c.gradient[1] }]}>
        <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.appIcon}>
          {c.loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Ionicons name={(ICON_ART[c.key]?.main ?? c.icon) as IconName} size={33} color={colors.white} />
          )}
          <LinearGradient colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} style={styles.appGloss} pointerEvents="none" />
        </LinearGradient>
        {ICON_ART[c.key] && !c.loading ? (
          <View style={styles.appSub}>
            <Ionicons name={ICON_ART[c.key].sub} size={13} color={c.gradient[0]} />
          </View>
        ) : null}
        {c.badge ? (
          <View style={styles.appBadge}>
            <Text style={styles.badgeText}>{c.badge}</Text>
          </View>
        ) : c.tag ? (
          <View style={styles.appTag}>
            <Text style={styles.tagText}>{c.tag}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.appLabel, { color: t.text }]} numberOfLines={2}>
        {c.label}
      </Text>
    </Pressable>
  );
});

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/**
 * Panel principal (equivalente al dashboard de op/index.php en la web): un
 * grid de accesos a cada modulo. Los que ya estan construidos navegan a la
 * pantalla real; los pendientes navegan a "Coming Soon" para que la
 * navegacion quede completa desde ya, sin fingir que algo esta terminado.
 */
const ADMIN_MAESTRO_EMAIL = 'fvazconcelos@traken.mx';

export default function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const t = useTheme();
  const [showTheme, setShowTheme] = useState(false);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [preregPend, setPreregPend] = useState(0);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const esAdminMaestro = user?.email?.toLowerCase() === ADMIN_MAESTRO_EMAIL;
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);

  const handleOpenManual = useCallback(async () => {
    setIsDownloadingManual(true);
    try {
      const res = await getManualUrl();
      if (!res.ok || !res.url) {
        Alert.alert('No se pudo abrir', res.error ?? 'Intenta de nuevo.');
        return;
      }
      const destination = new File(Paths.cache, 'Manual-Operaciones.pdf');
      if (destination.exists) destination.delete();
      const task = File.createDownloadTask(`${getSiteBaseUrl()}${res.url}`, destination);
      const downloaded = await task.downloadAsync();
      if (!downloaded || !downloaded.exists || downloaded.size === 0) {
        throw new Error('empty-download');
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: 'application/pdf', dialogTitle: 'Manual de Operaciones' });
      } else {
        Alert.alert('Descargado', 'El manual se descargó pero no hay con qué abrirlo en este dispositivo.');
      }
    } catch (e) {
      Alert.alert('Sin conexión', 'No se pudo descargar el manual. Intenta de nuevo.');
    } finally {
      setIsDownloadingManual(false);
    }
  }, []);

  // Los numeros del menu aparecen AL INSTANTE con lo ultimo guardado y se actualizan en cuanto contesta el servidor.
  const hdr = useRef<{ open: number | null; prereg: number }>({ open: null, prereg: 0 });
  const latestNotifTs = useRef(0);
  const lastLoad = useRef(0);
  const [outboxPending, setOutboxPending] = useState(0);

  useEffect(() => {
    getCache<{ open: number | null; prereg: number }>('home_header')
      .then((c) => {
        if (!c) return;
        hdr.current = c.data;
        setOpenCount((cur) => (cur === null ? c.data.open : cur));
        setPreregPend((cur) => cur || c.data.prereg);
      })
      .catch(() => {});
  }, []);

  useEffect(() => subscribeOutbox((o: OutboxSummary) => setOutboxPending(o.pending + o.failed)), []);

  const recomputeDot = useCallback(() => {
    getLastSeenNotifications()
      .then((seen) => setHasUnreadNotifs(latestNotifTs.current > seen))
      .catch(() => {});
  }, []);

  const loadHeader = useCallback(async () => {
    lastLoad.current = Date.now();
    // Las 3 cargas son independientes: van en paralelo.
    const openOrders = (async () => {
      try {
        const res = await getOpenOrders();
        if (res.ok) {
          hdr.current.open = res.total ?? 0;
          setOpenCount(hdr.current.open);
        }
      } catch (e) {
        // Silencioso: es solo el numero del badge, no bloquea el resto de Home.
      }
    })();
    const notifs = (async () => {
      try {
        const notifRes = await getNotifications(1);
        const latest = notifRes.ok ? notifRes.items?.[0]?.sent_at : null;
        latestNotifTs.current = latest ? Date.parse(latest.replace(' ', 'T')) : 0;
        recomputeDot();
      } catch (e) {
        // Silencioso: el puntito de notificaciones es un extra, no critico.
      }
    })();
    const prereg = (async () => {
      try {
        const res = await getPreregOrders();
        hdr.current.prereg = (res.orders ?? []).reduce((a, o) => a + (Number(o.pendientes) || 0), 0);
        setPreregPend(hdr.current.prereg);
      } catch (e) {
        // Silencioso: sin internet se queda el ultimo valor.
      }
    })();
    await Promise.all([openOrders, notifs, prereg]);
    saveCache('home_header', hdr.current).catch(() => {});
  }, [recomputeDot]);

  // Al volver a esta pantalla: el puntito de notificaciones se recalcula SIN red (instantaneo) y los numeros
  // solo se piden de nuevo si pasaron mas de 20 s (antes se pedian en cada regreso).
  useFocusEffect(
    useCallback(() => {
      recomputeDot();
      if (Date.now() - lastLoad.current > 20_000) loadHeader();
      // La precarga para uso sin internet espera a que el menu ya este listo y quieto.
      const timer = setTimeout(() => warmOfflineData().catch(() => {}), 3500);
      return () => clearTimeout(timer);
    }, [loadHeader, recomputeDot])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadHeader();
    setIsRefreshing(false);
  };

  const goComingSoon = (title: string, icon: IconName) => () =>
    navigation.navigate('ComingSoon', { title, icon });

  const cards: ModuleCard[] = useMemo(() => [
    {
      key: 'crear',
      label: 'Crear O.S',
      icon: 'document-text',
      gradient: ['#2563eb', '#1d4ed8'],
      onPress: () => navigation.navigate('CreateOrder'),
    },
    {
      key: 'abiertos',
      label: 'O.S Abiertos',
      icon: 'checkmark-circle',
      gradient: ['#16a34a', '#0f7a37'],
      onPress: () => navigation.navigate('OpenOrders'),
      badge: openCount ?? undefined,
    },
    {
      key: 'captura',
      label: 'Captura rápida de Pax',
      icon: 'flash',
      gradient: ['#7c3aed', '#5b21b6'],
      tag: 'BETA',
      onPress: () => navigation.navigate('QuickCapture'),
    },
    {
      key: 'detalles',
      label: 'Detalles O.S',
      icon: 'albums',
      gradient: ['#0891b2', '#0e7490'],
      onPress: () => navigation.navigate('DetallesList'),
    },
    {
      key: 'reportes',
      label: 'Reportes',
      icon: 'bar-chart',
      gradient: ['#7c3aed', '#6d28d9'],
      onPress: () => navigation.navigate('ReportesList'),
    },
    {
      key: 'editar',
      label: 'Editar O.S',
      icon: 'create',
      gradient: ['#d97706', '#b45309'],
      onPress: () => navigation.navigate('EditarList'),
    },
    {
      key: 'resumen',
      label: 'Resumen por Estación',
      icon: 'stats-chart',
      gradient: ['#0891b2', '#155e75'],
      onPress: () => navigation.navigate('Resumen'),
    },
    {
      key: 'vuelos',
      label: 'Vuelos en Tiempo Real',
      icon: 'paper-plane',
      gradient: ['#0891b2', '#0e7490'],
      onPress: () => navigation.navigate('Vuelos'),
    },
    {
      key: 'qrHist',
      label: 'Historial de QR',
      icon: 'qr-code',
      gradient: ['#4338ca', '#3730a3'],
      onPress: () => navigation.navigate('QrHistList'),
    },
    {
      key: 'sla',
      label: 'SLA de Operaciones',
      icon: 'timer',
      gradient: ['#0f766e', '#115e59'],
      onPress: () => navigation.navigate('SlaList'),
    },
    {
      key: 'prereg',
      label: 'Pre-registro de Pax',
      icon: 'person-add',
      gradient: ['#be185d', '#9d174d'],
      badge: preregPend || undefined,
      onPress: () => navigation.navigate('PreregOrdersList'),
    },
    {
      key: 'manual',
      label: 'Manual de Operaciones',
      icon: 'book',
      gradient: ['#475569', '#334155'],
      onPress: handleOpenManual,
      loading: isDownloadingManual,
    },
    ...(user?.acceso_sc_incidencias
      ? [
          {
            key: 'incidenciasSc',
            label: 'Incidencias SC',
            icon: 'warning' as IconName,
            gradient: ['#b45309', '#92400e'] as readonly [string, string],
            onPress: () => navigation.navigate('IncidenciasSc'),
          },
        ]
      : []),
    ...(esAdminMaestro
      ? [
          {
            key: 'bitacora',
            label: 'Bitácora',
            icon: 'shield-checkmark' as IconName,
            gradient: ['#334155', '#1e293b'] as readonly [string, string],
            onPress: () => navigation.navigate('Bitacora'),
          },
        ]
      : []),
  ], [navigation, openCount, preregPend, isDownloadingManual, handleOpenManual, user?.acceso_sc_incidencias, esAdminMaestro]);

  // ---- Menu personalizable: orden y modulos ocultos, guardados por usuario en el telefono ----
  type Layout = { order: string[]; hidden: string[]; view?: 'cards' | 'icons' };
  const [layout, setLayout] = useState<Layout>({ order: [], hidden: [], view: 'cards' });
  const [showCustomize, setShowCustomize] = useState(false);
  const layoutKey = user?.id ? `home_layout_${user.id}` : null;

  useEffect(() => {
    if (!layoutKey) return;
    getCache<Layout>(layoutKey)
      .then((c) => {
        if (c && Array.isArray(c.data?.order) && Array.isArray(c.data?.hidden)) setLayout(c.data);
      })
      .catch(() => {});
  }, [layoutKey]);

  const saveLayout = useCallback(
    (next: Layout) => {
      setLayout(next);
      if (layoutKey) saveCache(layoutKey, next).catch(() => {});
    },
    [layoutKey]
  );

  // Orden elegido primero; lo que no esta en la lista (modulos nuevos) va al final en su orden normal.
  const orderedCards = useMemo(() => {
    const byKey = new Map(cards.map((c) => [c.key, c]));
    const first = layout.order.map((k) => byKey.get(k)).filter((c): c is ModuleCard => !!c);
    const rest = cards.filter((c) => layout.order.indexOf(c.key) < 0);
    return [...first, ...rest];
  }, [cards, layout.order]);
  const visibleCards = useMemo(
    () => orderedCards.filter((c) => layout.hidden.indexOf(c.key) < 0),
    [orderedCards, layout.hidden]
  );

  const moveCard = (key: string, dir: -1 | 1) => {
    const keys = orderedCards.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    saveLayout({ order: keys, hidden: layout.hidden, view: layout.view });
  };
  const toggleCard = (key: string) => {
    const isHidden = layout.hidden.indexOf(key) >= 0;
    if (!isHidden && visibleCards.length <= 1) {
      Alert.alert('Deja al menos uno', 'El menú necesita mostrar por lo menos un módulo.');
      return;
    }
    saveLayout({ order: orderedCards.map((c) => c.key), hidden: isHidden ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key], view: layout.view });
  };

  // Barra de marca: logo de Traken a la izquierda y los botones a la derecha. Queda fija arriba.
  // En el estilo claro va directo sobre el fondo; en los oscuros, el logo va sobre una insignia blanca para que se lea.
  const lightBar = t.headerAsCard;
  const btnStyle = {
    backgroundColor: lightBar ? t.cardStrong : t.headerBtnBg,
    borderColor: lightBar ? t.cardBorder : t.headerBtnBorder,
  };
  const btnIcon = lightBar ? t.text : t.headerBtnIcon;
  const ripple = { color: lightBar ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.2)', radius: 22, borderless: true };

  const brandBar = (
    <View style={styles.brandBar}>
      <View style={[styles.logoWrap, !lightBar && styles.logoPill]}>
        <Image source={require('../../assets/logo-traken.png')} style={styles.brandLogo} resizeMode="contain" />
      </View>
      <View style={styles.topActions}>
        <Pressable
          style={[styles.iconBtn, btnStyle]}
          onPress={() => navigation.navigate('Notifications')}
          hitSlop={8}
          android_ripple={ripple}
        >
          <Ionicons name="notifications-outline" size={20} color={btnIcon} />
          {hasUnreadNotifs && <View style={[styles.unreadDot, { borderColor: lightBar ? t.cardStrong : colors.navy }]} />}
        </Pressable>
        <Pressable style={[styles.iconBtn, btnStyle]} onPress={() => setShowTheme(true)} hitSlop={8} android_ripple={ripple}>
          <Ionicons name="color-palette-outline" size={20} color={btnIcon} />
        </Pressable>
        <Pressable style={[styles.iconBtn, btnStyle]} onPress={logout} hitSlop={8} android_ripple={ripple}>
          <Ionicons name="log-out-outline" size={20} color={btnIcon} />
        </Pressable>
      </View>
    </View>
  );

  // Saludo (dentro de la tarjeta de color en el estilo claro, o suelto en los oscuros).
  const greeting = (
    <View>
      <Text style={[styles.hi, { color: t.headerText }]} numberOfLines={1}>
        {saludo()}, {user?.firstname}
      </Text>
      <Text style={[styles.role, { color: t.headerMuted }]} numberOfLines={1}>
        {user?.role_name}
      </Text>
      {openCount !== null || outboxPending > 0 ? (
        <Text style={[styles.today, { color: t.headerMuted }]} numberOfLines={1}>
          {openCount !== null ? `${openCount} O.S. abiertas` : ''}
          {preregPend > 0 ? ` · ${preregPend} pre-registros por atender` : ''}
          {outboxPending > 0 ? ` · 📴 ${outboxPending} por enviar` : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <LinearGradient colors={t.bg} style={styles.flex}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        {/* Encabezado fijo: no se va al desplazar el menu */}
        <View style={styles.fixedHeader}>
            {brandBar}
            {t.headerAsCard ? (
              <LinearGradient
                colors={[t.accent, t.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.headerCard, { shadowColor: t.accentDark }]}
              >
                {greeting}
              </LinearGradient>
            ) : (
              <View style={styles.headerPlain}>{greeting}</View>
            )}
        </View>

        <ScrollView
          style={styles.menuScroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={t.refreshTint} />}
        >
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow, { color: t.sectionTitle }]}>ACCESOS</Text>
            <Pressable style={styles.customizeBtn} onPress={() => setShowCustomize(true)} hitSlop={8}>
              <Ionicons name="options-outline" size={14} color={t.sectionTitle} />
              <Text style={[styles.customizeText, { color: t.sectionTitle }]}>
                Personalizar{layout.hidden.length ? ` (${layout.hidden.length} oculto${layout.hidden.length === 1 ? '' : 's'})` : ''}
              </Text>
            </Pressable>
          </View>

          {layout.view === 'icons' ? (
            <View style={styles.iconGrid}>
              {visibleCards.map((c) => (
                <IconTile key={c.key} c={c} t={t} />
              ))}
            </View>
          ) : (
            <View style={styles.grid}>
              {visibleCards.map((c) => (
                <ModuleTile key={c.key} c={c} t={t} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <ThemePickerModal visible={showTheme} onClose={() => setShowTheme(false)} />
      <HomeCustomizeModal
        visible={showCustomize}
        items={orderedCards.map((c) => ({ key: c.key, label: c.label, icon: c.icon, gradient: c.gradient }))}
        hidden={layout.hidden}
        onMove={moveCard}
        onToggle={toggleCard}
        view={layout.view ?? 'cards'}
        onViewChange={(v) => saveLayout({ order: orderedCards.map((c) => c.key), hidden: layout.hidden, view: v })}
        onReset={() => saveLayout({ order: [], hidden: [], view: 'cards' })}
        onClose={() => setShowCustomize(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fixedHeader: { paddingHorizontal: 18, paddingTop: 12 },
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  logoWrap: { justifyContent: 'center' },
  logoPill: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  brandLogo: { width: 92, height: 44 },
  // El menu ocupa justo el espacio bajo el encabezado y se desplaza solo (minHeight 0 para que tambien encoja en web).
  menuScroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 40 },
  headerCard: {
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  headerPlain: { marginBottom: 14, paddingHorizontal: 2 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  hi: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  role: { fontSize: 12.5, marginTop: 2 },
  today: { fontSize: 12, marginTop: 6, fontWeight: '700' },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10, marginLeft: 4 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, paddingTop: 6 },
  iconTile: { width: '25%', alignItems: 'center', paddingHorizontal: 2 },
  iconTilePressed: { transform: [{ scale: 0.92 }], opacity: 0.85 },
  appIconShadow: { shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  appSub: { position: 'absolute', left: -5, bottom: -5, width: 25, height: 25, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  appIcon: { width: 66, height: 66, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  appGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  appBadge: { position: 'absolute', top: -6, right: -8, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#ffffff' },
  appTag: { position: 'absolute', top: -5, right: -9, backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5, borderWidth: 1.5, borderColor: '#ffffff' },
  appLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8, lineHeight: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitleInRow: { marginBottom: 0 },
  customizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6 },
  customizeText: { fontSize: 11.5, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47.5%',
    flexGrow: 1,
    minHeight: 122,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  watermark: { position: 'absolute', right: -22, bottom: -26, opacity: 0.07 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconShadow: {
    borderRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 10,
    elevation: 7,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  arrow: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 14, fontWeight: '800', lineHeight: 18, marginTop: 14, letterSpacing: -0.1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tagPill: { backgroundColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { color: '#ffffff', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
  badgeText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
});
