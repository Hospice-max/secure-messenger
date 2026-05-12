import CryptoJS from 'crypto-js';

export interface EncryptedData {
  data: string;
  iv: string;
}

export class EncryptionService {
  private static getSharedEncryptionKey(userA: string, userB: string): string {
    const sortedIds = [userA, userB].sort().join('|');
    const keyMaterial = `${sortedIds}|secure-messenger-shared-key`;
    return CryptoJS.SHA256(keyMaterial).toString();
  }

  static encrypt(text: string, senderId: string, receiverId: string): EncryptedData {
    const key = this.getSharedEncryptionKey(senderId, receiverId);
    const iv = CryptoJS.lib.WordArray.random(16);

    const encrypted = CryptoJS.AES.encrypt(text, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return {
      data: encrypted.toString(),
      iv: iv.toString()
    };
  }

  static decrypt(encryptedData: EncryptedData, userId: string, peerId: string): string {
    const key = this.getSharedEncryptionKey(userId, peerId);
    const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);

    const decrypted = CryptoJS.AES.decrypt(encryptedData.data, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    if (!decryptedStr) {
      throw new Error('Unable to decrypt message');
    }

    return decryptedStr;
  }

  static encryptImage(imageData: string, senderId: string, receiverId: string): EncryptedData {
    return this.encrypt(imageData, senderId, receiverId);
  }

  static decryptImage(encryptedData: EncryptedData, userId: string, peerId: string): string {
    return this.decrypt(encryptedData, userId, peerId);
  }
}
