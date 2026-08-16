import { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import socketClient from '../services/socketClient';
import { toast } from 'sonner';
import { selectStoreId } from '../redux/authSlice';

export const useSocket = (options = {}) => {
  const { autoConnect = true, enableToasts = true } = options;
  const { user } = useSelector((state) => state.auth);
  const storeId = useSelector(selectStoreId);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const businessId = user?.businessId;
  const initializedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  const connectSocket = useCallback(() => {
    if (!businessId) {
      console.warn('No businessId available for socket connection');
      return;
    }

    initializedRef.current = true;

    const socket = socketClient.connect(businessId, storeId);

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttemptRef.current = 0;
      
      if (enableToasts) {
        toast.success('Real-time updates connected', { duration: 2000 });
      }
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
      
      if (enableToasts && reason !== 'io client disconnect') {
        toast.warning('Connection lost - attempting to reconnect...', { duration: 3000 });
      }
    };

    const handleConnectError = (error) => {
      setConnectionStatus('error');
      reconnectAttemptRef.current++;
      
      if (enableToasts && reconnectAttemptRef.current > 2) {
        toast.error('Connection issues - some features may be limited', { duration: 4000 });
      }
    };

    const handleReconnectAttempt = (attempt) => {
      setConnectionStatus('reconnecting');
    };

    const handleReconnect = (attempt) => {
      setConnectionStatus('connected');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('reconnect', handleReconnect);

    setIsConnected(socketClient.getConnectionStatus());
    setConnectionStatus(socketClient.getConnectionStatus() ? 'connected' : 'disconnected');

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('reconnect', handleReconnect);
    };
  }, [businessId, storeId, enableToasts]);

  useEffect(() => {
    if (!autoConnect || !businessId || initializedRef.current) return;
    const cleanup = connectSocket();
    return () => {
      cleanup?.();
      initializedRef.current = false;
    };
  }, [autoConnect, businessId, connectSocket]);

  return {
    socket: socketClient,
    isConnected,
    connectionStatus,
    businessId,
    storeId
  };
};

// Specialized hook for category products updates
export const useCategoryProductsSocket = (categoryId, options = {}) => {
  const { 
    autoJoin = true, 
    onProductsRefresh, 
    enableToasts = true,
    refetchOnConnect = true 
  } = options;
  
  const { socket, isConnected, businessId } = useSocket({ autoConnect: true, enableToasts });
  const categoryIdRef = useRef(categoryId);
  const hasRefetchedRef = useRef(false);

  useEffect(() => { categoryIdRef.current = categoryId; }, [categoryId]);

  useEffect(() => {
    if (!isConnected || !businessId || !categoryId || !autoJoin) return;
    const joined = socket.joinCategory(categoryId);
    if (joined && refetchOnConnect && !hasRefetchedRef.current) {
      setTimeout(() => {
        if (onProductsRefresh) {
          onProductsRefresh({
            categoryId,
            timestamp: new Date().toISOString(),
            type: 'INITIAL_FETCH',
            message: 'Initial category products load'
          });
        }
      }, 1000);
      hasRefetchedRef.current = true;
    }
    return () => {
      if (categoryIdRef.current) {
        socket.leaveCategory(categoryIdRef.current);
        hasRefetchedRef.current = false;
      }
    };
  }, [isConnected, businessId, categoryId, autoJoin, socket, onProductsRefresh, refetchOnConnect]);

  useEffect(() => {
    if (!isConnected || !onProductsRefresh) return;
    const handleCategoryRefresh = (data) => {
      if (!categoryId || data.categoryId === categoryId) {
        onProductsRefresh(data);
      }
    };
    const unsubscribe = socket.onCategoryRefresh(handleCategoryRefresh);
    return unsubscribe;
  }, [isConnected, categoryId, onProductsRefresh, socket, enableToasts]);

  useEffect(() => {
    if (!isConnected || !onProductsRefresh) return;
    const handleStockUpdated = (stockData) => {
      if (categoryId) {
        setTimeout(() => {
          onProductsRefresh({
            categoryId,
            timestamp: new Date().toISOString(),
            type: 'STOCK_UPDATE',
            message: 'Stock levels updated',
            stockData
          });
        }, 500);
      }
    };
    const unsubscribe = socket.onStockUpdated(handleStockUpdated);
    return unsubscribe;
  }, [isConnected, categoryId, onProductsRefresh, socket]);

  return { isConnected, categoryId };
};

// M-Pesa Socket Hook
export const useMpesaSocket = (options = {}) => {
  const { 
    onPaymentUpdate, 
    onTransactionLogsRefresh,
    onStkPushInitiated,
    onConfigUpdated,
    onC2bConfirmation,
    enableToasts = true,
    checkoutRequestId = null
  } = options;
  
  const { socket, isConnected, businessId, storeId } = useSocket({ autoConnect: true, enableToasts });
  const checkoutRoomJoinedRef = useRef(false);
  const [c2bConfirmation, setC2bConfirmation] = useState(null);

  // Join checkout room for specific payment tracking
  useEffect(() => {
    if (!isConnected || !businessId || !checkoutRequestId || checkoutRoomJoinedRef.current) return;

    socket.joinCheckoutRoom(businessId, checkoutRequestId);
    checkoutRoomJoinedRef.current = true;

    return () => {
      socket.leaveCheckoutRoom(businessId, checkoutRequestId);
      checkoutRoomJoinedRef.current = false;
    };
  }, [isConnected, businessId, checkoutRequestId, socket]);

  // Join M-Pesa logs room
  useEffect(() => {
    if (!isConnected || !businessId) return;

    socket.joinMpesaLogs(businessId, storeId);

    return () => {
      socket.leaveMpesaLogs(businessId, storeId);
    };
  }, [isConnected, businessId, storeId, socket]);

  // Listen for payment updates
  useEffect(() => {
    if (!isConnected || !onPaymentUpdate) return;

    const unsubscribe = socket.onMpesaPaymentUpdate((data) => {
      console.log('M-Pesa payment update received:', {
        checkoutRequestId: data.checkoutRequestId,
        paymentStatus: data.paymentStatus,
        amount: data.amount,
        receipt: data.receipt,
        callbackMetadata: data.callbackMetadata
      });
      
      if (enableToasts) {
        if (data.paymentStatus === 'completed') {
          toast.success(`Payment of KES ${data.amount || ''} received!`, {
            description: data.receipt ? `Receipt: ${data.receipt}` : undefined,
            duration: 5000
          });
        } else if (data.paymentStatus === 'failed') {
          toast.error(`Payment failed: ${data.failureReason || data.resultDescription || 'Unknown error'}`, {
            duration: 5000
          });
        } else if (data.paymentStatus === 'cancelled') {
          toast.warning('Payment was cancelled by customer', { duration: 4000 });
        } else if (data.paymentStatus === 'timeout') {
          toast.warning('Payment request timed out', { duration: 4000 });
        }
      }

      onPaymentUpdate(data);
    });

    return unsubscribe;
  }, [isConnected, onPaymentUpdate, socket, enableToasts]);

  // Listen for STK Push initiated
  useEffect(() => {
    if (!isConnected || !onStkPushInitiated) return;

    const unsubscribe = socket.onMpesaStkPushInitiated((data) => {
      console.log('STK Push initiated:', data);
      onStkPushInitiated(data);
    });

    return unsubscribe;
  }, [isConnected, onStkPushInitiated, socket]);

  // Listen for transaction logs refresh
  useEffect(() => {
    if (!isConnected || !onTransactionLogsRefresh) return;

    const unsubscribe = socket.onMpesaTransactionLogsRefresh((data) => {
      console.log('M-Pesa transaction logs refresh:', data);
      onTransactionLogsRefresh(data);
    });

    return unsubscribe;
  }, [isConnected, onTransactionLogsRefresh, socket]);

  // Listen for config updates
  useEffect(() => {
    if (!isConnected || !onConfigUpdated) return;

    const unsubscribe = socket.onMpesaConfigUpdated((data) => {
      console.log('M-Pesa config updated:', data);
      onConfigUpdated(data);
    });

    return unsubscribe;
  }, [isConnected, onConfigUpdated, socket]);

  // Listen for C2B confirmations
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = socket.onMpesaC2bConfirmation((data) => {
      console.log('C2B Confirmation received:', data);
      setC2bConfirmation(data);
      
      // Pass C2B data to payment update handler with transId as receipt
      if (onPaymentUpdate) {
        onPaymentUpdate({
          checkoutRequestId: data.transId,
          merchantRequestId: null,
          resultCode: 0,
          resultDescription: 'C2B Payment',
          paymentStatus: 'completed',
          amount: data.transAmount,
          receipt: data.transId,
          phone: data.phone,
          transactionDate: data.transTime,
          failureReason: null,
          callbackMetadata: data,
          callbackBody: data,
          isC2b: true,
          firstName: data.firstName
        })
      }
      
      if (enableToasts) {
        toast.success(`M-Pesa payment of KES ${data.transAmount || ''} received from ${data.firstName || 'customer'}!`, {
          description: data.transId ? `Trans ID: ${data.transId}` : undefined,
          duration: 5000
        });
      }

      if (onC2bConfirmation) {
        onC2bConfirmation(data);
      }
    });

    return unsubscribe;
  }, [isConnected, socket, enableToasts, onC2bConfirmation, onPaymentUpdate]);

  return {
    isConnected,
    businessId,
    storeId,
    checkoutRequestId,
    c2bConfirmation
  };
};