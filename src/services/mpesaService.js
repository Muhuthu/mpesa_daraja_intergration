const axios = require("axios")
const moment = require("moment")
const MpesaConfigModel = require("../models/mpesaConfigModel")
const MpesaCallbackModel = require("../models/mpesaCallbackModel")
const encryptionService = require("../services/encryptionService")

class MpesaService {
    constructor() {
        this.sandboxURL = "https://sandbox.safaricom.co.ke"
        this.productionURL = "https://api.safaricom.co.ke"
    }

    _getBaseURL(environment) {
        return environment === "production" ? this.productionURL : this.sandboxURL
    }

    async getAccessToken(businessId, storeId = null, configId = null) {
        try {
            const config = await MpesaConfigModel.getConfigForApiCall(businessId, storeId, configId)

            console.log('config', config)
            
            if (!config) {
                throw new Error("No M-Pesa configuration found for this business/store")
            }

            if (!config.consumer_key || !config.consumer_secret) {
                throw new Error("Invalid M-Pesa configuration: missing consumer key or secret")
            }

            const baseURL = this._getBaseURL(config.environment)
            const auth = Buffer.from(
                `${config.consumer_key}:${config.consumer_secret}`
            ).toString("base64")

            const response = await axios.get(
                `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                    },
                }
            )

            console.log('response', response);

            return {
                access_token: response.data.access_token,
                config
            }
        } catch (error) {
            console.error("Error getting access token:", error.response?.data || error.message)
            throw new Error(`Failed to get M-Pesa access token: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    generatePassword(shortcode, passkey) {
        const timestamp = moment().format("YYYYMMDDHHmmss")
        const password = Buffer.from(
            shortcode + passkey + timestamp
        ).toString("base64")

        return {
            timestamp,
            password,
        }
    }

    async stkPush(businessId, storeId, phone, amount, reference = "ORDER", configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            const passkey = encryptionService.decrypt(config.passkey)
            
            const { password, timestamp } = this.generatePassword(config.shortcode, passkey)

            const baseURL = this._getBaseURL(config.environment)
            
            const callbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.STK_PUSH
            )

            const payload = {
                BusinessShortCode: config.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: config.transaction_type || "CustomerBuyGoodsOnline",
                Amount: amount,
                PartyA: phone,
                PartyB: config.till_number,
                PhoneNumber: phone,
                CallBackURL: callbackUrl,
                AccountReference: reference,
                TransactionDesc: "Payment",
            }

            console.log("STK Push Payload:", {
                ...payload,
                Password: "****",
                BusinessShortCode: config.shortcode,
                CallBackURL: callbackUrl
            })

            const response = await axios.post(
                `${baseURL}/mpesa/stkpush/v1/processrequest`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            console.log('response', response);

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId,
                config_id: config.id
            }
        } catch (error) {
            console.error("STK Push Error:", error.response?.data || error.message)
            throw new Error(`STK Push failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async stkPushQuery(businessId, storeId, checkoutRequestID, configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            const passkey = encryptionService.decrypt(config.passkey)
            
            const timestamp = moment().format("YYYYMMDDHHmmss")
            const password = Buffer.from(
                config.shortcode + passkey + timestamp
            ).toString("base64")

            const baseURL = this._getBaseURL(config.environment)

            const payload = {
                BusinessShortCode: config.shortcode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestID,
            }

            const response = await axios.post(
                `${baseURL}/mpesa/stkpushquery/v1/query`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId
            }
        } catch (error) {
            console.error("STK Push Query Error:", error.response?.data || error.message)
            throw new Error(`STK Push Query failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async b2cPayment(businessId, storeId, phone, amount, remarks = "Payment", configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            if (!config.initiator_name || !config.security_credential) {
                throw new Error("B2C configuration incomplete: missing initiator name or security credential")
            }

            const securityCredential = encryptionService.decrypt(config.security_credential)
            const baseURL = this._getBaseURL(config.environment)

            const resultCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.B2C_RESULT
            )
            
            const timeoutCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.B2C_TIMEOUT
            )

            const payload = {
                InitiatorName: config.initiator_name,
                SecurityCredential: securityCredential,
                CommandID: "BusinessPayment",
                Amount: amount,
                PartyA: config.shortcode,
                PartyB: phone,
                Remarks: remarks,
                QueueTimeOutURL: timeoutCallbackUrl,
                ResultURL: resultCallbackUrl,
                Occasion: remarks,
            }

            const response = await axios.post(
                `${baseURL}/mpesa/b2c/v1/paymentrequest`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId
            }
        } catch (error) {
            console.error("B2C Payment Error:", error.response?.data || error.message)
            throw new Error(`B2C Payment failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async c2bRegisterURL(businessId, storeId = null, configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            console.log('access_token', access_token);
            console.log('config for c2b', config);
            const baseURL = this._getBaseURL(config.environment)

            const confirmationCallbackUrl = await MpesaCallbackModel.getCallbackUrlWithoutStore(
                businessId,
                MpesaCallbackModel.CALLBACK_TYPES.C2B_CONFIRMATION
            )

            const validationCallbackUrl = await MpesaCallbackModel.getCallbackUrlWithoutStore(
                businessId,
                MpesaCallbackModel.CALLBACK_TYPES.C2B_VALIDATION
            )

            console.log('confirmationCallbackUrl', confirmationCallbackUrl);
            console.log('validationCallbackUrl', validationCallbackUrl);

            const payload = {
                ShortCode: config.shortcode,
                ResponseType: "Completed",
                ConfirmationURL: confirmationCallbackUrl,
                ValidationURL: validationCallbackUrl,
            }

            console.log("C2B Register URL Payload:", payload)

            const response = await axios.post(
                `${baseURL}/mpesa/c2b/v2/registerurl`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            console.log('C2B Register URL Response:', response)

            return {
                success: true,
                data: response.data,
                business_id: businessId
            }
        } catch (error) {
            console.error("C2B Register URL Error:", error.response?.data || error.message)
            throw new Error(`C2B Register URL failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async transactionStatus(businessId, storeId, transactionID, configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            if (!config.initiator_name || !config.security_credential) {
                throw new Error("Transaction status configuration incomplete")
            }

            const securityCredential = encryptionService.decrypt(config.security_credential)
            const baseURL = this._getBaseURL(config.environment)

            const resultCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.TRANSACTION_STATUS_RESULT
            )
            
            const timeoutCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.TRANSACTION_STATUS_TIMEOUT
            )

            const payload = {
                Initiator: config.initiator_name,
                SecurityCredential: securityCredential,
                CommandID: "TransactionStatusQuery",
                TransactionID: transactionID,
                PartyA: config.shortcode,
                IdentifierType: "1",
                ResultURL: resultCallbackUrl,
                QueueTimeOutURL: timeoutCallbackUrl,
                Remarks: "Transaction status query",
                Occasion: "Status check",
            }

            const response = await axios.post(
                `${baseURL}/mpesa/transactionstatus/v1/query`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId
            }
        } catch (error) {
            console.error("Transaction Status Error:", error.response?.data || error.message)
            throw new Error(`Transaction Status failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async reversal(businessId, storeId, transactionID, amount, receiverParty, configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            if (!config.initiator_name || !config.security_credential) {
                throw new Error("Reversal configuration incomplete")
            }

            const securityCredential = encryptionService.decrypt(config.security_credential)
            const baseURL = this._getBaseURL(config.environment)

            const resultCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.REVERSAL_RESULT
            )
            
            const timeoutCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.REVERSAL_TIMEOUT
            )

            const payload = {
                Initiator: config.initiator_name,
                SecurityCredential: securityCredential,
                CommandID: "TransactionReversal",
                TransactionID: transactionID,
                Amount: amount,
                ReceiverParty: receiverParty,
                RecieverIdentifierType: "11",
                ResultURL: resultCallbackUrl,
                QueueTimeOutURL: timeoutCallbackUrl,
                Remarks: "Transaction reversal",
                Occasion: "Reversal",
            }

            const response = await axios.post(
                `${baseURL}/mpesa/reversal/v1/request`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId
            }
        } catch (error) {
            console.error("Reversal Error:", error.response?.data || error.message)
            throw new Error(`Reversal failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }

    async accountBalance(businessId, storeId, configId = null) {
        try {
            const { access_token, config } = await this.getAccessToken(businessId, storeId, configId)
            
            if (!config.initiator_name || !config.security_credential) {
                throw new Error("Account balance configuration incomplete")
            }

            const securityCredential = encryptionService.decrypt(config.security_credential)
            const baseURL = this._getBaseURL(config.environment)

            const resultCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.ACCOUNT_BALANCE_RESULT
            )
            
            const timeoutCallbackUrl = await MpesaCallbackModel.getCallbackUrl(
                businessId, 
                storeId, 
                MpesaCallbackModel.CALLBACK_TYPES.ACCOUNT_BALANCE_TIMEOUT
            )

            const payload = {
                Initiator: config.initiator_name,
                SecurityCredential: securityCredential,
                CommandID: "AccountBalance",
                PartyA: config.shortcode,
                IdentifierType: "4",
                Remarks: "Account balance query",
                QueueTimeOutURL: timeoutCallbackUrl,
                ResultURL: resultCallbackUrl,
            }

            const response = await axios.post(
                `${baseURL}/mpesa/accountbalance/v1/query`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            )

            return {
                success: true,
                data: response.data,
                business_id: businessId,
                store_id: storeId
            }
        } catch (error) {
            console.error("Account Balance Error:", error.response?.data || error.message)
            throw new Error(`Account Balance failed: ${error.response?.data?.errorMessage || error.message}`)
        }
    }
}

module.exports = new MpesaService()