import { io } from 'socket.io-client';

class SocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.businessId = null;
    this.storeId = null;
    this.joinedRooms = new Set();
    this.eventCallbacks = new Map();
  }

  connect(businessId, storeId = null) {
    if (this.socket?.connected && this.businessId === businessId) {
      return this.socket;
    }

    if (this.socket && this.businessId !== businessId) {
      this.socket.disconnect();
      this.socket = null;
      this.joinedRooms.clear();
    }

    this.businessId = businessId;
    this.storeId = storeId;

    this.socket = io(import.meta.env.VITE_APP_BASE_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      
      this.joinedRooms.forEach(room => {
        if (room.startsWith('business:')) {
          this.socket.emit('join-business', businessId);
        } else if (room.startsWith('category:')) {
          const categoryId = room.split(':')[2];
          this.socket.emit('join-category', { businessId, categoryId });
        } else if (room.startsWith('checkout:')) {
          const checkoutRequestId = room.split(':')[2];
          this.socket.emit('join-checkout-room', { businessId, checkoutRequestId });
        }
      });
      
      if (businessId && !this.joinedRooms.has(`business:${businessId}`)) {
        this.socket.emit('join-business', businessId);
        this.joinedRooms.add(`business:${businessId}`);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('SOCKET CONNECTION ERROR:', error.message);
      this.isConnected = false;
    });

    this.socket.onAny((eventName, ...args) => {
      if (this.eventCallbacks.has(eventName)) {
        this.eventCallbacks.get(eventName).forEach(callback => {
          try {
            callback(...args);
          } catch (error) {
            console.error(`Error in ${eventName} callback:`, error);
          }
        });
      }
    });

    return this.socket;
  }

  // ========== M-Pesa Methods ==========

  joinCheckoutRoom(businessId, checkoutRequestId) {
    if (!this.socket || !this.isConnected) return false;
    
    const roomKey = `checkout:${businessId}:${checkoutRequestId}`;
    if (this.joinedRooms.has(roomKey)) return true;

    this.socket.emit('join-checkout-room', { businessId, checkoutRequestId });
    this.joinedRooms.add(roomKey);
    return true;
  }

  leaveCheckoutRoom(businessId, checkoutRequestId) {
    if (!this.socket) return;
    
    const roomKey = `checkout:${businessId}:${checkoutRequestId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-checkout-room', { businessId, checkoutRequestId });
      this.joinedRooms.delete(roomKey);
    }
  }

  joinMpesaLogs(businessId, storeId = null) {
    if (!this.socket || !this.isConnected) return false;
    
    const roomKey = `mpesa-logs:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;

    this.socket.emit('join-mpesa-logs', { businessId, storeId });
    this.joinedRooms.add(roomKey);
    return true;
  }

  leaveMpesaLogs(businessId, storeId = null) {
    if (!this.socket) return;
    
    const roomKey = `mpesa-logs:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-mpesa-logs', { businessId, storeId });
      this.joinedRooms.delete(roomKey);
    }
  }

  onMpesaPaymentUpdate(callback) {
    return this.on('mpesa:payment-update', (data) => {
      callback(data);
    });
  }

  onMpesaStkPushInitiated(callback) {
    return this.on('mpesa:stk-push-initiated', (data) => {
      callback(data);
    });
  }

  onMpesaTransactionLogsRefresh(callback) {
    return this.on('mpesa:transaction-logs-refresh', (data) => {
      callback(data);
    });
  }

  onMpesaConfigUpdated(callback) {
    return this.on('mpesa:config-updated', (data) => {
      callback(data);
    });
  }

  onMpesaC2bConfirmation(callback) {
      return this.on('mpesa:c2b-confirmation', (data) => {
          callback(data)
      })
  }

  // ========== Existing Methods ==========

  joinCategory(categoryId) {
    if (!this.socket || !this.businessId || !this.isConnected) {
      console.warn('CANNOT JOIN CATEGORY - Socket not connected:', {
        hasSocket: !!this.socket,
        hasBusinessId: !!this.businessId,
        isConnected: this.isConnected
      });
      return false;
    }
    
    const roomKey = `category:${this.businessId}:${categoryId}`;
    if (this.joinedRooms.has(roomKey)) return true;

    this.socket.emit('join-category', {
      businessId: this.businessId,
      categoryId: categoryId
    });
    
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinAdvancedSalaries(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `advanced-salaries:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-advanced-salaries', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinPayrolls(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `payrolls:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-payrolls', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinLeaves(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `leaves:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-leaves', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinEmployee(employeeId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `employee:${employeeId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-employee', employeeId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinPurchases(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `purchases:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-purchases', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinPurchase(businessId, purchaseId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `purchase:${businessId}:${purchaseId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-purchase', { businessId, purchaseId });
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinLPOs(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `lpos:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-lpos', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinLPO(businessId, lpoId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `lpo:${businessId}:${lpoId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-lpo', { businessId, lpoId });
    this.joinedRooms.add(roomKey);
    return true;
  }

  joinProducts(businessId) {
    if (!this.socket || !this.isConnected) return false;
    const roomKey = `products:${businessId}`;
    if (this.joinedRooms.has(roomKey)) return true;
    this.socket.emit('join-products', businessId);
    this.joinedRooms.add(roomKey);
    return true;
  }

  // ========== Event Listeners ==========

  onPurchasesRefresh(callback) {
    return this.on('purchases:refresh', (data) => { callback(data); });
  }

  onPurchaseUpdated(callback) {
    return this.on('purchase:updated', (data) => { callback(data); });
  }

  onLPOsRefresh(callback) {
    return this.on('lpos:refresh', (data) => { callback(data); });
  }

  onLPOUpdated(callback) {
    return this.on('lpo:updated', (data) => { callback(data); });
  }

  onProductsRefresh(callback) {
    return this.on('products:refresh', (data) => { callback(data); });
  }

  onCategoryRefresh(callback) {
    return this.on('category:refresh', (data) => { callback(data); });
  }

  onAdvancedSalariesRefresh(callback) {
    return this.on('advanced-salaries:refresh', (data) => { callback(data); });
  }

  onPayrollsRefresh(callback) {
    return this.on('payrolls:refresh', (data) => { callback(data); });
  }

  onLeavesRefresh(callback) {
    return this.on('leaves:refresh', (data) => { callback(data); });
  }

  onEmployeeDataRefresh(callback) {
    return this.on('employee:data-refresh', (data) => { callback(data); });
  }

  onStockUpdated(callback) {
    return this.on('stock:updated', (data) => { callback(data); });
  }

  // ========== Leave Methods ==========

  leaveCategory(categoryId) {
    if (!this.socket || !this.businessId) return;
    const roomKey = `category:${this.businessId}:${categoryId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-category', { businessId: this.businessId, categoryId });
      this.joinedRooms.delete(roomKey);
    }
  }

  leavePurchases(businessId) {
    if (!this.socket) return;
    const roomKey = `purchases:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-purchases', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leavePurchase(businessId, purchaseId) {
    if (!this.socket) return;
    const roomKey = `purchase:${businessId}:${purchaseId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-purchase', { businessId, purchaseId });
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveLPOs(businessId) {
    if (!this.socket) return;
    const roomKey = `lpos:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-lpos', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveLPO(businessId, lpoId) {
    if (!this.socket) return;
    const roomKey = `lpo:${businessId}:${lpoId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-lpo', { businessId, lpoId });
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveProducts(businessId) {
    if (!this.socket) return;
    const roomKey = `products:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-products', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveAdvancedSalaries(businessId) {
    if (!this.socket) return;
    const roomKey = `advanced-salaries:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-advanced-salaries', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leavePayrolls(businessId) {
    if (!this.socket) return;
    const roomKey = `payrolls:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-payrolls', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveLeaves(businessId) {
    if (!this.socket) return;
    const roomKey = `leaves:${businessId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-leaves', businessId);
      this.joinedRooms.delete(roomKey);
    }
  }

  leaveEmployee(employeeId) {
    if (!this.socket) return;
    const roomKey = `employee:${employeeId}`;
    if (this.joinedRooms.has(roomKey)) {
      this.socket.emit('leave-employee', employeeId);
      this.joinedRooms.delete(roomKey);
    }
  }

  // ========== Core Event Management ==========

  on(event, callback) {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event).add(callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.eventCallbacks.has(event)) {
      this.eventCallbacks.get(event).delete(callback);
    }
    this.socket?.off(event, callback);
  }

  removeAllListeners(event) {
    this.eventCallbacks.delete(event);
    this.socket?.removeAllListeners(event);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.joinedRooms.clear();
      this.eventCallbacks.clear();
    }
  }

  getConnectionStatus() {
    return this.isConnected && this.socket?.connected;
  }

  getJoinedRooms() {
    return Array.from(this.joinedRooms);
  }
}

const socketClient = new SocketClient();
export default socketClient;