const mpesaService = require("../services/mpesaService");
const MpesaConfigModel = require("../models/mpesaConfigModel");
const encryptionService = require("../services/encryptionService");
const { db, DatabaseManager } = require("../utils/db"); 
const OrderModel = require('../models/orderModel');
const SocketService = require('../services/socketService');

class MpesaController {
    /**
     * STK Push - Initiate payment
     */
    static async stkPush(req, res) {
        try {
            const {
                phone,
                amount,
                accountReference,
                transactionDesc,
                storeId
            } = req.body

            const requestingUser = req.user
            const businessId = requestingUser.businessId || requestingUser.business_id

            if (!businessId) {
                return res.status(403).json({
                    success: false,
                    message: 'User does not belong to any business'
                })
            }

            const config = await MpesaConfigModel.findByBusinessId(businessId)
            const configData = Array.isArray(config) ? config[0] : config

            if (!configData || !configData.id) {
                return res.status(400).json({
                    success: false,
                    message: 'No M-Pesa configuration found for this business. Please set up M-Pesa configuration first.'
                })
            }

            const configId = configData.id

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number is required"
                })
            }

            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Valid amount is required"
                })
            }

            let formattedPhone = phone.replace(/\s+/g, '')
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '254' + formattedPhone.substring(1)
            }
            if (formattedPhone.startsWith('+')) {
                formattedPhone = formattedPhone.substring(1)
            }
            if (!formattedPhone.startsWith('254')) {
                formattedPhone = '254' + formattedPhone
            }

            if (formattedPhone.length !== 12) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number format. Use format: 254XXXXXXXXX"
                })
            }

            const response = await mpesaService.stkPush(
                businessId,
                storeId,
                formattedPhone,
                amount,
                accountReference || `Order-${formattedPhone || Date.now()}`,
                configId
            )

            // Emit socket event for STK Push initiated
            if (response.data?.ResponseCode === '0') {
                SocketService.emitMpesaStkPushInitiated(businessId, storeId, {
                    checkoutRequestId: response.data?.CheckoutRequestID,
                    merchantRequestId: response.data?.MerchantRequestID,
                    amount,
                    phone: formattedPhone,
                    reference: accountReference
                })
            }

            await MpesaController._logMpesaRequest({
                business_id: businessId,
                store_id: storeId || null,
                config_id: response.config_id,
                transaction_type: 'STK_PUSH',
                phone: formattedPhone,
                amount,
                reference: accountReference,
                idempotency_key: req.body.idempotencyKey || null,
                order_id: null,
                invoice_id: null,
                merchant_request_id: response.data?.MerchantRequestID,
                checkout_request_id: response.data?.CheckoutRequestID,
                response_code: response.data?.ResponseCode,
                response_description: response.data?.ResponseDescription,
                status: response.data?.ResponseCode === '0' ? 'PENDING' : 'FAILED',
                created_by: requestingUser.id
            })

            return res.json({
                success: true,
                data: response.data,
                message: response.data?.CustomerMessage || 'STK Push initiated'
            })

        } catch (error) {
            console.error("STK Push Error:", error.message)

            await MpesaController._logMpesaRequest({
                business_id: req.user?.businessId || req.user?.business_id,
                store_id: req.body?.storeId || null,
                transaction_type: 'STK_PUSH',
                phone: req.body?.phone,
                amount: req.body?.amount,
                reference: req.body?.accountReference,
                order_id: null,
                status: 'FAILED',
                error_message: error.message,
                created_by: req.user?.id
            }).catch(logError => console.error('Failed to log error:', logError))

            if (error.message.includes('No M-Pesa configuration found')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                })
            }

            return res.status(500).json({
                success: false,
                message: "STK Push failed",
                error: error.message
            })
        }
    }

    /**
     * STK Push Callback
     */
    static async stkCallback(req, res) {
        try {
            const { Body } = req.body
            const { businessId, storeId } = req.params

            console.log('businessId, storeId', businessId, storeId)
            console.log('req.body', req.body)

            // Always respond to M-Pesa first
            res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            })

            if (!Body || !Body.stkCallback) {
                console.error("Invalid callback data - no stkCallback")
                return
            }

            const { stkCallback } = Body
            const {
                MerchantRequestID,
                CheckoutRequestID,
                ResultCode,
                ResultDesc,
                CallbackMetadata
            } = stkCallback

            // Determine payment status
            let paymentStatus
            let failureReason = ResultDesc

            switch (ResultCode) {
                case 0:
                    paymentStatus = 'completed'
                    break
                case 1032:
                    paymentStatus = 'cancelled'
                    failureReason = 'Customer cancelled the payment'
                    break
                case 1037:
                    paymentStatus = 'timeout'
                    failureReason = 'No response from customer (timeout)'
                    break
                default:
                    paymentStatus = 'failed'
                    failureReason = ResultDesc || 'Unknown error'
            }

            // Extract metadata
            let amount = null
            let receipt = null
            let transactionDate = null
            let phone = null

            if (ResultCode === 0 && CallbackMetadata && CallbackMetadata.Item) {
                const metadata = CallbackMetadata.Item

                console.log('metadata', metadata)

                const getValue = (name) => {
                    const item = metadata.find(item => item.Name === name)
                    return item ? item.Value : null
                }

                amount = getValue("Amount")
                receipt = getValue("MpesaReceiptNumber")
                transactionDate = getValue("TransactionDate")
                phone = getValue("PhoneNumber")
            }

            // Update the STK Push log
            await MpesaController._updateMpesaLog({
                checkout_request_id: CheckoutRequestID,
                result_code: ResultCode,
                result_description: ResultDesc,
                status: paymentStatus,
                amount,
                mpesa_receipt_number: receipt,
                transaction_date: transactionDate,
                phone,
                callback_metadata: CallbackMetadata,
                callback_response: req.body
            })

            console.log("M-Pesa Callback processed successfully:", {
                MerchantRequestID,
                CheckoutRequestID,
                ResultCode,
                paymentStatus,
                amount,
                receipt
            })

            // Emit socket event for payment update with full callback metadata
            if (businessId) {
                SocketService.emitMpesaPaymentUpdate(businessId, storeId, {
                    checkoutRequestId: CheckoutRequestID,
                    merchantRequestId: MerchantRequestID,
                    resultCode: ResultCode,
                    resultDescription: ResultDesc,
                    paymentStatus,
                    amount,
                    receipt,
                    phone,
                    transactionDate,
                    failureReason,
                    callbackMetadata: CallbackMetadata,
                    callbackBody: req.body
                })
            }

        } catch (error) {
            console.error("Error processing M-Pesa callback:", error)
        }
    }

    /**
     * C2B Register URL
     */
    static async c2bRegisterURL(req, res) {
        try {
            const { business_Id } = req.body;
            const businessId = business_Id;

            const config = await MpesaConfigModel.findByBusinessId(businessId)
            const configData = Array.isArray(config) ? config[0] : config

            if (!configData || !configData.id) {
                return res.status(400).json({
                    success: false,
                    message: 'No M-Pesa configuration found for this business. Please set up M-Pesa configuration first.'
                })
            }

            const configId = configData.id

            const response = await mpesaService.c2bRegisterURL(businessId, configId);

            console.log('response:', response)

            return res.json({
                success: true,
                data: response.data,
                message: "C2B URLs registered successfully"
            });

        } catch (error) {
            console.error("C2B Register URL Error:", error.message);
            return res.status(500).json({
                success: false,
                message: "C2B Register URL failed",
                error: error.message
            });
        }
    }

    /**
     * C2B Validation Callback
     */
    static async c2bValidation(req, res) {
        try {
            const callbackData = req.body;
            
            // Process validation
            console.log("C2B Validation:", callbackData);
            
            // Accept the transaction
            return res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            });
        } catch (error) {
            console.error("C2B Validation Error:", error);
            return res.json({
                ResultCode: 1,
                ResultDesc: "Rejected"
            });
        }
    }

    /**
     * C2B Confirmation Callback
     */
    static async c2bConfirmation(req, res) {
        try {
            const callbackData = req.body
            const { businessId } = req.params
            
            console.log("C2B Confirmation:", callbackData)
            console.log("businessId:", businessId)

            res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            })

            if (!businessId) {
                console.error("No businessId provided in C2B callback")
                return
            }

            const config = await MpesaConfigModel.findByBusinessId(businessId)
            const configData = Array.isArray(config) ? config[0] : config
            const configId = configData?.id || null

            // Log the C2B transaction with first_name
            await MpesaController._logMpesaRequest({
                business_id: businessId,
                store_id: null,
                config_id: configId,
                transaction_type: 'C2B',
                phone: callbackData.MSISDN,
                first_name: callbackData.FirstName,
                amount: callbackData.TransAmount,
                trans_id: callbackData.TransID,
                trans_time: callbackData.TransTime,
                trans_amount: callbackData.TransAmount,
                bill_ref_number: callbackData.BillRefNumber,
                mpesa_receipt_number: callbackData.TransID,
                status: 'COMPLETED',
                callback_response: callbackData
            })

            SocketService.emitMpesaC2bConfirmation(businessId, {
                transId: callbackData.TransID,
                transTime: callbackData.TransTime,
                transAmount: callbackData.TransAmount,
                phone: callbackData.MSISDN,
                firstName: callbackData.FirstName,
                billRefNumber: callbackData.BillRefNumber,
                businessShortCode: callbackData.BusinessShortCode,
                orgAccountBalance: callbackData.OrgAccountBalance,
                transactionType: callbackData.TransactionType,
                invoiceNumber: callbackData.InvoiceNumber
            })

            console.log("C2B Confirmation processed successfully:", {
                transId: callbackData.TransID,
                amount: callbackData.TransAmount,
                firstName: callbackData.FirstName
            })

        } catch (error) {
            console.error("C2B Confirmation Error:", error)
            return res.json({
                ResultCode: 0,
                ResultDesc: "Accepted"
            })
        }
    }

    // ========== M-Pesa Configuration Management ==========

    /**
     * Create M-Pesa Configuration
     */
    static async createConfig(req, res) {
        try {
            const requestingUser = req.admin;
            const businessId = req.body.business_id;

            const configData = {
                ...req.body,
                business_id: businessId,
                last_modified_by: requestingUser.id
            };

            const config = await MpesaConfigModel.create(configData);
            console.log('config', config);

            const safeConfig = MpesaConfigModel.getConfigForResponse(config);
            console.log('safeConfig', safeConfig);

            return res.status(201).json({
                success: true,
                data: safeConfig,
                message: "M-Pesa configuration created successfully"
            });

        } catch (error) {
            console.error("Create M-Pesa Config Error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to create M-Pesa configuration",
                error: error.message
            });
        }
    }

    /**
     * Get single M-Pesa Configuration
     */
    static async getConfig(req, res) {
        try {
            const { id } = req.params;
            const requestingUser = req.admin;

            const config = await MpesaConfigModel.findByBusinessId(id);
            
            if (!config) {
                return res.status(404).json({
                    success: false,
                    message: "M-Pesa configuration not found"
                });
            }

            const safeConfig = MpesaConfigModel.getConfigForResponse(config);

            return res.json({
                success: true,
                data: safeConfig
            });

        } catch (error) {
            console.error("Get M-Pesa Config Error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch M-Pesa configuration",
                error: error.message
            });
        }
    }

    /**
     * Update M-Pesa Configuration
     */
    static async updateConfig(req, res) {
        try {
            const { id } = req.params;
            const requestingUser = req.user;
            const businessId = requestingUser.businessId || requestingUser.business_id;

            const existingConfig = await MpesaConfigModel.findById(id);
            if (!existingConfig || existingConfig.business_id !== businessId) {
                return res.status(404).json({
                    success: false,
                    message: "M-Pesa configuration not found"
                });
            }

            const updatedConfig = await MpesaConfigModel.update(id, {
                ...req.body,
                last_modified_by: requestingUser.id
            });

            const safeConfig = MpesaConfigModel.getConfigForResponse(updatedConfig);

            return res.json({
                success: true,
                data: safeConfig,
                message: "M-Pesa configuration updated successfully"
            });

        } catch (error) {
            console.error("Update M-Pesa Config Error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update M-Pesa configuration",
                error: error.message
            });
        }
    }

    /**
     * Delete M-Pesa Configuration
     */
    static async deleteConfig(req, res) {
        try {
            const { id } = req.params;
            const requestingUser = req.user;
            const businessId = requestingUser.businessId || requestingUser.business_id;

            const existingConfig = await MpesaConfigModel.findById(id);
            if (!existingConfig || existingConfig.business_id !== businessId) {
                return res.status(404).json({
                    success: false,
                    message: "M-Pesa configuration not found"
                });
            }

            await MpesaConfigModel.delete(id);

            return res.json({
                success: true,
                message: "M-Pesa configuration deleted successfully"
            });

        } catch (error) {
            console.error("Delete M-Pesa Config Error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to delete M-Pesa configuration",
                error: error.message
            });
        }
    }

    static async getTransactionLogs(req, res) {
        try {
            const requestingUser = req.user
            const businessId = requestingUser.businessId || requestingUser.business_id
            const { 
                page = 1, 
                limit = 20, 
                status, 
                transaction_type, 
                startDate, 
                endDate,
                store_id,
                idempotency_key,
                checkout_request_id,
                merchant_request_id,
                order_id,
                invoice_id,
                phone,
                first_name,
                reference,
                mpesa_receipt_number,
                trans_id,
                created_by,
                sort_by = 'created_at',
                sort_order = 'DESC'
            } = req.query

            const COLUMNS = [
                'mtl.id', 'mtl.business_id', 'mtl.store_id', 'mtl.config_id',
                'mtl.transaction_type', 'mtl.phone', 'mtl.first_name', 'mtl.amount', 'mtl.reference',
                'mtl.idempotency_key', 'mtl.order_id', 'mtl.invoice_id',
                'mtl.merchant_request_id', 'mtl.checkout_request_id',
                'mtl.trans_id', 'mtl.trans_time', 'mtl.trans_amount', 'mtl.bill_ref_number',
                'mtl.response_code', 'mtl.response_description',
                'mtl.result_code', 'mtl.result_description',
                'mtl.mpesa_receipt_number', 'mtl.transaction_date',
                'mtl.callback_metadata', 'mtl.callback_response',
                'mtl.status', 'mtl.error_message',
                'mtl.created_by', 'mtl.created_at', 'mtl.updated_at',
                'inv.invoice_number',
                'inv.mpesa_code',
                'inv.mpesa_phone AS invoice_mpesa_phone',
                'inv.mpesa_receipt AS invoice_mpesa_receipt',
                'inv.paid_amount',
                'inv.total_amount',
                'inv.status AS invoice_status',
                'inv.payment_status AS invoice_payment_status'
            ]

            const allowedSortColumns = [
                'created_at', 'updated_at', 'amount', 'status', 
                'transaction_type', 'phone', 'mpesa_receipt_number',
                'invoice_number', 'paid_amount', 'total_amount', 'first_name'
            ]
            const allowedSortOrders = ['ASC', 'DESC']

            const sortColumn = allowedSortColumns.includes(sort_by) ? `mtl.${sort_by}` : 'mtl.created_at'
            const sortDirection = allowedSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC'

            let sql = `SELECT ${COLUMNS.join(', ')} FROM mpesa_transaction_logs mtl LEFT JOIN invoices inv ON mtl.business_id COLLATE utf8mb4_general_ci = inv.business_id AND ((mtl.checkout_request_id IS NOT NULL AND mtl.checkout_request_id COLLATE utf8mb4_general_ci = inv.checkout_request_id) OR (mtl.merchant_request_id IS NOT NULL AND mtl.merchant_request_id COLLATE utf8mb4_general_ci = inv.merchant_request_id) OR (mtl.idempotency_key IS NOT NULL AND mtl.idempotency_key COLLATE utf8mb4_general_ci = inv.stk_push_idempotency_key)) WHERE mtl.business_id = ?`
            const params = [businessId]

            if (store_id) {
                sql += ` AND mtl.store_id = ?`
                params.push(store_id)
            }

            if (status) {
                sql += ` AND mtl.status = ?`
                params.push(status)
            }

            if (transaction_type) {
                sql += ` AND mtl.transaction_type = ?`
                params.push(transaction_type)
            }

            if (startDate) {
                sql += ` AND mtl.created_at >= ?`
                params.push(startDate)
            }

            if (endDate) {
                sql += ` AND mtl.created_at <= ?`
                params.push(endDate)
            }

            if (idempotency_key) {
                sql += ` AND mtl.idempotency_key = ?`
                params.push(idempotency_key)
            }

            if (checkout_request_id) {
                sql += ` AND mtl.checkout_request_id = ?`
                params.push(checkout_request_id)
            }

            if (merchant_request_id) {
                sql += ` AND mtl.merchant_request_id = ?`
                params.push(merchant_request_id)
            }

            if (order_id) {
                sql += ` AND mtl.order_id = ?`
                params.push(order_id)
            }

            if (invoice_id) {
                sql += ` AND mtl.invoice_id = ?`
                params.push(invoice_id)
            }

            if (phone) {
                sql += ` AND mtl.phone LIKE ?`
                params.push(`%${phone}%`)
            }

            if (first_name) {
                sql += ` AND mtl.first_name LIKE ?`
                params.push(`%${first_name}%`)
            }

            if (reference) {
                sql += ` AND mtl.reference LIKE ?`
                params.push(`%${reference}%`)
            }

            if (mpesa_receipt_number) {
                sql += ` AND mtl.mpesa_receipt_number = ?`
                params.push(mpesa_receipt_number)
            }

            if (trans_id) {
                sql += ` AND mtl.trans_id = ?`
                params.push(trans_id)
            }

            if (created_by) {
                sql += ` AND mtl.created_by = ?`
                params.push(created_by)
            }

            sql += ` ORDER BY ${sortColumn} ${sortDirection}`

            const results = await db.paginate(sql, params, {
                page: parseInt(page),
                limit: parseInt(limit),
                realTime: true
            })

            return res.json({
                success: true,
                data: results
            })

        } catch (error) {
            console.error("Get Transaction Logs Error:", error)
            return res.status(500).json({
                success: false,
                message: "Failed to fetch transaction logs",
                error: error.message
            })
        }
    }

    // ========== Helper Methods ==========

    /**
     * Log M-Pesa request
     */
    static async _logMpesaRequest(data) {
        try {
            const id = DatabaseManager.generateId()
            
            const receiptNumber = data.mpesa_receipt_number || null
            const transId = data.trans_id || null

            console.log('receiptNumber', receiptNumber)
            console.log('transId', transId);
            
            let existingLog = null
            
            if (receiptNumber) {
                const existing = await db.query(
                    `SELECT id FROM mpesa_transaction_logs WHERE mpesa_receipt_number = ? AND business_id = ? ORDER BY created_at DESC LIMIT 1`,
                    [receiptNumber, data.business_id],
                    { realTime: true }
                )
                existingLog = existing[0] || null
                console.log('existingLog', existingLog);
            }
            
            if (!existingLog && transId) {
                const existing = await db.query(
                    `SELECT id FROM mpesa_transaction_logs WHERE trans_id = ? AND business_id = ? ORDER BY created_at DESC LIMIT 1`,
                    [transId, data.business_id],
                    { realTime: true }
                )
                existingLog = existing[0] || null
                console.log('existingLog', existingLog);
            }
            
            if (!existingLog && receiptNumber) {
                const existing = await db.query(
                    `SELECT id FROM mpesa_transaction_logs WHERE mpesa_receipt_number = ? AND business_id = ? AND transaction_type = 'STK_PUSH' ORDER BY created_at DESC LIMIT 1`,
                    [receiptNumber, data.business_id],
                    { realTime: true }
                )
                existingLog = existing[0] || null
                console.log('existingLog', existingLog);
            }
            
            if (existingLog) {
                const updateFields = {}
                const updateValues = []
                
                if (data.first_name && data.first_name !== null) {
                    updateFields.first_name = data.first_name
                    updateValues.push(data.first_name)
                }
                
                if (data.status && data.status !== null) {
                    updateFields.status = data.status
                    updateValues.push(data.status)
                }
                
                if (data.trans_id && data.trans_id !== null) {
                    updateFields.trans_id = data.trans_id
                    updateValues.push(data.trans_id)
                }
                
                if (data.trans_time && data.trans_time !== null) {
                    updateFields.trans_time = data.trans_time
                    updateValues.push(data.trans_time)
                }
                
                if (data.trans_amount && data.trans_amount !== null) {
                    updateFields.trans_amount = data.trans_amount
                    updateValues.push(data.trans_amount)
                }
                
                if (data.bill_ref_number && data.bill_ref_number !== null) {
                    updateFields.bill_ref_number = data.bill_ref_number
                    updateValues.push(data.bill_ref_number)
                }
                
                if (data.callback_response && data.callback_response !== null) {
                    updateFields.callback_response = JSON.stringify(data.callback_response)
                    updateValues.push(updateFields.callback_response)
                }
                
                if (data.callback_metadata && data.callback_metadata !== null) {
                    updateFields.callback_metadata = JSON.stringify(data.callback_metadata)
                    updateValues.push(updateFields.callback_metadata)
                }
                
                updateFields.updated_at = new Date()
                updateValues.push(updateFields.updated_at)
                
                if (Object.keys(updateFields).length > 1) {
                    const setClauses = Object.keys(updateFields).map(key => `${key} = ?`).join(', ')
                    await db.query(
                        `UPDATE mpesa_transaction_logs SET ${setClauses} WHERE id = ?`,
                        [...updateValues, existingLog.id]
                    )
                    console.log(`Updated existing M-Pesa log: ${existingLog.id} with first_name: ${data.first_name}`)
                }
            } else {
                await db.query(
                    `INSERT INTO mpesa_transaction_logs SET ?`,
                    [{
                        id,
                        business_id: data.business_id,
                        store_id: data.store_id || null,
                        config_id: data.config_id || null,
                        transaction_type: data.transaction_type,
                        phone: data.phone || null,
                        first_name: data.first_name || null,
                        amount: data.amount || 0,
                        reference: data.reference || null,
                        idempotency_key: data.idempotency_key || null,
                        order_id: data.order_id || null,
                        invoice_id: data.invoice_id || null,
                        merchant_request_id: data.merchant_request_id || null,
                        checkout_request_id: data.checkout_request_id || null,
                        trans_id: data.trans_id || null,
                        trans_time: data.trans_time || null,
                        trans_amount: data.trans_amount || null,
                        bill_ref_number: data.bill_ref_number || null,
                        response_code: data.response_code || null,
                        response_description: data.response_description || null,
                        result_code: data.result_code || null,
                        result_description: data.result_description || null,
                        mpesa_receipt_number: data.mpesa_receipt_number || null,
                        transaction_date: data.transaction_date || null,
                        callback_metadata: data.callback_metadata ? JSON.stringify(data.callback_metadata) : null,
                        callback_response: data.callback_response ? JSON.stringify(data.callback_response) : null,
                        status: data.status || 'PENDING',
                        error_message: data.error_message || null,
                        created_by: data.created_by || null,
                        created_at: new Date()
                    }]
                )
            }
        } catch (error) {
            console.error("Failed to log M-Pesa request:", error)
        }
    }

    /**
     * Update M-Pesa log
     */
    static async _updateMpesaLog(data) {
        try {
            const updateFields = {};
            const updateValues = [];

            if (data.result_code !== undefined) {
                updateFields.result_code = data.result_code;
                updateValues.push(data.result_code);
            }
            if (data.result_description) {
                updateFields.result_description = data.result_description;
                updateValues.push(data.result_description);
            }
            if (data.status) {
                updateFields.status = data.status;
                updateValues.push(data.status);
            }
            if (data.amount) {
                updateFields.amount = data.amount;
                updateValues.push(data.amount);
            }
            if (data.mpesa_receipt_number) {
                updateFields.mpesa_receipt_number = data.mpesa_receipt_number;
                updateValues.push(data.mpesa_receipt_number);
            }
            if (data.transaction_date) {
                updateFields.transaction_date = data.transaction_date;
                updateValues.push(data.transaction_date);
            }
            if (data.phone) {
                updateFields.phone = data.phone;
                updateValues.push(data.phone);
            }
            if (data.callback_metadata) {
                updateFields.callback_metadata = JSON.stringify(data.callback_metadata);
                updateValues.push(updateFields.callback_metadata);
            }
            if (data.callback_response) {
                updateFields.callback_response = JSON.stringify(data.callback_response);
                updateValues.push(updateFields.callback_response);
            }

            updateFields.updated_at = new Date();
            updateValues.push(updateFields.updated_at);

            if (Object.keys(updateFields).length > 1) { // More than just updated_at
                const setClauses = Object.keys(updateFields)
                    .map(key => `${key} = ?`)
                    .join(', ');

                await db.query(
                    `UPDATE mpesa_transaction_logs 
                     SET ${setClauses}
                     WHERE checkout_request_id = ?`,
                    [...updateValues, data.checkout_request_id]
                );
            }
        } catch (error) {
            console.error("Failed to update M-Pesa log:", error);
        }
    }
}

module.exports = MpesaController;