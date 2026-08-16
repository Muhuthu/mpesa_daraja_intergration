const crypto = require('crypto');
require('dotenv').config();

class EncryptionService {
    constructor() {
        this.masterKey = Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex');
        
        if (!this.masterKey || this.masterKey.length !== 32) {
            throw new Error('ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)');
        }
        
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
    }

    encrypt(plainText) {
        if (!plainText) return null;
        
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
            
            let encrypted = cipher.update(plainText, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            
            const authTag = cipher.getAuthTag();
            const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
            
            return result;
        } catch (error) {
            console.error('Encryption error:', error.message);
            throw new Error('Failed to encrypt data');
        }
    }

decrypt(encryptedData) {
    if (!encryptedData) return null
    
    if (typeof encryptedData !== 'string') return encryptedData
    
    const parts = encryptedData.split(':')
    if (parts.length !== 3) {
        return encryptedData
    }
    
    try {
        const iv = Buffer.from(parts[0], 'base64')
        const authTag = Buffer.from(parts[1], 'base64')
        const encrypted = parts[2]
        
        const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv)
        decipher.setAuthTag(authTag)
        
        let decrypted = decipher.update(encrypted, 'base64', 'utf8')
        decrypted += decipher.final('utf8')
        
        return decrypted
    } catch (error) {
        console.error('Decryption error:', error.message)
        return encryptedData
    }
}

    generateWebhookSecret(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    static generateMasterKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    maskSensitive(data) {
        if (!data) return '***';
        if (data.length <= 4) return '****';
        return data.substring(0, 4) + '****' + data.substring(data.length - 4);
    }

    verifyWebhookSignature(payload, signature, secret) {
        if (!secret || !signature) return false;
        
        try {
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(JSON.stringify(payload))
                .digest('hex');
            
            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            );
        } catch (error) {
            console.error('Webhook verification error:', error.message);
            return false;
        }
    }
}

const encryptionService = new EncryptionService();

module.exports = encryptionService;
module.exports.EncryptionService = EncryptionService;