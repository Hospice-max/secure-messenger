import CryptoJS from 'crypto-js';

export interface EncryptedData {
  data: string;
  iv: string;
}

export class EncryptionService {
  private static getEncryptionKey(userId: string): string {
    // En production, utiliser une méthode plus sécurisée pour stocker/générer les clés
    // Pour cette démo, nous utilisons une clé dérivée de l'ID utilisateur
    return `${userId}-secure-key-2024`;
  }

  static encrypt(text: string, userId: string): EncryptedData {
    const key = this.getEncryptionKey(userId);
    const iv = CryptoJS.lib.WordArray.random(16);
    
    const encrypted = CryptoJS.AES.encrypt(text, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return {
      data: encrypted.toString(),
      iv: iv.toString()
    };
  }

  static decrypt(encryptedData: EncryptedData, userId: string): string {
    const key = this.getEncryptionKey(userId);
    const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);
    
    const decrypted = CryptoJS.AES.decrypt(encryptedData.data, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  static encryptImage(imageData: string, userId: string): EncryptedData {
    return this.encrypt(imageData, userId);
  }

  static decryptImage(encryptedData: EncryptedData, userId: string): string {
    return this.decrypt(encryptedData, userId);
  }
}
