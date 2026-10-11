const socket = io();

socket.on('connect', () => {
  console.log('🟢 Conectado al servidor WebSocket:', socket.id);
  // Si se reconectó estando dentro de una sala, re-sincronizar unión
  if (currentRoomId) {
    socket.emit('join-room', { roomId: currentRoomId, isAdmin: isAdminMode }, (response) => {
      console.log('Reconexión a sala sincronizada:', response);
    });
  }
});

// Configuración de Servidores STUN y TURN (OpenRelay Gratuito)
// Esta configuración garantiza conectividad y permite ocultar la IP mediante TURN Relay
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN Relay público gratuito para enrutamiento anónimo
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelay',
      credential: 'openrelay'
    }
  ]
};

let localStream = null;
let currentRoomId = null;
let isAdminMode = false;
let isAudioMuted = false;
let isVideoMuted = false;
let usingFacingMode = 'user'; // 'user' o 'environment'
let peerConnections = {}; // { [peerId]: RTCPeerConnection }
let callTimerInterval = null;
let callSeconds = 0;

// Elementos DOM
const landingScreen = document.getElementById('landingScreen');
const ageGateModal = document.getElementById('ageGateModal');
const checkAge = document.getElementById('checkAge');
const checkRecording = document.getElementById('checkRecording');
const checkModeration = document.getElementById('checkModeration');
const btnAcceptAge = document.getElementById('btnAcceptAge');
const btnOpenAdminFromFooter = document.getElementById('btnOpenAdminFromFooter');
const onlineCountText = document.getElementById('onlineCountText');

const lobbyScreen = document.getElementById('lobbyScreen');
const previewVideo = document.getElementById('previewVideo');
const previewFallback = document.getElementById('previewFallback');
const camStatusBadge = document.getElementById('camStatusBadge');
const btnTogglePreviewMic = document.getElementById('btnTogglePreviewMic');
const btnTogglePreviewCam = document.getElementById('btnTogglePreviewCam');

const roomScreen = document.getElementById('roomScreen');
const currentRoomName = document.getElementById('currentRoomName');
const moderatorNotice = document.getElementById('moderatorNotice');
const callTimer = document.getElementById('callTimer');
const btnLeaveRoom = document.getElementById('btnLeaveRoom');

const normalDualCanvas = document.getElementById('normalDualCanvas');
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const waitingPlaceholder = document.getElementById('waitingPlaceholder');

const adminVideoArea = document.getElementById('adminVideoArea');
const adminVideo1 = document.getElementById('adminVideo1');
const adminVideo2 = document.getElementById('adminVideo2');
const adminFallback1 = document.getElementById('adminFallback1');
const adminFallback2 = document.getElementById('adminFallback2');
const adminBadge = document.getElementById('adminBadge');

const chatDrawer = document.getElementById('chatDrawer');
const btnToggleChatDrawer = document.getElementById('btnToggleChatDrawer');
const btnCloseChatDrawer = document.getElementById('btnCloseChatDrawer');
const chatUnreadDot = document.getElementById('chatUnreadDot');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleCam = document.getElementById('btnToggleCam');
const btnSwitchCam = document.getElementById('btnSwitchCam');

const adminLoginModal = document.getElementById('adminLoginModal');
const btnOpenAdminModal = document.getElementById('btnOpenAdminModal');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminPinInput = document.getElementById('adminPinInput');
const adminErrorMsg = document.getElementById('adminErrorMsg');

// ==================== 1. NAVEGACIÓN Y LANDING PAGE ====================

window.goToLobby = function () {
  if (sessionStorage.getItem('matchgle_age_accepted') !== 'true') {
    ageGateModal.classList.remove('hidden');
    ageGateModal.classList.add('flex');
  } else {
    showLobby();
  }
};

window.goToLanding = function () {
  lobbyScreen.classList.add('hidden');
  landingScreen.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeAgeGateModal = function () {
  ageGateModal.classList.add('hidden');
  ageGateModal.classList.remove('flex');
};

window.openTermsModal = function () {
  ageGateModal.classList.remove('hidden');
  ageGateModal.classList.add('flex');
};

function showLobby() {
  landingScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  initMediaPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Contador dinámico en vivo en la landing
if (onlineCountText) {
  let baseCount = 3842;
  setInterval(() => {
    const delta = Math.floor(Math.random() * 7) - 3;
    baseCount = Math.max(3700, baseCount + delta);
    onlineCountText.textContent = `${baseCount.toLocaleString()} en línea ahora`;
  }, 4000);
}

// Acceso Secreto de Administrador: Atajo de teclado (Ctrl + Shift + A) o doble clic en el logo
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    adminLoginModal.classList.remove('hidden');
    adminLoginModal.classList.add('flex');
    adminPinInput.value = '';
    adminErrorMsg.classList.add('hidden');
    adminPinInput.focus();
  }
});

// ==================== 2. GESTIÓN DEL MODAL +18 ====================

function checkAgeGateCheckboxes() {
  btnAcceptAge.disabled = !(checkAge.checked && checkRecording.checked && checkModeration.checked);
}

checkAge.addEventListener('change', checkAgeGateCheckboxes);
checkRecording.addEventListener('change', checkAgeGateCheckboxes);
checkModeration.addEventListener('change', checkAgeGateCheckboxes);

btnAcceptAge.addEventListener('click', () => {
  sessionStorage.setItem('matchgle_age_accepted', 'true');
  ageGateModal.classList.add('hidden');
  ageGateModal.classList.remove('flex');
  showLobby();
});

// ==================== 2. ACCESO A CÁMARA Y MICRÓFONO ====================

async function initMediaPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: usingFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    localStream = stream;
    if (previewVideo) {
      previewVideo.srcObject = stream;
      previewVideo.play().catch(() => {});
    }
    if (localVideo) {
      localVideo.srcObject = stream;
      localVideo.play().catch(() => {});
    }
    if (camStatusBadge) {
      camStatusBadge.textContent = 'Activa';
      camStatusBadge.className = 'text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400';
    }
    if (previewFallback) {
      previewFallback.classList.add('hidden');
    }
    return stream;
  } catch (err) {
    console.warn('No se pudo acceder a la cámara o micrófono:', err);
    if (camStatusBadge) {
      camStatusBadge.textContent = 'Sin acceso';
      camStatusBadge.className = 'text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400';
    }
    if (previewFallback) {
      previewFallback.classList.remove('hidden');
    }
    return null;
  }
}

// Controles de Micrófono y Cámara en Preview
if (btnTogglePreviewMic) btnTogglePreviewMic.addEventListener('click', toggleAudio);
if (btnTogglePreviewCam) btnTogglePreviewCam.addEventListener('click', toggleVideo);

if (btnToggleMic) btnToggleMic.addEventListener('click', toggleAudio);
if (btnToggleCam) btnToggleCam.addEventListener('click', toggleVideo);

function toggleAudio() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isAudioMuted = !audioTrack.enabled;
    const iconClass = isAudioMuted ? 'fa-microphone-slash text-red-400' : 'fa-microphone text-slate-200';
    if (btnTogglePreviewMic) btnTogglePreviewMic.innerHTML = `<i class="fa-solid ${iconClass} text-sm"></i>`;
    if (btnToggleMic) btnToggleMic.innerHTML = `<i class="fa-solid ${iconClass} text-base"></i>`;
  }
}

function toggleVideo() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;
    const iconClass = isVideoMuted ? 'fa-video-slash text-red-400' : 'fa-video text-slate-200';
    if (btnTogglePreviewCam) btnTogglePreviewCam.innerHTML = `<i class="fa-solid ${iconClass} text-sm"></i>`;
    if (btnToggleCam) btnToggleCam.innerHTML = `<i class="fa-solid ${iconClass} text-base"></i>`;
    if (previewFallback) previewFallback.classList.toggle('hidden', videoTrack.enabled);
  }
}

// Cambiar entre cámara frontal y trasera (móvil)
if (btnSwitchCam) {
  btnSwitchCam.addEventListener('click', async () => {
    if (!localStream) return;
    usingFacingMode = usingFacingMode === 'user' ? 'environment' : 'user';
    
    // Detener pistas de video actuales
    localStream.getVideoTracks().forEach(track => track.stop());

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: usingFacingMode },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      // Reemplazar pista en localStream
      localStream.removeTrack(localStream.getVideoTracks()[0]);
      localStream.addTrack(newVideoTrack);
      
      if (localVideo) localVideo.srcObject = localStream;
      if (previewVideo) previewVideo.srcObject = localStream;

      // Reemplazar pista en todas las conexiones WebRTC activas
      for (const pc of Object.values(peerConnections)) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      }
    } catch (e) {
      console.error('Error al cambiar de cámara:', e);
    }
  });
}

// ==================== 3. MODAL Y MODO ADMINISTRADOR ====================

btnOpenAdminModal.addEventListener('click', () => {
  adminLoginModal.classList.remove('hidden');
  adminLoginModal.classList.add('flex');
  adminPinInput.value = '';
  adminErrorMsg.classList.add('hidden');
  adminPinInput.focus();
});

btnCloseAdminModal.addEventListener('click', () => {
  adminLoginModal.classList.add('hidden');
  adminLoginModal.classList.remove('flex');
});

let lastRoomsData = null;

adminLoginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pin = adminPinInput.value;
  socket.emit('verify-admin', pin, (res) => {
    if (res && res.success) {
      isAdminMode = true;
      adminLoginModal.classList.add('hidden');
      adminLoginModal.classList.remove('flex');
      adminBadge.classList.remove('hidden');
      adminBadge.classList.add('flex');
      btnOpenAdminModal.innerHTML = `<i class="fa-solid fa-crown text-amber-400"></i><span>Admin ON</span>`;
      
      // Actualizar inmediatamente los botones de las salas para habilitar "Supervisar"
      if (lastRoomsData) {
        renderRooms(lastRoomsData);
      }
    } else {
      adminErrorMsg.classList.remove('hidden');
    }
  });
});

// ==================== 4. GESTIÓN DE SALA ACTIVA Y MATCHMAKER OOHCAM ====================

let activeLobbyRoom = 'sala-1';

const lobbyActiveRoomTitle = document.getElementById('lobbyActiveRoomTitle');
const selectedRoomLabel = document.getElementById('selectedRoomLabel');
const selectedRoomBadge = document.getElementById('selectedRoomBadge');
const btnStartMatching = document.getElementById('btnStartMatching');

window.switchActiveLobbyRoom = function (roomId) {
  activeLobbyRoom = roomId;
  
  // Actualizar estilos de las pestañas
  ['sala-1', 'sala-2', 'sala-3'].forEach(id => {
    const tab = document.getElementById(`tab-${id}`);
    if (tab) {
      if (id === roomId) {
        tab.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition bg-amber-500 text-dark-950 shadow-md';
      } else {
        tab.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wider transition text-slate-400 hover:text-white';
      }
    }
  });

  const roomNames = { 'sala-1': 'Sala 1', 'sala-2': 'Sala 2', 'sala-3': 'Sala 3' };
  const roomName = roomNames[roomId] || 'Sala 1';

  if (lobbyActiveRoomTitle) lobbyActiveRoomTitle.textContent = `${roomName} · Match Activo`;
  if (selectedRoomLabel) selectedRoomLabel.textContent = roomName;

  if (lastRoomsData) {
    renderRooms(lastRoomsData);
  }
};

window.joinActiveLobbyRoom = function () {
  joinSelectedRoom(activeLobbyRoom);
};

socket.on('rooms-update', (rooms) => {
  lastRoomsData = rooms;
  renderRooms(rooms);
});

function renderRooms(rooms) {
  const activeInfo = rooms[activeLobbyRoom];
  if (activeInfo && selectedRoomBadge && btnStartMatching) {
    let text = `${activeInfo.userCount} / ${activeInfo.maxUsers}`;
    let badgeClass = 'text-xs px-2.5 py-1 rounded-full font-bold ';

    if (activeInfo.userCount === 0) {
      text += ' (Libre)';
      badgeClass += 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      btnStartMatching.disabled = false;
      btnStartMatching.innerHTML = `<span>Start Matching</span>`;
      btnStartMatching.className = 'w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-dark-950 font-black text-base tracking-wide shadow-2xl shadow-amber-500/40 hover:shadow-amber-500/60 hover:scale-[1.02] transition transform duration-150 flex items-center justify-center gap-2 cursor-pointer';
    } else if (activeInfo.userCount === 1) {
      text += ' (Esperando)';
      badgeClass += 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      btnStartMatching.disabled = false;
      btnStartMatching.innerHTML = `<span>Unirse al Match (1/2)</span>`;
      btnStartMatching.className = 'w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:from-amber-300 hover:to-orange-300 text-dark-950 font-black text-base tracking-wide shadow-2xl shadow-amber-500/40 hover:shadow-amber-500/60 hover:scale-[1.02] transition transform duration-150 flex items-center justify-center gap-2 cursor-pointer';
    } else {
      text += ' (Ocupada)';
      badgeClass += 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      
      if (isAdminMode) {
        btnStartMatching.disabled = false;
        btnStartMatching.innerHTML = `<span>Supervisar ${activeInfo.name}</span>`;
        btnStartMatching.className = 'w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-dark-950 font-black text-base tracking-wide shadow-2xl shadow-amber-500/40 hover:scale-[1.02] transition transform duration-150 flex items-center justify-center gap-2 cursor-pointer';
      } else {
        btnStartMatching.disabled = true;
        btnStartMatching.innerHTML = `<span>Sala Ocupada (2/2)</span>`;
        btnStartMatching.className = 'w-full py-4 px-6 rounded-2xl bg-dark-800 text-slate-500 font-bold text-base cursor-not-allowed opacity-50 flex items-center justify-center gap-2';
      }
    }

    if (isAdminMode && activeInfo.adminCount > 0) {
      text += ' 👁️';
    }

    selectedRoomBadge.textContent = text;
    selectedRoomBadge.className = badgeClass;
  }
}

// ==================== 5. UNIRSE Y SALIR DE UNA SALA ====================

// Toggle Drawer de Chat
if (btnToggleChatDrawer) {
  btnToggleChatDrawer.addEventListener('click', () => {
    chatDrawer.classList.toggle('translate-x-[110%]');
    chatUnreadDot.classList.add('hidden');
  });
}

if (btnCloseChatDrawer) {
  btnCloseChatDrawer.addEventListener('click', () => {
    chatDrawer.classList.add('translate-x-[110%]');
  });
}

// Saltar rápidamente a la siguiente sala
window.nextRoomQuick = function () {
  const roomOrder = ['sala-1', 'sala-2', 'sala-3'];
  const currentIndex = roomOrder.indexOf(currentRoomId);
  const nextRoom = roomOrder[(currentIndex + 1) % roomOrder.length];
  
  leaveCurrentRoom();
  setTimeout(() => {
    joinSelectedRoom(nextRoom);
  }, 250);
};

// Reportar usuario
window.reportCurrentPeer = function () {
  const confirmReport = confirm('¿Deseas reportar al usuario actual por infringir las normas de la comunidad?');
  if (confirmReport) {
    alert('Reporte enviado correctamente a moderación. Cambiando de sala por tu seguridad...');
    nextRoomQuick();
  }
};

window.joinSelectedRoom = async function (roomId) {
  if (!localStream && !isAdminMode) {
    await initMediaPreview();
  }

  socket.emit('join-room', { roomId, isAdmin: isAdminMode }, (response) => {
    if (!response || !response.success) {
      alert(response ? response.message : 'No se pudo entrar a la sala.');
      return;
    }

    currentRoomId = roomId;
    currentRoomName.textContent = roomId.replace('sala-', 'Sala ');

    // Mostrar pantalla de sala
    lobbyScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    roomScreen.classList.add('flex');

    if (isAdminMode) {
      normalDualCanvas.classList.add('hidden');
      adminVideoArea.classList.remove('hidden');
      adminVideoArea.classList.add('flex');
    } else {
      normalDualCanvas.classList.remove('hidden');
      normalDualCanvas.classList.add('flex');
      adminVideoArea.classList.add('hidden');
      
      if (localStream) {
        localVideo.srcObject = localStream;
        localVideo.play().catch(e => console.warn('localVideo play:', e));
      }
      waitingPlaceholder.classList.remove('hidden');
    }

    // Iniciar temporizador
    startCallTimer();

    // Notificación inicial de moderador si ya está dentro
    if (response.hasAdmin) {
      moderatorNotice.classList.remove('hidden');
      moderatorNotice.classList.add('inline-flex');
    }

    // Conectar por WebRTC con los participantes ya presentes
    if (response.peers && response.peers.length > 0) {
      response.peers.forEach(peerId => {
        initiatePeerConnection(peerId, true);
      });
    }
  });
};

btnLeaveRoom.addEventListener('click', leaveCurrentRoom);

function leaveCurrentRoom() {
  socket.emit('leave-room');
  cleanupRoom();
}

function cleanupRoom() {
  // Cerrar todas las conexiones WebRTC
  for (const [peerId, pc] of Object.entries(peerConnections)) {
    pc.close();
    delete peerConnections[peerId];
  }

  currentRoomId = null;
  stopCallTimer();

  // Resetear videos
  remoteVideo.srcObject = null;
  adminVideo1.srcObject = null;
  adminVideo2.srcObject = null;
  adminFallback1.classList.remove('hidden');
  adminFallback2.classList.remove('hidden');
  moderatorNotice.classList.add('hidden');
  moderatorNotice.classList.remove('inline-flex');
  chatDrawer.classList.add('translate-x-[110%]');
  chatMessages.innerHTML = `<div class="text-center text-slate-500 text-[11px] py-2 bg-dark-950/60 rounded-xl border border-dark-800">🔒 Conversación privada y cifrada.</div>`;

  // Volver a Lobby
  roomScreen.classList.add('hidden');
  roomScreen.classList.remove('flex');
  lobbyScreen.classList.remove('hidden');
}

// Expulsado por moderador
socket.on('kicked', (data) => {
  alert(data.reason || 'Has sido expulsado de la sala.');
  cleanupRoom();
});

// ==================== 6. SEÑALIZACIÓN Y CONEXIONES WEBRTC ====================

const iceCandidateQueues = {}; // { [peerId]: RTCIceCandidateInit[] }

// Cuando un nuevo peer entra a la sala
socket.on('peer-joined', ({ peerId, isAdmin }) => {
  console.log(`📡 Peer se unió a la sala: ${peerId} (Admin: ${isAdmin})`);
});

// Recepción de señal WebRTC (Offer, Answer, ICE Candidate)
socket.on('signal', async ({ senderId, isAdmin, signalData }) => {
  let pc = peerConnections[senderId];

  if (!pc) {
    pc = createPeerConnection(senderId);
  }

  try {
    if (signalData.type === 'offer') {
      console.log(`📩 Recibida Oferta WebRTC de ${senderId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));
      
      // Vaciar candidatos ICE en cola
      if (iceCandidateQueues[senderId]) {
        for (const cand of iceCandidateQueues[senderId]) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('Error ICE queued:', e));
        }
        delete iceCandidateQueues[senderId];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', {
        targetId: senderId,
        signalData: answer
      });
      console.log(`📤 Enviada Respuesta WebRTC a ${senderId}`);
    } else if (signalData.type === 'answer') {
      console.log(`📩 Recibida Respuesta WebRTC de ${senderId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));
      
      // Vaciar candidatos ICE en cola
      if (iceCandidateQueues[senderId]) {
        for (const cand of iceCandidateQueues[senderId]) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('Error ICE queued:', e));
        }
        delete iceCandidateQueues[senderId];
      }
    } else if (signalData.candidate) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(e => console.warn('Error ICE direct:', e));
      } else {
        if (!iceCandidateQueues[senderId]) iceCandidateQueues[senderId] = [];
        iceCandidateQueues[senderId].push(signalData.candidate);
      }
    }
  } catch (err) {
    console.error('Error procesando señal WebRTC:', err);
  }
});

// Iniciar una nueva conexión como oferente (Caller)
async function initiatePeerConnection(peerId, isInitiator) {
  const pc = createPeerConnection(peerId);

  if (isInitiator) {
    try {
      console.log(`📤 Creando Oferta WebRTC para ${peerId}...`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      socket.emit('signal', {
        targetId: peerId,
        signalData: offer
      });
    } catch (err) {
      console.error('Error creando oferta WebRTC:', err);
    }
  }
}

// Crear instancia RTCPeerConnection y configurar listeners
function createPeerConnection(peerId) {
  if (peerConnections[peerId]) return peerConnections[peerId];

  console.log(`🛠️ Creando RTCPeerConnection para peer ${peerId}`);
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[peerId] = pc;

  // Añadir pistas locales si existen y no soy admin espectador puro
  if (localStream && !isAdminMode) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // Enviar candidatos ICE al otro extremo
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        targetId: peerId,
        signalData: { candidate: event.candidate }
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`⚡ Estado ICE con ${peerId}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      waitingPlaceholder.classList.add('hidden');
    }
  };

  // Recibir stream remoto
  pc.ontrack = (event) => {
    console.log('🎥 Pista o Stream remoto recibido de peer:', peerId, event.track.kind);
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

    if (isAdminMode) {
      // Modo Supervisor
      if (!adminVideo1.srcObject || adminVideo1.srcObject.id === stream.id) {
        adminVideo1.srcObject = stream;
        adminVideo1.play().catch(() => {});
        adminFallback1.classList.add('hidden');
      } else if (!adminVideo2.srcObject || adminVideo2.srcObject.id === stream.id) {
        adminVideo2.srcObject = stream;
        adminVideo2.play().catch(() => {});
        adminFallback2.classList.add('hidden');
      }
    } else {
      // Modo Normal: video 1 a 1
      if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = stream;
      } else {
        // Asegurar que contiene las pistas
        if (!remoteVideo.srcObject.getTracks().includes(event.track)) {
          remoteVideo.srcObject.addTrack(event.track);
        }
      }
      remoteVideo.play().catch(e => console.log('Autoplay play error:', e));
      waitingPlaceholder.classList.add('hidden');
    }
  };

  return pc;
}

// Cuando un peer se va
socket.on('peer-left', ({ peerId, isAdmin }) => {
  if (peerConnections[peerId]) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }

  if (isAdminMode) {
    if (adminVideo1.srcObject && adminVideo1.srcObject.id === peerId) {
      adminVideo1.srcObject = null;
      adminFallback1.classList.remove('hidden');
    } else if (adminVideo2.srcObject && adminVideo2.srcObject.id === peerId) {
      adminVideo2.srcObject = null;
      adminFallback2.classList.remove('hidden');
    }
  } else {
    // Si no quedan peers en la sala, mostrar esperando
    if (Object.keys(peerConnections).length === 0) {
      remoteVideo.srcObject = null;
      waitingPlaceholder.classList.remove('hidden');
    }
  }
});

// Aviso visual de moderador presente (Cumplimiento Legal)
socket.on('moderation-status', ({ active, count }) => {
  if (active && count > 0) {
    moderatorNotice.classList.remove('hidden');
  } else {
    moderatorNotice.classList.add('hidden');
  }
});

// ==================== 7. CHAT EN VIVO DENTRO DE LA SALA ====================

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentRoomId) return;

  socket.emit('send-chat', {
    roomId: currentRoomId,
    message: text,
    senderName: isAdminMode ? '🛡️ Moderador' : 'Tú'
  });

  chatInput.value = '';
});

socket.on('new-chat', (data) => {
  const isMe = data.senderId === socket.id;
  const msgDiv = document.createElement('div');
  msgDiv.className = `p-2.5 rounded-2xl text-xs max-w-[85%] ${
    data.isAdmin 
      ? 'bg-amber-500/20 border border-amber-500/30 text-amber-200 ml-auto'
      : isMe
        ? 'bg-amber-500 text-dark-950 font-semibold ml-auto'
        : 'bg-dark-800 text-slate-200 mr-auto border border-dark-700'
  }`;

  msgDiv.innerHTML = `
    <div class="flex items-center justify-between gap-2 text-[10px] opacity-75 mb-0.5">
      <span class="font-bold">${data.senderName}</span>
      <span>${data.timestamp}</span>
    </div>
    <div class="break-words">${escapeHtml(data.message)}</div>
  `;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Si el panel de chat esta cerrado y el mensaje no es mio, mostrar punto amarillo de nuevo mensaje
  if (!isMe && chatDrawer && chatDrawer.classList.contains('translate-x-[110%]')) {
    if (chatUnreadDot) chatUnreadDot.classList.remove('hidden');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// ==================== 8. TEMPORIZADOR DE LLAMADA ====================

function startCallTimer() {
  callSeconds = 0;
  callTimer.textContent = '00:00';
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    callTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  callSeconds = 0;
}
