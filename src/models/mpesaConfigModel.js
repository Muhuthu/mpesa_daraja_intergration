const { db, DatabaseManager } = require('../utils/db')
const encryptionService = require('../services/encryptionService')

class MpesaConfigModel {
    static COLUMNS = [
        'id', 'business_id', 'store_id', 'business_name', 'business_account_id',
        'consumer_key', 'consumer_secret', 'passkey', 'shortcode',
        'till_number', 'transaction_type',
        'initiator_name', 'security_credential', 'organization_name',
        'store_number', 'webhook_secret', 'environment',
        'is_active', 'is_default', 'created_at', 'updated_at',
        'is_dirty', 'last_synced', 'sync_version', 'sync_status',
        'last_modified_by', 'last_modified_source', 'sync_attempts',
        'sync_error', 'terminal_id', 'offline_id'
    ]

    static COLUMNS_STRING = this.COLUMNS.join(', ')

    static async create(data) {
        const id = data.id || DatabaseManager.generateId()
        
        const encryptedData = {
            id,
            business_id: data.business_id,
            store_id: data.store_id || null,
            business_name: data.business_name || null,
            business_account_id: data.business_account_id || null,
            consumer_key: encryptionService.encrypt(data.consumer_key),
            consumer_secret: encryptionService.encrypt(data.consumer_secret),
            passkey: encryptionService.encrypt(data.passkey),
            shortcode: data.shortcode,
            till_number: data.till_number || null,
            transaction_type: data.transaction_type || 'CustomerBuyGoodsOnline',
            initiator_name: data.initiator_name || null,
            security_credential: encryptionService.encrypt(data.security_credential),
            organization_name: data.organization_name || null,
            store_number: data.store_number || null,
            webhook_secret: data.webhook_secret || encryptionService.generateWebhookSecret(),
            environment: data.environment || 'production',
            is_active: data.is_active !== undefined ? data.is_active : 1,
            is_default: data.is_default || 0,
            created_at: new Date(),
            updated_at: new Date(),
            sync_status: 'synced',
            last_modified_source: data.last_modified_source || 'online'
        }

        await db.query(
            `INSERT INTO business_mpesa_configs SET ?`,
            [encryptedData]
        )

        return this.findById(id)
    }

    static async findById(id) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs WHERE id = ?`,
            [id],
            { realTime: true }
        )
        
        if (rows.length === 0) return null
        
        return rows;
    }

    static async findByBusinessId(businessId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs 
             WHERE business_id = ? AND is_active = 1 AND store_id IS NULL
             ORDER BY is_default DESC, created_at DESC`,
            [businessId],
            { realTime: true }
        )
        
        if (rows.length === 0) return null
        
        return rows;
    }

    static async findByBusinessAndStore(businessId, storeId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs 
             WHERE business_id = ? AND store_id = ? AND is_active = 1 
             ORDER BY is_default DESC, created_at DESC
             LIMIT 1`,
            [businessId, storeId],
            { realTime: true }
        )
        
        if (rows.length === 0) {
            return this.findByBusinessId(businessId)
        }
        
        return rows;
    }

    static async findAllByBusinessId(businessId) {
        const [rows] = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs 
             WHERE business_id = ? AND is_active = 1 
             ORDER BY store_id IS NULL DESC, is_default DESC, created_at DESC`,
            [businessId],
            { realTime: true }
        )
        
        return rows
    }

    static async findDefaultByBusinessId(businessId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs 
             WHERE business_id = ? AND is_active = 1 AND is_default = 1 
             LIMIT 1`,
            [businessId],
            { realTime: true }
        )
        
        if (rows.length === 0) {
            return this.findByBusinessId(businessId)
        }
        
        return rows
    }

    static async findDefaultByBusinessAndStore(businessId, storeId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_configs 
             WHERE business_id = ? AND store_id = ? AND is_active = 1 AND is_default = 1 
             LIMIT 1`,
            [businessId, storeId],
            { realTime: true }
        )
        
        if (rows.length === 0) {
            return this.findByBusinessAndStore(businessId, storeId)
        }
        
        return rows;
    }

    static async update(id, data) {
        const updateData = { ...data }
        
        if (updateData.consumer_secret) {
            updateData.consumer_secret = encryptionService.encrypt(updateData.consumer_secret)
        }
        if (updateData.passkey) {
            updateData.passkey = encryptionService.encrypt(updateData.passkey)
        }
        if (updateData.security_credential) {
            updateData.security_credential = encryptionService.encrypt(updateData.security_credential)
        }
        
        delete updateData.id
        delete updateData.business_id
        delete updateData.created_at
        
        updateData.updated_at = new Date()
        updateData.sync_status = 'pending'
        
        const setClauses = Object.keys(updateData).map(key => `${key} = ?`).join(', ')
        const values = Object.values(updateData)
        
        await db.query(
            `UPDATE business_mpesa_configs SET ${setClauses} WHERE id = ?`,
            [...values, id]
        )
        
        return this.findById(id)
    }

    static async setDefault(businessId, configId) {
        const connection = await db.getConnection()
        
        try {
            await connection.beginTransaction()
            
            const config = await this.findById(configId)
            if (!config) {
                throw new Error('Configuration not found')
            }
            
            if (config.store_id) {
                await connection.query(
                    `UPDATE business_mpesa_configs SET is_default = 0, updated_at = NOW() 
                     WHERE business_id = ? AND store_id = ?`,
                    [businessId, config.store_id]
                )
            } else {
                await connection.query(
                    `UPDATE business_mpesa_configs SET is_default = 0, updated_at = NOW() 
                     WHERE business_id = ? AND store_id IS NULL`,
                    [businessId]
                )
            }
            
            await connection.query(
                `UPDATE business_mpesa_configs SET is_default = 1, updated_at = NOW() 
                 WHERE id = ? AND business_id = ?`,
                [configId, businessId]
            )
            
            await connection.commit()
            
            return this.findById(configId)
        } catch (error) {
            await connection.rollback()
            throw error
        } finally {
            connection.release()
        }
    }

    static async deactivate(id) {
        await db.query(
            `UPDATE business_mpesa_configs SET is_active = 0, updated_at = NOW() WHERE id = ?`,
            [id]
        )
        
        return true
    }

    static async delete(id) {
        await db.query(
            `DELETE FROM business_mpesa_configs WHERE id = ?`,
            [id]
        )
        
        return true
    }

    static async getConfigForApiCall(businessId, storeId = null, configId = null) {
        let config
        
        if (configId) {
            config = await this.findById(configId)
        } else if (storeId) {
            config = await this.findDefaultByBusinessAndStore(businessId, storeId)
            if (!config) {
                config = await this.findDefaultByBusinessId(businessId)
            }
        } else {
            config = await this.findDefaultByBusinessId(businessId)
        }
        
        if (!config) return null

        const configData = config[0]

        console.log('config for api call ', config)
        
        return {
            ...configData,
            consumer_key: encryptionService.decrypt(configData.consumer_key),
            consumer_secret: encryptionService.decrypt(configData.consumer_secret),
            passkey: encryptionService.decrypt(configData.passkey)
        }
    }

    static getConfigForResponse(config) {
        if (!config) return null
        
        return {
            ...config,
            consumer_secret: encryptionService.maskSensitive(config.consumer_secret),
            passkey: encryptionService.maskSensitive(config.passkey),
            security_credential: encryptionService.maskSensitive(config.security_credential),
            webhook_secret: encryptionService.maskSensitive(config.webhook_secret)
        }
    }
}

module.exports = MpesaConfigModel