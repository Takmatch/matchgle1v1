const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'xbox360.ñ.';

// Middleware de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria de las 3 salas
const rooms = {
  'sala-1': { id: 'sala-1', name: 'Sala 1', users: [], admins: [] },
  'sala-2': { id: 'sala-2', name: 'Sala 2', users: [], admins: [] },
  'sala-3': { id: 'sala-3', name: 'Sala 3', users: [], admins: [] }
};

// Obtener resumen de las salas para el Lobby
function getRoomsSummary() {
  const summary = {};
  for (const [roomId, room] of Object.entries(rooms)) {
    summary[roomId] = {
      id: room.id,
      name: room.name,
      userCount: room.users.length,
      maxUsers: 2,
      isFull: room.users.length >= 2,
      adminCount: room.admins.length
    };
  }
  return summary;
}

// Broadcast de estado a todos los clientes en el lobby
function broadcastRoomsState() {
  io.emit('rooms-update', getRoomsSummary());
}

io.on('connection', (socket) => {
  console.log(`🟢 [Conexión] Nuevo cliente conectado: ${socket.id}`);
  
  // Enviar estado de salas al conectar
  socket.emit('rooms-update', getRoomsSummary());

  // Verificación de PIN de Administrador
  socket.on('verify-admin', (pin, callback) => {
    const isValid = String(pin).trim() === String(ADMIN_PIN).trim();
    console.log(`🔑 [Admin] Intento de login admin de ${socket.id}: ${isValid ? 'Éxito' : 'Fallido'}`);
    if (typeof callback === 'function') {
      callback({ success: isValid });
    }
  });

  // Unirse a una sala
  socket.on('join-room', ({ roomId, isAdmin }, callback) => {
    const room = rooms[roomId];
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Sala no válida' });
      return;
    }

    // Si es un usuario normal y la sala ya tiene 2 usuarios
    if (!isAdmin && room.users.length >= 2) {
      console.log(`⚠️ [${roomId}] Rechazado ${socket.id} (Sala llena: ${room.users.length}/2)`);
      if (typeof callback === 'function') callback({ success: false, message: 'La sala está ocupada (máximo 2 personas)' });
      return;
    }

    socket.join(roomId);
    socket.data.currentRoom = roomId;
    socket.data.isAdmin = !!isAdmin;

    if (isAdmin) {
      if (!room.admins.includes(socket.id)) {
        room.admins.push(socket.id);
      }
      console.log(`🛡️ [${roomId}] Administrador ${socket.id} ingresó a supervisar.`);
    } else {
      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }
      console.log(`👤 [${roomId}] Usuario ${socket.id} se unió. (Total usuarios: ${room.users.length}/2)`);
    }

    // Lista de otros usuarios y administradores en la sala para señalización WebRTC
    const existingUsers = room.users.filter(id => id !== socket.id);
    const existingAdmins = room.admins.filter(id => id !== socket.id);

    // Responder al usuario que se une
    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        isAdmin: !!isAdmin,
        peers: isAdmin ? existingUsers : [...existingUsers, ...existingAdmins],
        hasAdmin: room.admins.length > 0
      });
    }

    // Notificar a los que ya están en la sala sobre el nuevo participante
    socket.to(roomId).emit('peer-joined', {
      peerId: socket.id,
      isAdmin: !!isAdmin
    });

    // Si entra un admin, notificar aviso de moderación a los usuarios
    if (isAdmin) {
      io.to(roomId).emit('moderation-status', { active: true, count: room.admins.length });
    }

    broadcastRoomsState();
  });

  // Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on('signal', ({ targetId, signalData }) => {
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      isAdmin: !!socket.data.isAdmin,
      signalData
    });
  });

  // Mensajes de chat dentro de la sala
  socket.on('send-chat', ({ roomId, message, senderName }) => {
    const safeMsg = String(message || '').trim().slice(0, 500);
    if (!safeMsg) return;

    io.to(roomId).emit('new-chat', {
      senderId: socket.id,
      senderName: senderName || (socket.data.isAdmin ? '🛡️ Moderador' : 'Usuario'),
      message: safeMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAdmin: !!socket.data.isAdmin
    });
  });

  // Expulsar usuario (solo Admin)
  socket.on('kick-user', ({ targetId, roomId }) => {
    if (!socket.data.isAdmin) return;

    io.to(targetId).emit('kicked', { reason: 'Has sido expulsado por el moderador de la sala.' });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.leave(roomId);
      cleanUpSocket(targetSocket);
    }
  });

  // Salir de la sala
  socket.on('leave-room', () => {
    cleanUpSocket(socket);
  });

  // Desconexión
  socket.on('disconnect', () => {
    cleanUpSocket(socket);
  });

  function cleanUpSocket(s) {
    const roomId = s.data.currentRoom;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const wasAdmin = s.data.isAdmin;

    // Remover de listas
    room.users = room.users.filter(id => id !== s.id);
    room.admins = room.admins.filter(id => id !== s.id);

    s.leave(roomId);
    s.data.currentRoom = null;

    console.log(`🔴 [${roomId}] ${wasAdmin ? 'Administrador' : 'Usuario'} ${s.id} salió. (Restantes: ${room.users.length}/2)`);

    // Notificar a la sala que este peer salió
    io.to(roomId).emit('peer-left', {
      peerId: s.id,
      isAdmin: wasAdmin
    });

    // Actualizar aviso de moderación si no quedan administradores
    if (wasAdmin) {
      io.to(roomId).emit('moderation-status', {
        active: room.admins.length > 0,
        count: room.admins.length
      });
    }

    broadcastRoomsState();
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Servidor PrivaCam 1v1 iniciado en http://localhost:${PORT}`);
  console.log(`🛡️ Acceso de Administrador Protegido`);
  console.log(`===============================================`);
});
