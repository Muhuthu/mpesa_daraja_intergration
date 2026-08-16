const { getIO } = require('../utils/socketServer')

class SocketService {
  // M-Pesa Payment Update Event (called from stkCallback)
  static emitMpesaPaymentUpdate(businessId, storeId, paymentData) {
    const io = getIO()
    
    const eventData = {
      ...paymentData,
      timestamp: new Date(),
      type: 'MPESA_PAYMENT_UPDATE'
    }

    // Emit to business room
    const businessRoom = `business:${businessId}`
    io.to(businessRoom).emit('mpesa:payment-update', eventData)

    if (storeId) {
      const storeRoom = `business:${businessId}:store:${storeId}`
      io.to(storeRoom).emit('mpesa:payment-update', eventData)
    }

    if (paymentData.checkoutRequestId) {
      const checkoutRoom = `business:${businessId}:checkout:${paymentData.checkoutRequestId}`
      io.to(checkoutRoom).emit('mpesa:payment-update', eventData)
    }

    console.log('M-Pesa payment update emitted:', {
      businessId,
      storeId,
      checkoutRequestId: paymentData.checkoutRequestId,
      paymentStatus: paymentData.paymentStatus,
      amount: paymentData.amount,
      receipt: paymentData.receipt
    })
  }

  // M-Pesa C2B Confirmation Event
  static emitMpesaC2bConfirmation(businessId, c2bData) {
      const io = getIO()
      
      const eventData = {
          ...c2bData,
          timestamp: new Date(),
          type: 'MPESA_C2B_CONFIRMATION'
      }

      const businessRoom = `business:${businessId}`
      io.to(businessRoom).emit('mpesa:c2b-confirmation', eventData)

      const businessLogsRoom = `business:${businessId}:mpesa-logs`
      io.to(businessLogsRoom).emit('mpesa:c2b-confirmation', eventData)

      console.log('M-Pesa C2B confirmation emitted:', {
          businessId,
          transId: c2bData.transId,
          amount: c2bData.transAmount,
          firstName: c2bData.firstName
      })
  }

  // M-Pesa STK Push Initiated Event
  static emitMpesaStkPushInitiated(businessId, storeId, stkPushData) {
    const io = getIO()
    
    const eventData = {
      ...stkPushData,
      timestamp: new Date(),
      type: 'MPESA_STK_PUSH_INITIATED'
    }

    const businessRoom = `business:${businessId}`
    io.to(businessRoom).emit('mpesa:stk-push-initiated', eventData)

    if (storeId) {
      const storeRoom = `business:${businessId}:store:${storeId}`
      io.to(storeRoom).emit('mpesa:stk-push-initiated', eventData)
    }

    if (stkPushData.checkoutRequestId) {
      const checkoutRoom = `business:${businessId}:checkout:${stkPushData.checkoutRequestId}`
      io.to(checkoutRoom).emit('mpesa:stk-push-initiated', eventData)
    }
  }

  // M-Pesa Transaction Logs Refresh Event
  static emitMpesaTransactionLogsRefresh(businessId, storeId = null) {
    const io = getIO()
    
    const eventData = {
      timestamp: new Date(),
      type: 'MPESA_TRANSACTION_LOGS_REFRESH',
      message: 'M-Pesa transaction logs have been updated'
    }

    const businessLogsRoom = `business:${businessId}:mpesa-logs`
    io.to(businessLogsRoom).emit('mpesa:transaction-logs-refresh', eventData)

    const businessRoom = `business:${businessId}`
    io.to(businessRoom).emit('mpesa:transaction-logs-refresh', eventData)

    if (storeId) {
      const storeLogsRoom = `business:${businessId}:store:${storeId}:mpesa-logs`
      io.to(storeLogsRoom).emit('mpesa:transaction-logs-refresh', eventData)
      
      const storeRoom = `business:${businessId}:store:${storeId}`
      io.to(storeRoom).emit('mpesa:transaction-logs-refresh', eventData)
    }
  }

  static emitMpesaConfigUpdated(businessId) {
    const io = getIO()
    
    const eventData = {
      timestamp: new Date(),
      type: 'MPESA_CONFIG_UPDATED',
      message: 'M-Pesa configuration has been updated'
    }

    const businessRoom = `business:${businessId}`
    io.to(businessRoom).emit('mpesa:config-updated', eventData)
  }

  // ========== Checkout Room Management ==========
  static joinCheckoutRequestRoom(socket, businessId, checkoutRequestId) {
    const roomName = `business:${businessId}:checkout:${checkoutRequestId}`
    socket.join(roomName)
    console.log(`Socket ${socket.id} joined checkout room: ${roomName}`)
  }

  static leaveCheckoutRequestRoom(socket, businessId, checkoutRequestId) {
    const roomName = `business:${businessId}:checkout:${checkoutRequestId}`
    socket.leave(roomName)
    console.log(`Socket ${socket.id} left checkout room: ${roomName}`)
  }
}

module.exports = SocketService