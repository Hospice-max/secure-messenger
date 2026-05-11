import CryptoJS from 'crypto-js';

export interface EncryptedData {
  data: string;
  iv: string;
}

export class EncryptionService {
  private static getEncryptionKey(userId: string, token?: string): string {
    // Utiliser le token JWT comme clé de chiffrement pour plus de sécurité
    if (token) {
      // Hacher le token pour créer une clé stable
      return CryptoJS.SHA256(token).toString();
    }
    // Fallback: utiliser une méthode plus sécurisée pour stocker/générer les clés
    // Pour cette démo, nous utilisons une clé dérivée de l'ID utilisateur
    return CryptoJS.SHA256(`${userId}-secure-key-2024`).toString();
  }

  static encrypt(text: string, userId: string, token?: string): EncryptedData {
    const key = this.getEncryptionKey(userId, token);
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

  static decrypt(encryptedData: EncryptedData, userId: string, token?: string): string {
    const key = this.getEncryptionKey(userId, token);
    const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);
    
    const decrypted = CryptoJS.AES.decrypt(encryptedData.data, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    
    // Handle malformed UTF-8 data
    if (!decryptedStr || decryptedStr.includes('')) {
      throw new Error('Malformed UTF-8 data');
    }
    
    return decryptedStr;
  }

  static encryptImage(imageData: string, userId: string, token?: string): EncryptedData {
    return this.encrypt(imageData, userId, token);
  }

  static decryptImage(encryptedData: EncryptedData, userId: string, token?: string): string {
    return this.decrypt(encryptedData, userId, token);
  }
}
