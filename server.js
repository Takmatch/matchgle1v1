const express = require('express');
const http = require('http');
const https = require('https');
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
const ADMIN_PIN = process.env.ADMIN_PIN || process.env.admin || 'xbox360.ñ.';

// Middleware de archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Health check para keep-alive / UptimeRobot / Googlebot
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('pong'));

// ==================== ESTADO DEL SERVIDOR EN MEMORIA ====================

// 1. Salas fijas temáticas (+18)
const fixedRooms = {
  'suite-1': { id: 'suite-1', name: 'Suite 1 · Parejas', tag: 'parejas', users: [], admins: [], maxUsers: 2 },
  'suite-2': { id: 'suite-2', name: 'Suite 2 · Show Privado', tag: 'solo', users: [], admins: [], maxUsers: 2 },
  'suite-3': { id: 'suite-3', name: 'Suite 3 · Fetish & Kink', tag: 'fetish', users: [], admins: [], maxUsers: 2 }
};

// 2. Salas dinámicas de parejas 1v1 estilo Omegle
// { [roomId]: { id, users: [socketId1, socketId2], tag, createdAt, admins: [] } }
const dynamicRooms = {};

// 3. Cola de emparejamiento automático
// Array de: { socketId, socket, tag, joinedAt }
let matchmakingQueue = [];

// Generador de IDs únicos para salas dinámicas
function generateRoomId() {
  return 'pair_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
}

// Resumen del estado para el Lobby y Administrador
function getSystemStats() {
  const activePairCount = Object.keys(dynamicRooms).length;
  let fixedUsersCount = 0;
  for (const r of Object.values(fixedRooms)) {
    fixedUsersCount += r.users.length;
  }
  const totalInCall = (activePairCount * 2) + fixedUsersCount;

  return {
    fixedRooms: Object.values(fixedRooms).map(r => ({
      id: r.id,
      name: r.name,
      tag: r.tag,
      userCount: r.users.length,
      maxUsers: r.maxUsers,
      isFull: r.users.length >= r.maxUsers,
      adminCount: r.admins.length
    })),
    queueCount: matchmakingQueue.length,
    activePairCount,
    totalInCall,
    totalConnected: io.engine.clientsCount
  };
}

function broadcastSystemStats() {
  io.emit('stats-update', getSystemStats());
}

// ==================== LÓGICA DE MATCHMAKING (ESTILO OMEGLE + PRIORIDAD MUJER ↔ HOMBRE) ====================

function isTagCompatible(tagA, tagB) {
  return tagA === 'general' || tagB === 'general' || tagA === tagB;
}

function isStrictHetero(a, b) {
  return (a.gender === 'hombre' && b.gender === 'mujer') || (a.gender === 'mujer' && b.gender === 'hombre');
}

function isGenderCompatible(a, b) {
  const aWantsB = a.lookingFor === 'todos' || a.lookingFor === b.gender;
  const bWantsA = b.lookingFor === 'todos' || b.lookingFor === a.gender;
  return aWantsB && bWantsA;
}

function processMatchmaking() {
  // Limpiar posibles sockets desconectados en la cola
  matchmakingQueue = matchmakingQueue.filter(item => {
    const s = io.sockets.sockets.get(item.socketId);
    return s && s.connected;
  });

  if (matchmakingQueue.length < 2) return;

  const now = Date.now();

  // FASE 1 (MÁXIMA PRIORIDAD): Mujer ↔ Hombre con Categoría Erótica Compatible
  for (let i = 0; i < matchmakingQueue.length - 1; i++) {
    const candidateA = matchmakingQueue[i];

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const candidateB = matchmakingQueue[j];

      if (isStrictHetero(candidateA, candidateB) && isTagCompatible(candidateA.tag, candidateB.tag)) {
        matchmakingQueue.splice(j, 1);
        matchmakingQueue.splice(i, 1);
        createDynamicPair(candidateA, candidateB, candidateA.tag || 'general');
        return processMatchmaking();
      }
    }
  }

  // FASE 2: Mujer ↔ Hombre con cualquier categoría (si llevan más de 2 segundos esperando)
  for (let i = 0; i < matchmakingQueue.length - 1; i++) {
    const candidateA = matchmakingQueue[i];

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const candidateB = matchmakingQueue[j];

      if (isStrictHetero(candidateA, candidateB) && ((now - candidateA.joinedAt > 2000) || (now - candidateB.joinedAt > 2000))) {
        matchmakingQueue.splice(j, 1);
        matchmakingQueue.splice(i, 1);
        createDynamicPair(candidateA, candidateB, 'general');
        return processMatchmaking();
      }
    }
  }

  // FASE 3: Preferencia de búsqueda mutua respetada (ej. si alguno eligió 'todos') y etiqueta compatible
  for (let i = 0; i < matchmakingQueue.length - 1; i++) {
    const candidateA = matchmakingQueue[i];

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const candidateB = matchmakingQueue[j];

      if (isGenderCompatible(candidateA, candidateB) && isTagCompatible(candidateA.tag, candidateB.tag)) {
        matchmakingQueue.splice(j, 1);
        matchmakingQueue.splice(i, 1);
        createDynamicPair(candidateA, candidateB, candidateA.tag || 'general');
        return processMatchmaking();
      }
    }
  }

  // FASE 4: Timeout de fluidez (más de 5.5s esperando): emparejar para que los usuarios no queden en espera infinita
  for (let i = 0; i < matchmakingQueue.length - 1; i++) {
    const candidateA = matchmakingQueue[i];

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const candidateB = matchmakingQueue[j];

      if ((now - candidateA.joinedAt > 5500) || (now - candidateB.joinedAt > 5500)) {
        matchmakingQueue.splice(j, 1);
        matchmakingQueue.splice(i, 1);
        createDynamicPair(candidateA, candidateB, 'general');
        return processMatchmaking();
      }
    }
  }
}

function createDynamicPair(candidateA, candidateB, tag) {
  const socketA = candidateA.socket;
  const socketB = candidateB.socket;
  if (!socketA.connected || !socketB.connected) return;

  const roomId = generateRoomId();

  dynamicRooms[roomId] = {
    id: roomId,
    users: [socketA.id, socketB.id],
    tag,
    genderA: candidateA.gender,
    genderB: candidateB.gender,
    createdAt: Date.now(),
    admins: []
  };

  socketA.join(roomId);
  socketB.join(roomId);

  socketA.data.currentRoom = roomId;
  socketA.data.isDynamic = true;

  socketB.data.currentRoom = roomId;
  socketB.data.isDynamic = true;

  console.log(`🔥 [Matchmaker] Pareja formada en ${roomId}: [${candidateA.gender.toUpperCase()}] ${socketA.id} <-> [${candidateB.gender.toUpperCase()}] ${socketB.id} [Tag: ${tag}]`);

  // SocketA actúa como iniciador de WebRTC (Caller), SocketB como receptor (Answerer)
  socketA.emit('match-found', {
    roomId,
    partnerId: socketB.id,
    isInitiator: true,
    tag,
    myGender: candidateA.gender,
    partnerGender: candidateB.gender
  });

  socketB.emit('match-found', {
    roomId,
    partnerId: socketA.id,
    isInitiator: false,
    tag,
    myGender: candidateB.gender,
    partnerGender: candidateA.gender
  });

  broadcastSystemStats();
}

// ==================== EVENTOS SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log(`🟢 [Conexión] Cliente conectado: ${socket.id}`);

  // Enviar estadísticas iniciales
  socket.emit('stats-update', getSystemStats());

  // 1. Verificación de Administrador
  socket.on('verify-admin', (pin, callback) => {
    const isValid = String(pin).trim() === String(ADMIN_PIN).trim();
    if (typeof callback === 'function') {
      callback({ success: isValid });
    }
  });

  // 2. Pedir emparejamiento automático (Omegle Matchmaker con Género)
  socket.on('find-match', ({ tag = 'general', gender = 'hombre', lookingFor }) => {
    leaveCurrentRoomOrQueue(socket);

    const safeGender = (gender === 'mujer') ? 'mujer' : 'hombre';
    const safeLookingFor = lookingFor || (safeGender === 'mujer' ? 'hombre' : 'mujer');

    matchmakingQueue.push({
      socketId: socket.id,
      socket,
      tag: tag || 'general',
      gender: safeGender,
      lookingFor: safeLookingFor,
      joinedAt: Date.now()
    });

    socket.emit('searching-match', { tag, gender: safeGender, lookingFor: safeLookingFor });
    broadcastSystemStats();

    // Procesar emparejamiento inmediatamente
    setTimeout(processMatchmaking, 100);
  });

  // 3. Saltar a la siguiente persona (Botón "Next / Próximo" de Omegle)
  socket.on('next-match', ({ tag = 'general', gender = 'hombre', lookingFor }) => {
    leaveCurrentRoomOrQueue(socket, 'skipped');

    const safeGender = (gender === 'mujer') ? 'mujer' : 'hombre';
    const safeLookingFor = lookingFor || (safeGender === 'mujer' ? 'hombre' : 'mujer');

    matchmakingQueue.push({
      socketId: socket.id,
      socket,
      tag: tag || 'general',
      gender: safeGender,
      lookingFor: safeLookingFor,
      joinedAt: Date.now()
    });

    socket.emit('searching-match', { tag, gender: safeGender, lookingFor: safeLookingFor });
    broadcastSystemStats();
    setTimeout(processMatchmaking, 100);
  });

  // 4. Detener búsqueda o salir
  socket.on('stop-matching', () => {
    leaveCurrentRoomOrQueue(socket);
    socket.emit('match-stopped');
    broadcastSystemStats();
  });

  // 5. Unirse a una Suite fija
  socket.on('join-fixed-room', ({ roomId, isAdmin }, callback) => {
    leaveCurrentRoomOrQueue(socket);

    const room = fixedRooms[roomId];
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Suite no válida' });
      return;
    }

    if (!isAdmin && room.users.length >= room.maxUsers) {
      if (typeof callback === 'function') callback({ success: false, message: 'Suite ocupada (máximo 2 personas)' });
      return;
    }

    socket.join(roomId);
    socket.data.currentRoom = roomId;
    socket.data.isDynamic = false;
    socket.data.isAdmin = !!isAdmin;

    if (isAdmin) {
      if (!room.admins.includes(socket.id)) room.admins.push(socket.id);
    } else {
      if (!room.users.includes(socket.id)) room.users.push(socket.id);
    }

    const existingUsers = room.users.filter(id => id !== socket.id);
    const existingAdmins = room.admins.filter(id => id !== socket.id);

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        isAdmin: !!isAdmin,
        peers: isAdmin ? existingUsers : [...existingUsers, ...existingAdmins],
        hasAdmin: room.admins.length > 0
      });
    }

    socket.to(roomId).emit('peer-joined', { peerId: socket.id, isAdmin: !!isAdmin });

    if (isAdmin) {
      io.to(roomId).emit('moderation-status', { active: true, count: room.admins.length });
    }

    broadcastSystemStats();
  });

  // 6. Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on('signal', ({ targetId, signalData }) => {
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      isAdmin: !!socket.data.isAdmin,
      signalData
    });
  });

  // 7. Mensajes de Chat en vivo en sala
  socket.on('send-chat', ({ roomId, message, senderName }) => {
    const safeMsg = String(message || '').trim().slice(0, 500);
    if (!safeMsg) return;

    const targetRoom = roomId || socket.data.currentRoom;
    if (!targetRoom) return;

    io.to(targetRoom).emit('new-chat', {
      senderId: socket.id,
      senderName: senderName || (socket.data.isAdmin ? '🛡️ Moderador' : 'Tú'),
      message: safeMsg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAdmin: !!socket.data.isAdmin
    });
  });

  // 8. Supervisión de Administrador: listar salas dinámicas
  socket.on('get-admin-rooms', (callback) => {
    if (!socket.data.isAdmin) return;
    const allRooms = [];
    
    // Fijas
    for (const [id, r] of Object.entries(fixedRooms)) {
      allRooms.push({ id, name: r.name, type: 'fija', userCount: r.users.length, admins: r.admins.length });
    }
    // Dinámicas
    for (const [id, r] of Object.entries(dynamicRooms)) {
      allRooms.push({
        id,
        name: `Match 1v1 (${r.tag})`,
        type: 'dinámica',
        userCount: r.users.length,
        durationSec: Math.floor((Date.now() - r.createdAt) / 1000),
        admins: r.admins.length
      });
    }

    if (typeof callback === 'function') callback(allRooms);
  });

  // 9. Administrador: Unirse a supervisar cualquier sala dinámica
  socket.on('admin-join-room', (targetRoomId) => {
    if (!socket.data.isAdmin) return;
    socket.join(targetRoomId);
    socket.data.currentRoom = targetRoomId;

    const dyn = dynamicRooms[targetRoomId];
    if (dyn) {
      if (!dyn.admins.includes(socket.id)) dyn.admins.push(socket.id);
      socket.emit('admin-room-synced', {
        roomId: targetRoomId,
        peers: dyn.users
      });
    }
  });

  // 10. Expulsar usuario (KICK por moderador)
  socket.on('kick-user', ({ targetId, roomId }) => {
    if (!socket.data.isAdmin) return;
    io.to(targetId).emit('kicked', { reason: 'Has sido expulsado por el moderador por incumplimiento de normas.' });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      leaveCurrentRoomOrQueue(targetSocket);
    }
  });

  // 11. Desconexión o salida
  socket.on('leave-room', () => {
    leaveCurrentRoomOrQueue(socket);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoomOrQueue(socket);
  });

  function leaveCurrentRoomOrQueue(s, reason = 'left') {
    // 1. Quitar de la cola si estaba esperando
    matchmakingQueue = matchmakingQueue.filter(item => item.socketId !== s.id);

    const roomId = s.data.currentRoom;
    if (!roomId) return;

    // 2. Si era sala dinámica 1v1
    if (dynamicRooms[roomId]) {
      const room = dynamicRooms[roomId];
      const partnerId = room.users.find(id => id !== s.id);

      s.leave(roomId);
      s.data.currentRoom = null;

      // Avisar a la otra persona que su pareja se desconectó o saltó
      if (partnerId) {
        io.to(partnerId).emit('partner-disconnected', {
          reason: reason === 'skipped' ? 'Tu pareja ha pasado a otra persona.' : 'Tu pareja se ha desconectado.'
        });
      }

      delete dynamicRooms[roomId];
      console.log(`💨 [Matchmaker] Sala dinámica ${roomId} cerrada.`);
    }

    // 3. Si era sala fija
    if (fixedRooms[roomId]) {
      const room = fixedRooms[roomId];
      const wasAdmin = s.data.isAdmin;

      room.users = room.users.filter(id => id !== s.id);
      room.admins = room.admins.filter(id => id !== s.id);

      s.leave(roomId);
      s.data.currentRoom = null;

      io.to(roomId).emit('peer-left', { peerId: s.id, isAdmin: wasAdmin });

      if (wasAdmin) {
        io.to(roomId).emit('moderation-status', {
          active: room.admins.length > 0,
          count: room.admins.length
        });
      }
    }

    broadcastSystemStats();
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🔥 Servidor Matchgle 1v1 (Omegle Engine) en http://localhost:${PORT}`);
  console.log(`🛡️ Panel de Moderación y Relay TURN activo`);
  console.log(`===============================================`);

  // ==================== AUTO-PING KEEP-ALIVE (RENDER) ====================
  // Evita que Render duerma el servidor tras 15 minutos de inactividad
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://matchgle1v1.onrender.com';
  const PING_INTERVAL_MS = 14 * 60 * 1000; // Cada 14 minutos

  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    console.log(`⏱️ Keep-Alive activado hacia: ${RENDER_EXTERNAL_URL}/ping (cada 14m)`);
    setInterval(() => {
      https.get(`${RENDER_EXTERNAL_URL}/ping`, (res) => {
        console.log(`💓 [Keep-Alive] Ping enviado. Estado: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error(`⚠️ [Keep-Alive] Error al hacer ping:`, err.message);
      });
    }, PING_INTERVAL_MS);
  }
});

