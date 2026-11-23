import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * expo-secure-store no tiene implementacion en web (su modulo web es un
 * stub vacio -- node_modules/expo-secure-store/.../ExpoSecureStore.web.ts
 * exporta {}), asi que cualquier metodo ahi truena. En nativo se sigue
 * usando SecureStore de verdad (cifrado) para el token; en web se cae a
 * AsyncStorage, igual que ya hace src/utils/environmentStorage.ts.
 */
export async function getToken(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function setToken(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteToken(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
