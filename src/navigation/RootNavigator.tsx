import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import type Ionicons from '../components/Ionicons';
import { useAuth } from '../context/AuthContext';
import { logEvent } from '../utils/activityLog';
import { screenName } from '../utils/screenNames';
import {
  navigationRef,
  setupNotificationTapHandler,
  flushPendingNotification,
} from '../utils/notificationNavigation';
import LoginScreen from '../screens/LoginScreen';
import ResumenOsScreen from '../screens/ResumenOsScreen';
import HomeScreen from '../screens/HomeScreen';
import OpenOrdersScreen from '../screens/OpenOrdersScreen';
import OrderMenuScreen from '../screens/OrderMenuScreen';
import AddPaxScreen from '../screens/AddPaxScreen';
import QuickCaptureScreen from '../screens/QuickCaptureScreen';
import AddTransportScreen from '../screens/AddTransportScreen';
import EditPaxListScreen from '../screens/EditPaxListScreen';
import EditPaxScreen from '../screens/EditPaxScreen';
import DelayScreen from '../screens/DelayScreen';
import CreateOrderScreen from '../screens/CreateOrderScreen';
import BitacoraScreen from '../screens/BitacoraScreen';
import ResumenScreen from '../screens/ResumenScreen';
import VuelosScreen from '../screens/VuelosScreen';
import DetallesListScreen from '../screens/DetallesListScreen';
import DetalleOrdenScreen from '../screens/DetalleOrdenScreen';
import ReportesListScreen from '../screens/ReportesListScreen';
import ReportePickerScreen from '../screens/ReportePickerScreen';
import EditarListScreen from '../screens/EditarListScreen';
import EditarOrdenScreen from '../screens/EditarOrdenScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import QrHistListScreen from '../screens/QrHistListScreen';
import QrHistDetailScreen from '../screens/QrHistDetailScreen';
import IncidenciasScListScreen from '../screens/IncidenciasScListScreen';
import SlaListScreen from '../screens/SlaListScreen';
import SlaFormScreen from '../screens/SlaFormScreen';
import PreregOrdersListScreen from '../screens/PreregOrdersListScreen';
import PreregOrderDetailScreen from '../screens/PreregOrderDetailScreen';
import PreregQrDisplayScreen from '../screens/PreregQrDisplayScreen';
import PreregScanScreen from '../screens/PreregScanScreen';
import PreregListasScreen from '../screens/PreregListasScreen';
import OtraOsScreen from '../screens/OtraOsScreen';
import ImportarListaScreen from '../screens/ImportarListaScreen';
import { colors } from '../theme/colors';
import type { ExistingPaxDTO, PreregLookupComp } from '../api/client';

export type OrderMenuParams = {
  folio: number;
  idAirport: number;
  folioDisplay: string;
  iata: string;
  typeAirline: string;
  airline?: string;
  flight?: string | null;
  esPrueba?: boolean;
};

export type AddTransportParams = OrderMenuParams & { direction: 'in' | 'out' };
export type EditPaxParams = OrderMenuParams & { pax: ExistingPaxDTO };
export type DelayParams = OrderMenuParams;

/** Datos de un pre-registro escaneado por QR, para pre-llenar AddPax (ver PreregScanScreen). */
export type PreregPrefill = {
  preregId: number;
  name: string;
  voucher: string;
  comps: PreregLookupComp[];
  idHotel: number | null;
  hotelName: string | null;
};
/** Datos del pasajero autorizado para moverse de otra O.S. (ver OtraOsScreen). */
export type OtraOsPrefill = {
  token: string;
  name: string;
  tipo: string;
  edad: string;
  voucher: string;
};
export type AddPaxRoom = { idOrdersOpen: number; idHotel: number; hotelName: string; ocupation: string; people: number };
export type AddPaxParams = OrderMenuParams & { prefill?: PreregPrefill; otraOsPrefill?: OtraOsPrefill; room?: AddPaxRoom };
export type OtraOsParams = OrderMenuParams;

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  CreateOrder: undefined;
  OpenOrders: undefined;
  OrderMenu: OrderMenuParams;
  AddPax: AddPaxParams;
  QuickCapture: undefined;
  AddTransport: AddTransportParams;
  EditPaxList: OrderMenuParams;
  EditPax: EditPaxParams;
  Delay: DelayParams;
  Bitacora: undefined;
  Resumen: undefined;
  Vuelos: undefined;
  DetallesList: undefined;
  DetalleOrden: { folio: number; idAirport: number; folioDisplay: string };
  ReportesList: undefined;
  ReportePicker: { folio: number; idAirport: number; folioDisplay: string };
  ResumenOs: { folio: number; idAirport: number; folioDisplay: string };
  EditarList: undefined;
  EditarOrden: { folio: number; idAirport: number; folioDisplay: string };
  Notifications: undefined;
  ComingSoon: { title: string; icon?: ComponentProps<typeof Ionicons>['name'] };
  QrHistList: undefined;
  QrHistDetail: { folio: number; idAirport: number; folioDisplay: string };
  IncidenciasSc: undefined;
  SlaList: undefined;
  SlaForm: { folio: number; idAirport: number; folioDisplay: string };
  PreregOrdersList: undefined;
  PreregOrderDetail: { folio: number; idAirport: number; folioDisplay: string };
  PreregQrDisplay: { folio: number; idAirport: number; folioDisplay: string; token: string };
  PreregScan: undefined;
  PreregListas: { folio: number; idAirport: number; folioDisplay: string };
  OtraOs: OtraOsParams;
  ImportarLista: OrderMenuParams;
};

const Stack = createNativeStackNavigator<RootStackParamList>();


let lastScreenKey = '';
function trackScreen() {
  try {
    const r = navigationRef.getCurrentRoute();
    if (!r) return;
    const prm: any = r.params ?? {};
    const folio = Number(prm.folio) || undefined;
    const key = r.name + '|' + (folio ?? '');
    if (key === lastScreenKey) return;
    lastScreenKey = key;
    const who = [prm.folioDisplay ? `O.S. ${String(prm.folioDisplay).replace(/^#/, '')}` : '', prm.iata ?? '', prm.airline ?? '', prm.flight ?? ''].filter(Boolean).join(' · ');
    logEvent('pantalla', { screen: r.name, folio, id_airport: Number(prm.idAirport) || undefined, text: `Entró a «${screenName(r.name)}»${who ? ' — ' + who : ''}` });
  } catch {
    // La bitacora nunca debe romper la navegacion.
  }
}

export default function RootNavigator() {
  const { token, isLoading } = useAuth();
  const theme = useTheme();
  // El fondo del navegador sigue el tema: al cambiar de pantalla no parpadea un fondo oscuro.
  const navTheme = React.useMemo(
    () => ({
      ...(theme.isDark ? DarkTheme : DefaultTheme),
      colors: { ...(theme.isDark ? DarkTheme.colors : DefaultTheme.colors), background: theme.bg[0] },
    }),
    [theme.isDark, theme.bg]
  );

  // Tocar una notificacion push abre la O.S. (ver utils/notificationNavigation).
  React.useEffect(() => setupNotificationTapHandler(), []);
  React.useEffect(() => {
    if (token) flushPendingNotification();
  }, [token]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg[0] }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={flushPendingNotification} onStateChange={trackScreen}>
      <Stack.Navigator screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        {token ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="CreateOrder" component={CreateOrderScreen} />
            <Stack.Screen name="OpenOrders" component={OpenOrdersScreen} />
            <Stack.Screen name="OrderMenu" component={OrderMenuScreen} />
            <Stack.Screen name="AddPax" component={AddPaxScreen} />
            <Stack.Screen name="QuickCapture" component={QuickCaptureScreen} />
            <Stack.Screen name="AddTransport" component={AddTransportScreen} />
            <Stack.Screen name="EditPaxList" component={EditPaxListScreen} />
            <Stack.Screen name="EditPax" component={EditPaxScreen} />
            <Stack.Screen name="Delay" component={DelayScreen} />
            <Stack.Screen name="Bitacora" component={BitacoraScreen} />
            <Stack.Screen name="Resumen" component={ResumenScreen} />
            <Stack.Screen name="Vuelos" component={VuelosScreen} />
            <Stack.Screen name="DetallesList" component={DetallesListScreen} />
            <Stack.Screen name="DetalleOrden" component={DetalleOrdenScreen} />
            <Stack.Screen name="ReportesList" component={ReportesListScreen} />
            <Stack.Screen name="ReportePicker" component={ReportePickerScreen} />
            <Stack.Screen name="ResumenOs" component={ResumenOsScreen} />
            <Stack.Screen name="EditarList" component={EditarListScreen} />
            <Stack.Screen name="EditarOrden" component={EditarOrdenScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="ComingSoon" component={ComingSoonScreen} />
            <Stack.Screen name="QrHistList" component={QrHistListScreen} />
            <Stack.Screen name="QrHistDetail" component={QrHistDetailScreen} />
            <Stack.Screen name="IncidenciasSc" component={IncidenciasScListScreen} />
            <Stack.Screen name="SlaList" component={SlaListScreen} />
            <Stack.Screen name="SlaForm" component={SlaFormScreen} />
            <Stack.Screen name="PreregOrdersList" component={PreregOrdersListScreen} />
            <Stack.Screen name="PreregOrderDetail" component={PreregOrderDetailScreen} />
            <Stack.Screen name="PreregQrDisplay" component={PreregQrDisplayScreen} />
            <Stack.Screen name="PreregScan" component={PreregScanScreen} />
            <Stack.Screen name="PreregListas" component={PreregListasScreen} />
            <Stack.Screen name="OtraOs" component={OtraOsScreen} />
            <Stack.Screen name="ImportarLista" component={ImportarListaScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
