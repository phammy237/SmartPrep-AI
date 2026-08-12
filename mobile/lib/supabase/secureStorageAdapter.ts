import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * `expo-secure-store` caps individual values at ~2KB, but a Supabase session
 * (access token + refresh token + user object) regularly exceeds that. So: a
 * random AES-256 key is generated once and kept *only in SecureStore* (small,
 * backed by iOS Keychain / Android Keystore); the AES-encrypted session blob
 * itself lives in AsyncStorage (unlimited size, but useless without the key).
 * This is the storage adapter Supabase's own Expo guide documents for this
 * exact problem.
 */
/**
 * True in a real browser tab or in the React Native runtime (which shims a
 * `window` global on both iOS and Android) - false only during Expo Router's
 * static web export/prerendering, which runs this module under plain Node
 * with no `window`/`localStorage` and no real user session to persist.
 */
const hasStorageBackedRuntime = typeof window !== 'undefined';

class LargeSecureStore {
  private async getOrCreateEncryptionKey(keyName: string): Promise<Uint8Array> {
    const stored = await SecureStore.getItemAsync(keyName);
    if (stored) {
      return aesjs.utils.hex.toBytes(stored);
    }
    const key = await Crypto.getRandomBytesAsync(32);
    await SecureStore.setItemAsync(keyName, aesjs.utils.hex.fromBytes(key));
    return key;
  }

  async getItem(key: string): Promise<string | null> {
    if (!hasStorageBackedRuntime) return null;

    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const [ivHex, dataHex] = stored.split(':');
    if (!ivHex || !dataHex) return null;

    const encryptionKey = await this.getOrCreateEncryptionKey(`${key}-encryption-key`);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex)));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(dataHex));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!hasStorageBackedRuntime) return;

    const encryptionKey = await this.getOrCreateEncryptionKey(`${key}-encryption-key`);
    const ivBytes = await Crypto.getRandomBytesAsync(16);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(ivBytes));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    const payload = `${aesjs.utils.hex.fromBytes(ivBytes)}:${aesjs.utils.hex.fromBytes(encryptedBytes)}`;
    await AsyncStorage.setItem(key, payload);
  }

  async removeItem(key: string): Promise<void> {
    if (!hasStorageBackedRuntime) return;

    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}-encryption-key`);
  }
}

export const largeSecureStore = new LargeSecureStore();
