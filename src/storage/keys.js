// API 키는 안드로이드 보안 저장소(Keystore 암호화)에 둔다. 웹 미리보기에서만 일반 저장소 사용.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;
if (Platform.OS !== 'web') SecureStore = require('expo-secure-store');

const name = (p) => `myscheduler_key_${p}`;
export async function getKeys() {
  const read = (p) => (SecureStore ? SecureStore.getItemAsync(name(p)) : AsyncStorage.getItem(name(p)));
  const [gemini, claude] = await Promise.all([read('gemini'), read('claude')]);
  return { gemini: gemini || '', claude: claude || '' };
}
export async function setKey(provider, key) {
  const k = String(key || '').trim();
  if (SecureStore) return k ? SecureStore.setItemAsync(name(provider), k) : SecureStore.deleteItemAsync(name(provider));
  return k ? AsyncStorage.setItem(name(provider), k) : AsyncStorage.removeItem(name(provider));
}
