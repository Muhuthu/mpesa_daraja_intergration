const { db, DatabaseManager } = require('../utils/db')

class MpesaCallbackModel {
    static COLUMNS = [
        'id', 'business_id', 'store_id', 'mpesa_config_id',
        'callback_type', 'callback_url', 'is_active', 'is_default',
        'created_at', 'updated_at', 'is_dirty', 'last_synced',
        'sync_version', 'sync_status', 'last_modified_by',
        'last_modified_source'
    ]

    static COLUMNS_STRING = this.COLUMNS.join(', ')

    static CALLBACK_TYPES = {
        STK_PUSH: 'stk_push',
        B2C_RESULT: 'b2c_result',
        B2C_TIMEOUT: 'b2c_timeout',
        C2B_VALIDATION: 'c2b_validation',
        C2B_CONFIRMATION: 'c2b_confirmation',
        TRANSACTION_STATUS_RESULT: 'transaction_status_result',
        TRANSACTION_STATUS_TIMEOUT: 'transaction_status_timeout',
        REVERSAL_RESULT: 'reversal_result',
        REVERSAL_TIMEOUT: 'reversal_timeout',
        ACCOUNT_BALANCE_RESULT: 'account_balance_result',
        ACCOUNT_BALANCE_TIMEOUT: 'account_balance_timeout',
        CUSTOM: 'custom'
    }

    static async create(data) {
        const id = data.id || DatabaseManager.generateId()
        
        const callbackData = {
            id,
            business_id: data.business_id,
            store_id: data.store_id || null,
            mpesa_config_id: data.mpesa_config_id || null,
            callback_type: data.callback_type || 'stk_push',
            callback_url: data.callback_url,
            is_active: data.is_active !== undefined ? data.is_active : 1,
            is_default: data.is_default || 0,
            created_at: new Date(),
            updated_at: new Date(),
            sync_status: 'synced',
            last_modified_source: data.last_modified_source || 'online'
        }

        await db.query(
            `INSERT INTO business_mpesa_callbacks SET ?`,
            [callbackData]
        )

        return this.findById(id)
    }

    static async findById(id) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks WHERE id = ?`,
            [id],
            { realTime: true }
        )
        
        if (rows.length === 0) return null
        
        return rows;
    }

    static async findByBusinessAndStore(businessId, storeId, callbackType = null) {
        let query = `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks 
             WHERE business_id = ? AND store_id = ? AND is_active = 1`
        const params = [businessId, storeId]
        
        if (callbackType) {
            query += ` AND callback_type = ?`
            params.push(callbackType)
        }
        
        query += ` ORDER BY is_default DESC, created_at DESC LIMIT 1`
        
        const rows = await db.query(query, params, { realTime: true })
        
        if (rows.length === 0) {
            return this.findByBusiness(businessId, callbackType)
        }
        
        return rows;
    }

    static async findByBusiness(businessId, callbackType = null) {
        let query = `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks 
             WHERE business_id = ? AND store_id IS NULL AND is_active = 1`
        const params = [businessId]
        
        if (callbackType) {
            query += ` AND callback_type = ?`
            params.push(callbackType)
        }
        
        query += ` ORDER BY is_default DESC, created_at DESC LIMIT 1`
        
        const rows = await db.query(query, params, { realTime: true })
        
        if (rows.length === 0) return null
        
        return rows;
    }

    static async findDefaultByBusinessAndStore(businessId, storeId, callbackType = null) {
        let query = `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks 
             WHERE business_id = ? AND store_id = ? AND is_active = 1 AND is_default = 1`
        const params = [businessId, storeId]
        
        if (callbackType) {
            query += ` AND callback_type = ?`
            params.push(callbackType)
        }
        
        query += ` LIMIT 1`
        
        const rows = await db.query(query, params, { realTime: true })
        
        if (rows.length === 0) {
            return this.findByBusinessAndStore(businessId, storeId, callbackType)
        }
        
        return rows;
    }

    static async getCallbackUrl(businessId, storeId, callbackType) {
        const callback = await this.findDefaultByBusinessAndStore(businessId, storeId, callbackType)
        
        if (callback) return callback.callback_url
        
        const baseUrl = process.env.MPESA_CALLBACK_URL || 'https://your-domain.com'
        return `${baseUrl}/api/client/mpesa/callback/${businessId}/${storeId}`
    }

    static async getCallbackUrlWithoutStore(businessId, callbackType) {

        const callback = await this.findDefaultByBusinessAndStore(
            businessId,
            null,
            callbackType
        );

        if (callback) {
            return callback.callback_url;
        }

        const baseUrl =
            process.env.MPESA_CALLBACK_URL ||
            'https://your-domain.com';

        let endpoint;

        switch (callbackType) {

            case this.CALLBACK_TYPES.C2B_VALIDATION:
                endpoint = 'c2b-validation';
                break;

            case this.CALLBACK_TYPES.C2B_CONFIRMATION:
                endpoint = 'c2b-confirmation';
                break;

            default:
                endpoint = 'callback';
                break;
        }

        return `${baseUrl}/api/client/callbacks/${endpoint}/${businessId}`;
    }

    static async findAllByBusinessId(businessId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks 
             WHERE business_id = ? AND is_active = 1 
             ORDER BY store_id IS NULL DESC, callback_type ASC, is_default DESC`,
            [businessId],
            { realTime: true }
        )
        
        return rows
    }

    static async findAllByStoreId(storeId) {
        const rows = await db.query(
            `SELECT ${this.COLUMNS_STRING} FROM business_mpesa_callbacks 
             WHERE store_id = ? AND is_active = 1 
             ORDER BY callback_type ASC, is_default DESC`,
            [storeId],
            { realTime: true }
        )
        
        return rows
    }

    static async update(id, data) {
        const updateData = { ...data }
        
        delete updateData.id
        delete updateData.business_id
        delete updateData.created_at
        
        updateData.updated_at = new Date()
        updateData.sync_status = 'pending'
        
        const setClauses = Object.keys(updateData).map(key => `${key} = ?`).join(', ')
        const values = Object.values(updateData)
        
        await db.query(
            `UPDATE business_mpesa_callbacks SET ${setClauses} WHERE id = ?`,
            [...values, id]
        )
        
        return this.findById(id)
    }

    static async setDefault(businessId, callbackId) {
        const connection = await db.getConnection()
        
        try {
            await connection.beginTransaction()
            
            const callback = await this.findById(callbackId)
            if (!callback) {
                throw new Error('Callback configuration not found')
            }
            
            if (callback.store_id) {
                await connection.query(
                    `UPDATE business_mpesa_callbacks SET is_default = 0, updated_at = NOW() 
                     WHERE business_id = ? AND store_id = ? AND callback_type = ?`,
                    [businessId, callback.store_id, callback.callback_type]
                )
            } else {
                await connection.query(
                    `UPDATE business_mpesa_callbacks SET is_default = 0, updated_at = NOW() 
                     WHERE business_id = ? AND store_id IS NULL AND callback_type = ?`,
                    [businessId, callback.callback_type]
                )
            }
            
            await connection.query(
                `UPDATE business_mpesa_callbacks SET is_default = 1, updated_at = NOW() 
                 WHERE id = ? AND business_id = ?`,
                [callbackId, businessId]
            )
            
            await connection.commit()
            
            return this.findById(callbackId)
        } catch (error) {
            await connection.rollback()
            throw error
        } finally {
            connection.release()
        }
    }

    static async deactivate(id) {
        await db.query(
            `UPDATE business_mpesa_callbacks SET is_active = 0, updated_at = NOW() WHERE id = ?`,
            [id]
        )
        
        return true
    }

    static async delete(id) {
        await db.query(
            `DELETE FROM business_mpesa_callbacks WHERE id = ?`,
            [id]
        )
        
        return true
    }

    static async generateCallbackUrl(businessId, storeId, callbackType) {
        const customCallback = await this.findDefaultByBusinessAndStore(businessId, storeId, callbackType)
        
        if (customCallback) {
            return customCallback.callback_url
        }
        
        const baseUrl = process.env.MPESA_CALLBACK_URL || 'https://your-domain.com'
        const typePath = callbackType.replace(/_/g, '-')
        
        return `${baseUrl}/api/mpesa/${typePath}/${businessId}/${storeId}`
    }
}

module.exports = MpesaCallbackModel