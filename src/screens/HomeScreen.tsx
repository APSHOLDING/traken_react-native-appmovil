import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
import { useAuth } from '../context/AuthContext';
import { getManualUrl, getNotifications, getOpenOrders, getSiteBaseUrl } from '../api/client';
import { getLastSeenNotifications } from '../utils/notificationsSeen';
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
  loading?: boolean;
};

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
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const esAdminMaestro = user?.email?.toLowerCase() === ADMIN_MAESTRO_EMAIL;
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);

  const handleOpenManual = async () => {
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
  };

  const loadHeader = useCallback(async () => {
    // Las 2 cargas del header son independientes entre si (el contador de
    // abiertas y el puntito de notificaciones) -- se disparan en paralelo en
    // vez de una tras otra para que el header quede listo mas rapido.
    const openOrders = (async () => {
      try {
        const res = await getOpenOrders();
        if (res.ok) setOpenCount(res.total ?? 0);
      } catch (e) {
        // Silencioso: es solo el numero del badge, no bloquea el resto de Home.
      }
    })();
    const notifs = (async () => {
      try {
        const [notifRes, lastSeen] = await Promise.all([getNotifications(1), getLastSeenNotifications()]);
        const latest = notifRes.ok ? notifRes.items?.[0]?.sent_at : null;
        const latestTs = latest ? Date.parse(latest.replace(' ', 'T')) : 0;
        setHasUnreadNotifs(latestTs > lastSeen);
      } catch (e) {
        // Silencioso: el puntito de notificaciones es un extra, no critico.
      }
    })();
    await Promise.all([openOrders, notifs]);
  }, []);

  // Se re-checa al volver a esta pantalla (ej. despues de abrir
  // Notificaciones) para que el puntito rojo desaparezca sin tener que
  // cerrar y reabrir la app.
  useFocusEffect(
    useCallback(() => {
      loadHeader();
    }, [loadHeader])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadHeader();
    setIsRefreshing(false);
  };

  const goComingSoon = (title: string, icon: IconName) => () =>
    navigation.navigate('ComingSoon', { title, icon });

  const cards: ModuleCard[] = [
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
  ];

  const header = (
    <>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hi, { color: t.headerText }]} numberOfLines={1}>
            Hola, {user?.firstname}
          </Text>
          <Text style={[styles.role, { color: t.headerMuted }]} numberOfLines={1}>
            {user?.role_name}
          </Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: t.headerBtnBg, borderColor: t.headerBtnBorder }]}
            onPress={() => navigation.navigate('Notifications')}
            hitSlop={8}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 22, borderless: true }}
          >
            <Ionicons name="notifications-outline" size={20} color={t.headerBtnIcon} />
            {hasUnreadNotifs && <View style={[styles.unreadDot, { borderColor: t.headerAsCard ? t.accentDark : colors.navy }]} />}
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: t.headerBtnBg, borderColor: t.headerBtnBorder }]}
            onPress={() => setShowTheme(true)}
            hitSlop={8}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 22, borderless: true }}
          >
            <Ionicons name="color-palette-outline" size={20} color={t.headerBtnIcon} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: t.headerBtnBg, borderColor: t.headerBtnBorder }]}
            onPress={logout}
            hitSlop={8}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 22, borderless: true }}
          >
            <Ionicons name="log-out-outline" size={20} color={t.headerBtnIcon} />
          </Pressable>
        </View>
      </View>

    </>
  );

  return (
    <LinearGradient colors={t.bg} style={styles.flex}>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.flex}>
        {/* Encabezado fijo: no se va al desplazar el menu */}
        <View style={styles.fixedHeader}>
            {t.headerAsCard ? (
              <LinearGradient
                colors={[t.accent, t.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.headerCard, { shadowColor: t.accentDark }]}
              >
                {header}
              </LinearGradient>
            ) : (
              <View style={styles.headerPlain}>{header}</View>
            )}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={t.refreshTint} />}
        >
          <Text style={[styles.sectionTitle, { color: t.sectionTitle }]}>ACCESOS</Text>

          <View style={styles.grid}>
            {cards.map((c) => (
              <Pressable
                key={c.key}
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
                      <LinearGradient
                        colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
                        style={styles.gloss}
                        pointerEvents="none"
                      />
                    </LinearGradient>
                  </View>

                  {c.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{c.badge}</Text>
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
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <ThemePickerModal visible={showTheme} onClose={() => setShowTheme(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fixedHeader: { paddingHorizontal: 18, paddingTop: 18 },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 40 },
  headerCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
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
  badgeText: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
});
