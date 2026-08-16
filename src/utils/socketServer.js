const { Server } = require('socket.io');

let io;

function setupSocketServer(server) {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('CLIENT CONNECTED - Socket ID:', socket.id);
    
    socket.on('join-pos-admin', () => {
      socket.join('pos-admins');
      console.log(`POS ADMIN CLIENT CONNECTED: ${socket.id}`);
    });

    socket.on('join-business', (businessId) => {
      const roomName = `business:${businessId}`;
      socket.join(roomName);
      console.log(`CLIENT ${socket.id} JOINED BUSINESS: ${businessId}`);
      console.log(`Room ${roomName} now has:`, io.sockets.adapter.rooms.get(roomName)?.size || 0, 'clients');
    });

    socket.on('join-store', (data) => {
      const { businessId, storeId } = data;
      const roomName = `business:${businessId}:store:${storeId}`;
      socket.join(roomName);
      console.log(`CLIENT ${socket.id} JOINED STORE: ${storeId} in business: ${businessId}`);
    });

    socket.on('join-mpesa-logs', (data) => {
      const { businessId, storeId } = data;
      const roomName = `business:${businessId}:mpesa-logs`;
      socket.join(roomName);
      console.log(`CLIENT ${socket.id} JOINED MPESA LOGS: business ${businessId}`);
      
      if (storeId) {
        const storeRoomName = `business:${businessId}:store:${storeId}:mpesa-logs`;
        socket.join(storeRoomName);
        console.log(`CLIENT ${socket.id} JOINED MPESA LOGS: store ${storeId}`);
      }
    });

    socket.on('leave-mpesa-logs', (data) => {
      const { businessId, storeId } = data;
      const roomName = `business:${businessId}:mpesa-logs`;
      socket.leave(roomName);
      
      if (storeId) {
        const storeRoomName = `business:${businessId}:store:${storeId}:mpesa-logs`;
        socket.leave(storeRoomName);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('CLIENT DISCONNECTED:', socket.id, 'Reason:', reason);
    });

    socket.onAny((eventName, ...args) => {
      if (!eventName.startsWith('join-') && !eventName.startsWith('leave-')) {
        console.log(`SERVER RECEIVED EVENT: ${eventName} from ${socket.id}`, args);
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

module.exports = {
  setupSocketServer,
  getIO
};