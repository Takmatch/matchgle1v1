const socket = io();

// Configuración de Servidores STUN y TURN (OpenRelay Gratuito)
// Esta configuración garantiza conectividad P2P y oculta la IP real de los usuarios
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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

// ==================== VARIABLES DE ESTADO ====================
let localStream = null;
let currentRoomId = null;
let currentPartnerId = null;
let isAdminMode = false;
let isAudioMuted = false;
let isVideoMuted = false;
let isPrivacyBlurActive = false;
let usingFacingMode = 'user';
let peerConnections = {}; // { [peerId]: RTCPeerConnection }
let iceCandidateQueues = {}; // { [peerId]: RTCIceCandidateInit[] }

let selectedTag = 'general';
let userGender = localStorage.getItem('matchgle_user_gender') || 'hombre'; // 'hombre' | 'mujer'
let userLookingFor = localStorage.getItem('matchgle_looking_for') || (userGender === 'mujer' ? 'hombre' : 'mujer'); // 'hombre' | 'mujer' | 'todos'
let currentLobbyMode = 'auto'; // 'auto' | 'suites'
let autoNextTimer = null;
let callTimerInterval = null;
let callSeconds = 0;

// ==================== ELEMENTOS DEL DOM ====================
const landingScreen = document.getElementById('landingScreen');
const ageGateModal = document.getElementById('ageGateModal');
const checkAge = document.getElementById('checkAge');
const checkRecording = document.getElementById('checkRecording');
const checkModeration = document.getElementById('checkModeration');
const btnAcceptAge = document.getElementById('btnAcceptAge');
const onlineCountText = document.getElementById('onlineCountText');

const lobbyScreen = document.getElementById('lobbyScreen');
const previewVideo = document.getElementById('previewVideo');
const previewFallback = document.getElementById('previewFallback');
const previewMaskBadge = document.getElementById('previewMaskBadge');
const previewBlurLabel = document.getElementById('previewBlurLabel');
const liveOnlineStats = document.getElementById('liveOnlineStats');
const btnTogglePreviewMic = document.getElementById('btnTogglePreviewMic');
const btnTogglePreviewCam = document.getElementById('btnTogglePreviewCam');
const tabModeAuto = document.getElementById('tabModeAuto');
const tabModeSuites = document.getElementById('tabModeSuites');
const panelAutoMatchControls = document.getElementById('panelAutoMatchControls');
const panelSuitesControls = document.getElementById('panelSuitesControls');
const selectedTagBadge = document.getElementById('selectedTagBadge');
const btnStartAutoMatch = document.getElementById('btnStartAutoMatch');

const btnGenderHombre = document.getElementById('btnGenderHombre');
const btnGenderMujer = document.getElementById('btnGenderMujer');
const btnLookMujer = document.getElementById('btnLookMujer');
const btnLookHombre = document.getElementById('btnLookHombre');
const btnLookTodos = document.getElementById('btnLookTodos');
const localGenderBadge = document.getElementById('localGenderBadge');
const remoteGenderBadge = document.getElementById('remoteGenderBadge');

const badgeSuite1 = document.getElementById('badgeSuite1');
const badgeSuite2 = document.getElementById('badgeSuite2');
const badgeSuite3 = document.getElementById('badgeSuite3');

const roomScreen = document.getElementById('roomScreen');
const currentRoomName = document.getElementById('currentRoomName');
const roomCategoryLabel = document.getElementById('roomCategoryLabel');
const moderatorNotice = document.getElementById('moderatorNotice');
const callTimer = document.getElementById('callTimer');

const normalDualCanvas = document.getElementById('normalDualCanvas');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localMaskIndicator = document.getElementById('localMaskIndicator');
const remotePeerLabel = document.getElementById('remotePeerLabel');
const waitingPlaceholder = document.getElementById('waitingPlaceholder');
const searchRadarTitle = document.getElementById('searchRadarTitle');
const searchRadarSubtitle = document.getElementById('searchRadarSubtitle');
const partnerSkippedOverlay = document.getElementById('partnerSkippedOverlay');
const partnerSkippedTitle = document.getElementById('partnerSkippedTitle');

const btnToggleBlur = document.getElementById('btnToggleBlur');
const btnToggleMic = document.getElementById('btnToggleMic');
const btnToggleCam = document.getElementById('btnToggleCam');
const btnSwitchCam = document.getElementById('btnSwitchCam');

const adminVideoArea = document.getElementById('adminVideoArea');
const adminVideo1 = document.getElementById('adminVideo1');
const adminVideo2 = document.getElementById('adminVideo2');
const adminFallback1 = document.getElementById('adminFallback1');
const adminFallback2 = document.getElementById('adminFallback2');
const adminBadge = document.getElementById('adminBadge');
const adminLoginModal = document.getElementById('adminLoginModal');
const btnOpenAdminModal = document.getElementById('btnOpenAdminModal');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminPinInput = document.getElementById('adminPinInput');
const adminErrorMsg = document.getElementById('adminErrorMsg');

const chatDrawer = document.getElementById('chatDrawer');
const btnToggleChatDrawer = document.getElementById('btnToggleChatDrawer');
const btnCloseChatDrawer = document.getElementById('btnCloseChatDrawer');
const chatUnreadDot = document.getElementById('chatUnreadDot');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

// ==================== 1. NAVEGACIÓN Y AGE GATE (+18) ====================

window.goToLobby = function () {
  if (sessionStorage.getItem('matchgle_age_accepted') !== 'true') {
    if (ageGateModal) {
      ageGateModal.classList.remove('hidden');
      ageGateModal.classList.add('flex');
    }
  } else {
    showLobby();
  }
};

window.goToLanding = function () {
  stopMatchingAndLeave();
  if (lobbyScreen) lobbyScreen.classList.add('hidden');
  if (landingScreen) landingScreen.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeAgeGateModal = function () {
  if (ageGateModal) {
    ageGateModal.classList.add('hidden');
    ageGateModal.classList.remove('flex');
  }
};

window.openTermsModal = function () {
  if (ageGateModal) {
    ageGateModal.classList.remove('hidden');
    ageGateModal.classList.add('flex');
  }
};

function showLobby() {
  if (landingScreen) landingScreen.classList.add('hidden');
  if (roomScreen) {
    roomScreen.classList.add('hidden');
    roomScreen.classList.remove('flex');
  }
  if (lobbyScreen) lobbyScreen.classList.remove('hidden');
  initMediaPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function checkAgeGateCheckboxes() {
  if (btnAcceptAge && checkAge && checkRecording && checkModeration) {
    btnAcceptAge.disabled = !(checkAge.checked && checkRecording.checked && checkModeration.checked);
  }
}

if (checkAge) checkAge.addEventListener('change', checkAgeGateCheckboxes);
if (checkRecording) checkRecording.addEventListener('change', checkAgeGateCheckboxes);
if (checkModeration) checkModeration.addEventListener('change', checkAgeGateCheckboxes);

if (btnAcceptAge) {
  btnAcceptAge.addEventListener('click', () => {
    sessionStorage.setItem('matchgle_age_accepted', 'true');
    closeAgeGateModal();
    showLobby();
  });
}

// Contador dinámico simulado en Landing & Lobby
if (onlineCountText) {
  let baseCount = 3842;
  setInterval(() => {
    const delta = Math.floor(Math.random() * 7) - 3;
    baseCount = Math.max(3700, baseCount + delta);
    onlineCountText.textContent = `${baseCount.toLocaleString()} en línea ahora`;
    if (liveOnlineStats) {
      liveOnlineStats.textContent = `${baseCount.toLocaleString()} en línea ahora`;
    }
  }, 4000);
}

// ==================== 2. ACCESO A DISPOSITIVOS & MÁSCARA (BLUR) ====================

async function initMediaPreview() {
  if (localStream) return localStream;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: usingFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
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
    if (previewFallback) previewFallback.classList.add('hidden');

    applyBlurVisuals();
    return stream;
  } catch (err) {
    console.warn('Cámara o micrófono no disponibles:', err);
    if (previewFallback) previewFallback.classList.remove('hidden');
    return null;
  }
}

// Máscara de Privacidad (Efecto Blur Profesional)
window.togglePrivacyBlur = function () {
  isPrivacyBlurActive = !isPrivacyBlurActive;
  applyBlurVisuals();
};

function applyBlurVisuals() {
  const elements = [previewVideo, localVideo].filter(Boolean);
  elements.forEach(el => {
    if (isPrivacyBlurActive) {
      el.classList.add('camera-blurred');
    } else {
      el.classList.remove('camera-blurred');
    }
  });

  if (previewMaskBadge) {
    previewMaskBadge.classList.toggle('hidden', !isPrivacyBlurActive);
  }
  if (localMaskIndicator) {
    localMaskIndicator.classList.toggle('hidden', !isPrivacyBlurActive);
  }
  if (previewBlurLabel) {
    previewBlurLabel.textContent = isPrivacyBlurActive ? 'Desactivar Máscara' : 'Activar Máscara (Blur)';
  }
  if (btnToggleBlur) {
    if (isPrivacyBlurActive) {
      btnToggleBlur.className = 'w-11 h-11 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition border border-purple-400 shadow-lg shadow-purple-500/30';
    } else {
      btnToggleBlur.className = 'w-11 h-11 rounded-full bg-dark-800 hover:bg-dark-700 text-slate-200 flex items-center justify-center transition border border-dark-600';
    }
  }
}

// Alternar Audio y Video
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
    const icon = isAudioMuted ? 'fa-microphone-slash text-red-400' : 'fa-microphone text-slate-200';
    if (btnTogglePreviewMic) btnTogglePreviewMic.innerHTML = `<i class="fa-solid ${icon} text-sm"></i>`;
    if (btnToggleMic) btnToggleMic.innerHTML = `<i class="fa-solid ${icon} text-sm"></i>`;
  }
}

function toggleVideo() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;
    const icon = isVideoMuted ? 'fa-video-slash text-red-400' : 'fa-video text-slate-200';
    if (btnTogglePreviewCam) btnTogglePreviewCam.innerHTML = `<i class="fa-solid ${icon} text-sm"></i>`;
    if (btnToggleCam) btnToggleCam.innerHTML = `<i class="fa-solid ${icon} text-sm"></i>`;
    if (previewFallback) previewFallback.classList.toggle('hidden', videoTrack.enabled);
  }
}

// Alternar entre cámara frontal y trasera en móvil
if (btnSwitchCam) {
  btnSwitchCam.addEventListener('click', async () => {
    if (!localStream) return;
    usingFacingMode = usingFacingMode === 'user' ? 'environment' : 'user';
    localStream.getVideoTracks().forEach(t => t.stop());

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: usingFacingMode },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      localStream.removeTrack(localStream.getVideoTracks()[0]);
      localStream.addTrack(newVideoTrack);

      if (localVideo) localVideo.srcObject = localStream;
      if (previewVideo) previewVideo.srcObject = localStream;

      for (const pc of Object.values(peerConnections)) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      }
    } catch (e) {
      console.error('Error al alternar cámara:', e);
    }
  });
}

// ==================== 3. CONFIGURACIÓN DEL LOBBY & SELECTORES ====================

window.setLobbyMode = function (mode) {
  currentLobbyMode = mode;
  if (mode === 'auto') {
    if (tabModeAuto) {
      tabModeAuto.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition bg-amber-500 text-dark-950 shadow-md flex items-center gap-1.5';
    }
    if (tabModeSuites) {
      tabModeSuites.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wider transition text-slate-400 hover:text-white flex items-center gap-1.5';
    }
    if (panelAutoMatchControls) panelAutoMatchControls.classList.remove('hidden');
    if (panelSuitesControls) panelSuitesControls.classList.add('hidden');
    if (btnStartAutoMatch) btnStartAutoMatch.classList.remove('hidden');
  } else {
    if (tabModeAuto) {
      tabModeAuto.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wider transition text-slate-400 hover:text-white flex items-center gap-1.5';
    }
    if (tabModeSuites) {
      tabModeSuites.className = 'px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider transition bg-amber-500 text-dark-950 shadow-md flex items-center gap-1.5';
    }
    if (panelAutoMatchControls) panelAutoMatchControls.classList.add('hidden');
    if (panelSuitesControls) panelSuitesControls.classList.remove('hidden');
    if (btnStartAutoMatch) btnStartAutoMatch.classList.add('hidden');
  }
};

window.selectInterestTag = function (tag) {
  selectedTag = tag;
  const tagLabels = {
    general: '#Todo +18',
    parejas: '#Parejas',
    solo: '#Show Solo',
    fetish: '#Fetish & Kink'
  };

  if (selectedTagBadge) {
    selectedTagBadge.textContent = tagLabels[tag] || `#${tag}`;
  }
  if (roomCategoryLabel) {
    roomCategoryLabel.textContent = tagLabels[tag] || `#${tag}`;
  }

  // Actualizar estilos de los botones de categoría
  document.querySelectorAll('.tag-selector').forEach(btn => {
    const btnTag = btn.getAttribute('data-tag');
    if (btnTag === tag) {
      btn.className = 'tag-selector p-3 rounded-2xl border border-amber-500 bg-amber-500/20 text-amber-300 text-left flex items-center gap-2.5 transition';
    } else {
      btn.className = 'tag-selector p-3 rounded-2xl border border-dark-700 bg-dark-950 text-slate-300 hover:border-dark-600 text-left flex items-center gap-2.5 transition';
    }
  });
};

// ==================== GESTIÓN DE GÉNERO Y PREFERENCIA HETERO ====================

window.setUserGender = function (gender) {
  userGender = (gender === 'mujer') ? 'mujer' : 'hombre';
  // Por defecto, emparejar con el sexo opuesto
  userLookingFor = (userGender === 'mujer') ? 'hombre' : 'mujer';

  localStorage.setItem('matchgle_user_gender', userGender);
  localStorage.setItem('matchgle_looking_for', userLookingFor);

  updateGenderUI();
};

window.setUserLookingFor = function (lookingFor) {
  userLookingFor = lookingFor;
  localStorage.setItem('matchgle_looking_for', userLookingFor);
  updateGenderUI();
};

function updateGenderUI() {
  // 1. Botones de "Soy"
  if (btnGenderHombre && btnGenderMujer) {
    if (userGender === 'hombre') {
      btnGenderHombre.className = 'py-2.5 px-3 rounded-xl border border-amber-500 bg-amber-500/20 text-amber-300 flex items-center justify-center gap-2 transition hover:scale-[1.02] shadow-sm';
      btnGenderMujer.className = 'py-2.5 px-3 rounded-xl border border-dark-700 bg-dark-900 text-slate-300 hover:border-dark-600 flex items-center justify-center gap-2 transition hover:scale-[1.02]';
    } else {
      btnGenderHombre.className = 'py-2.5 px-3 rounded-xl border border-dark-700 bg-dark-900 text-slate-300 hover:border-dark-600 flex items-center justify-center gap-2 transition hover:scale-[1.02]';
      btnGenderMujer.className = 'py-2.5 px-3 rounded-xl border border-rose-500 bg-rose-500/20 text-rose-300 flex items-center justify-center gap-2 transition hover:scale-[1.02] shadow-sm';
    }
  }

  // 2. Botones de "Busco"
  const lookBtns = [
    { el: btnLookMujer, val: 'mujer', activeClass: 'px-2.5 py-1 rounded-lg font-bold border border-rose-500/40 bg-rose-500/20 text-rose-300 text-[10px] transition' },
    { el: btnLookHombre, val: 'hombre', activeClass: 'px-2.5 py-1 rounded-lg font-bold border border-amber-500/40 bg-amber-500/20 text-amber-300 text-[10px] transition' },
    { el: btnLookTodos, val: 'todos', activeClass: 'px-2.5 py-1 rounded-lg font-bold border border-purple-500/40 bg-purple-500/20 text-purple-300 text-[10px] transition' }
  ];

  lookBtns.forEach(item => {
    if (item.el) {
      if (userLookingFor === item.val) {
        item.el.className = item.activeClass;
      } else {
        item.el.className = 'px-2.5 py-1 rounded-lg font-bold border border-dark-700 bg-dark-900 text-slate-400 hover:text-white text-[10px] transition';
      }
    }
  });

  // 3. Badge en la pantalla de cámara local
  if (localGenderBadge) {
    if (userGender === 'mujer') {
      localGenderBadge.textContent = '👩 Mujer';
      localGenderBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
    } else {
      localGenderBadge.textContent = '👨 Hombre';
      localGenderBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
    }
  }
}

// Inicializar la interfaz de género
updateGenderUI();

// ==================== 4. MOTOR DE EMPAREJAMIENTO AUTOMÁTICO (OMEGLE) ====================

// Iniciar búsqueda automática
window.startOmegleMatching = async function () {
  if (!localStream && !isAdminMode) {
    await initMediaPreview();
  }

  // Abrir pantalla de videochat
  if (lobbyScreen) lobbyScreen.classList.add('hidden');
  if (roomScreen) {
    roomScreen.classList.remove('hidden');
    roomScreen.classList.add('flex');
  }

  // Configurar pantalla dividida
  if (normalDualCanvas) {
    normalDualCanvas.classList.remove('hidden');
    normalDualCanvas.classList.add('flex');
  }
  if (adminVideoArea) adminVideoArea.classList.add('hidden');

  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
    localVideo.play().catch(() => {});
  }
  applyBlurVisuals();

  showRadarWaiting();
  startCallTimer();

  console.log(`🔥 Solicitando emparejamiento: [${userGender}] busca [${userLookingFor}] en tag: ${selectedTag}`);
  socket.emit('find-match', {
    tag: selectedTag,
    gender: userGender,
    lookingFor: userLookingFor
  });
};

// Pasar inmediatamente a la siguiente persona (ESC o botón Próximo)
window.skipToNextMatch = function () {
  clearTimeout(autoNextTimer);
  closeCurrentPeerConnection();

  if (partnerSkippedOverlay) partnerSkippedOverlay.classList.add('hidden');
  if (remoteGenderBadge) remoteGenderBadge.classList.add('hidden');
  showRadarWaiting();

  console.log(`⏩ Saltando a la siguiente pareja: [${userGender}] busca [${userLookingFor}] [Tag: ${selectedTag}]`);
  socket.emit('next-match', {
    tag: selectedTag,
    gender: userGender,
    lookingFor: userLookingFor
  });
};

// Detener búsqueda y salir al lobby
window.stopMatchingAndLeave = function () {
  clearTimeout(autoNextTimer);
  closeCurrentPeerConnection();
  socket.emit('stop-matching');

  currentRoomId = null;
  currentPartnerId = null;
  stopCallTimer();

  if (roomScreen) {
    roomScreen.classList.add('hidden');
    roomScreen.classList.remove('flex');
  }
  if (lobbyScreen) lobbyScreen.classList.remove('hidden');
  if (remoteGenderBadge) remoteGenderBadge.classList.add('hidden');

  if (chatDrawer) chatDrawer.classList.add('translate-x-[110%]');
  resetChatMessages();
};

function showRadarWaiting() {
  if (waitingPlaceholder) waitingPlaceholder.classList.remove('hidden');
  if (remoteVideo) remoteVideo.srcObject = null;
  if (remoteGenderBadge) remoteGenderBadge.classList.add('hidden');
  if (remotePeerLabel) remotePeerLabel.textContent = 'Buscando pareja...';
  if (searchRadarTitle) {
    const targetLabel = userLookingFor === 'mujer' ? 'una mujer' : userLookingFor === 'hombre' ? 'un hombre' : 'tu pareja';
    searchRadarTitle.textContent = `Buscando ${targetLabel}...`;
  }
  if (searchRadarSubtitle) {
    const tagDisplay = selectedTag === 'general' ? '+18 Sin filtros' : selectedTag.toUpperCase();
    searchRadarSubtitle.textContent = `Prioridad: Mujer ↔ Hombre · Categoría: ${tagDisplay}`;
  }
}

// Reproducir tono sutil de notificación al hacer match (Web Audio API nativo)
function playMatchChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Silencioso si el navegador restringe audio
  }
}

// Eventos de emparejamiento desde el Servidor
socket.on('searching-match', ({ tag, gender, lookingFor }) => {
  showRadarWaiting();
});

socket.on('match-found', async ({ roomId, partnerId, isInitiator, tag, myGender, partnerGender }) => {
  console.log(`🎉 ¡Match encontrado! Sala: ${roomId}, Pareja: ${partnerId}, Pareja Género: ${partnerGender}, Iniciador: ${isInitiator}`);
  clearTimeout(autoNextTimer);

  currentRoomId = roomId;
  currentPartnerId = partnerId;

  if (waitingPlaceholder) waitingPlaceholder.classList.add('hidden');
  if (partnerSkippedOverlay) partnerSkippedOverlay.classList.add('hidden');
  if (remotePeerLabel) remotePeerLabel.textContent = 'Desconocido';

  // Mostrar el género de la pareja emparejada
  if (remoteGenderBadge) {
    if (partnerGender === 'mujer') {
      remoteGenderBadge.textContent = '👩 Mujer';
      remoteGenderBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
      remoteGenderBadge.classList.remove('hidden');
    } else if (partnerGender === 'hombre') {
      remoteGenderBadge.textContent = '👨 Hombre';
      remoteGenderBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
      remoteGenderBadge.classList.remove('hidden');
    } else {
      remoteGenderBadge.classList.add('hidden');
    }
  }

  if (roomCategoryLabel) roomCategoryLabel.textContent = `#${tag.toUpperCase()}`;

  playMatchChime();

  // Iniciar la conexión WebRTC
  await initiatePeerConnection(partnerId, isInitiator);
});

socket.on('partner-disconnected', ({ reason }) => {
  console.log('⚠️ Pareja desconectada:', reason);
  closeCurrentPeerConnection();

  if (partnerSkippedOverlay) {
    partnerSkippedOverlay.classList.remove('hidden');
  }
  if (partnerSkippedTitle) {
    partnerSkippedTitle.textContent = reason || 'Tu pareja ha pasado';
  }

  // Salto automático después de 3 segundos
  clearTimeout(autoNextTimer);
  autoNextTimer = setTimeout(() => {
    skipToNextMatch();
  }, 3000);
});

// ==================== 5. SUITES FIJAS (+18) ====================

window.joinSelectedFixedRoom = async function (suiteId) {
  if (!localStream && !isAdminMode) {
    await initMediaPreview();
  }

  socket.emit('join-fixed-room', { roomId: suiteId, isAdmin: isAdminMode }, (response) => {
    if (!response || !response.success) {
      alert(response ? response.message : 'No se pudo ingresar a la suite.');
      return;
    }

    currentRoomId = suiteId;
    if (currentRoomName) currentRoomName.textContent = suiteId.toUpperCase();

    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (roomScreen) {
      roomScreen.classList.remove('hidden');
      roomScreen.classList.add('flex');
    }

    if (isAdminMode) {
      if (normalDualCanvas) normalDualCanvas.classList.add('hidden');
      if (adminVideoArea) {
        adminVideoArea.classList.remove('hidden');
        adminVideoArea.classList.add('flex');
      }
    } else {
      if (normalDualCanvas) {
        normalDualCanvas.classList.remove('hidden');
        normalDualCanvas.classList.add('flex');
      }
      if (adminVideoArea) adminVideoArea.classList.add('hidden');

      if (localVideo && localStream) {
        localVideo.srcObject = localStream;
        localVideo.play().catch(() => {});
      }
      if (waitingPlaceholder) waitingPlaceholder.classList.remove('hidden');
    }

    startCallTimer();

    // Conectar a los participantes existentes
    if (response.peers && response.peers.length > 0) {
      response.peers.forEach(peerId => {
        initiatePeerConnection(peerId, true);
      });
    }
  });
};

// Actualización del estado de las suites fijas
socket.on('stats-update', (stats) => {
  if (!stats) return;

  if (stats.fixedRooms) {
    stats.fixedRooms.forEach(room => {
      let badgeEl = null;
      if (room.id === 'suite-1') badgeEl = badgeSuite1;
      if (room.id === 'suite-2') badgeEl = badgeSuite2;
      if (room.id === 'suite-3') badgeEl = badgeSuite3;

      if (badgeEl) {
        if (room.userCount === 0) {
          badgeEl.textContent = 'Libre (0/2)';
          badgeEl.className = 'text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20';
        } else if (room.userCount === 1) {
          badgeEl.textContent = '1 esperando (1/2)';
          badgeEl.className = 'text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20';
        } else {
          badgeEl.textContent = 'Ocupada (2/2)';
          badgeEl.className = 'text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20';
        }
      }
    });
  }
});

// ==================== 6. SEÑALIZACIÓN & WEBRTC ====================

function closeCurrentPeerConnection() {
  for (const [peerId, pc] of Object.entries(peerConnections)) {
    try {
      pc.close();
    } catch (e) {}
    delete peerConnections[peerId];
  }
  iceCandidateQueues = {};

  if (remoteVideo) remoteVideo.srcObject = null;
  if (adminVideo1) adminVideo1.srcObject = null;
  if (adminVideo2) adminVideo2.srcObject = null;
}

function createPeerConnection(peerId) {
  if (peerConnections[peerId]) return peerConnections[peerId];

  console.log(`🛠️ Creando RTCPeerConnection para: ${peerId}`);
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[peerId] = pc;

  // Añadir pistas de video y audio si existen y no soy administrador
  if (localStream && !isAdminMode) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  // Enviar candidatos ICE
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
      if (waitingPlaceholder) waitingPlaceholder.classList.add('hidden');
    }
  };

  // Recibir stream remoto
  pc.ontrack = (event) => {
    console.log(`🎥 Pista recibida (${event.track.kind}) de: ${peerId}`);
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

    if (isAdminMode) {
      if (!adminVideo1.srcObject || adminVideo1.srcObject.id === stream.id) {
        adminVideo1.srcObject = stream;
        adminVideo1.play().catch(() => {});
        if (adminFallback1) adminFallback1.classList.add('hidden');
      } else if (!adminVideo2.srcObject || adminVideo2.srcObject.id === stream.id) {
        adminVideo2.srcObject = stream;
        adminVideo2.play().catch(() => {});
        if (adminFallback2) adminFallback2.classList.add('hidden');
      }
    } else {
      if (remoteVideo) {
        if (!remoteVideo.srcObject) {
          remoteVideo.srcObject = stream;
        } else if (!remoteVideo.srcObject.getTracks().includes(event.track)) {
          remoteVideo.srcObject.addTrack(event.track);
        }
        remoteVideo.play().catch(() => {});
      }
      if (waitingPlaceholder) waitingPlaceholder.classList.add('hidden');
    }
  };

  return pc;
}

async function initiatePeerConnection(peerId, isInitiator) {
  const pc = createPeerConnection(peerId);

  if (isInitiator) {
    try {
      console.log(`📤 Creando y enviando Oferta WebRTC para ${peerId}...`);
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
      console.error('Error al generar oferta WebRTC:', err);
    }
  }
}

// Receptor de señales WebRTC
socket.on('signal', async ({ senderId, signalData }) => {
  let pc = peerConnections[senderId];
  if (!pc) {
    pc = createPeerConnection(senderId);
  }

  try {
    if (signalData.type === 'offer') {
      console.log(`📩 Oferta WebRTC recibida de ${senderId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));

      // Drenar candidatos en cola
      if (iceCandidateQueues[senderId]) {
        for (const cand of iceCandidateQueues[senderId]) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        delete iceCandidateQueues[senderId];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', {
        targetId: senderId,
        signalData: answer
      });
    } else if (signalData.type === 'answer') {
      console.log(`📩 Respuesta WebRTC recibida de ${senderId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));

      if (iceCandidateQueues[senderId]) {
        for (const cand of iceCandidateQueues[senderId]) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        delete iceCandidateQueues[senderId];
      }
    } else if (signalData.candidate) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate)).catch(() => {});
      } else {
        if (!iceCandidateQueues[senderId]) iceCandidateQueues[senderId] = [];
        iceCandidateQueues[senderId].push(signalData.candidate);
      }
    }
  } catch (err) {
    console.error('Error procesando señal WebRTC:', err);
  }
});

// Cuando un peer abandona en salas fijas
socket.on('peer-left', ({ peerId }) => {
  if (peerConnections[peerId]) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }
  if (Object.keys(peerConnections).length === 0 && !isAdminMode) {
    if (remoteVideo) remoteVideo.srcObject = null;
    if (waitingPlaceholder) waitingPlaceholder.classList.remove('hidden');
  }
});

// Aviso de presencia de moderador
socket.on('moderation-status', ({ active, count }) => {
  if (moderatorNotice) {
    if (active && count > 0) {
      moderatorNotice.classList.remove('hidden');
      moderatorNotice.classList.add('inline-flex');
    } else {
      moderatorNotice.classList.add('hidden');
      moderatorNotice.classList.remove('inline-flex');
    }
  }
});

// ==================== 7. CHAT INTEGRADO EN SALA ====================

if (btnToggleChatDrawer) {
  btnToggleChatDrawer.addEventListener('click', () => {
    if (chatDrawer) {
      chatDrawer.classList.toggle('translate-x-[110%]');
      if (chatUnreadDot) chatUnreadDot.classList.add('hidden');
    }
  });
}

if (btnCloseChatDrawer) {
  btnCloseChatDrawer.addEventListener('click', () => {
    if (chatDrawer) chatDrawer.classList.add('translate-x-[110%]');
  });
}

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput ? chatInput.value.trim() : '';
    if (!text || !currentRoomId) return;

    socket.emit('send-chat', {
      roomId: currentRoomId,
      message: text,
      senderName: isAdminMode ? '🛡️ Moderador' : 'Tú'
    });

    if (chatInput) chatInput.value = '';
  });
}

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

  if (chatMessages) {
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Notificación de nuevo mensaje si el drawer está cerrado
  if (!isMe && chatDrawer && chatDrawer.classList.contains('translate-x-[110%]')) {
    if (chatUnreadDot) chatUnreadDot.classList.remove('hidden');
  }
});

function resetChatMessages() {
  if (chatMessages) {
    chatMessages.innerHTML = `<div class="text-center text-slate-500 text-[11px] py-2 bg-dark-950/60 rounded-xl border border-dark-800">🔒 Conversación privada y cifrada.</div>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// ==================== 8. REPORTES & SEGURIDAD ====================

window.reportCurrentPeer = function () {
  const confirmReport = confirm('¿Deseas reportar al usuario actual por conducta inapropiada o violación de términos?');
  if (confirmReport) {
    alert('Reporte enviado a nuestro equipo de moderación. Pasando a la siguiente pareja por tu seguridad...');
    skipToNextMatch();
  }
};

// ==================== 9. ATAJOS DE TECLADO (ESTILO OMEGLE) ====================

document.addEventListener('keydown', (e) => {
  // Ignorar atajos si el usuario está escribiendo en el chat o en el input del admin PIN
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') {
    return;
  }

  // Acceso Secreto Administrador: Ctrl + Shift + A
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    if (adminLoginModal) {
      adminLoginModal.classList.remove('hidden');
      adminLoginModal.classList.add('flex');
      if (adminPinInput) {
        adminPinInput.value = '';
        adminPinInput.focus();
      }
      if (adminErrorMsg) adminErrorMsg.classList.add('hidden');
    }
    return;
  }

  // Si estamos dentro de una llamada activa
  if (roomScreen && !roomScreen.classList.contains('hidden')) {
    // Tecla ESC o Barra Espaciadora: Siguiente Match (Next)
    if (e.key === 'Escape' || e.code === 'Space') {
      e.preventDefault();
      skipToNextMatch();
    }
    // Tecla B: Máscara / Blur
    else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      togglePrivacyBlur();
    }
    // Tecla M: Micrófono
    else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleAudio();
    }
    // Tecla V: Cámara
    else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      toggleVideo();
    }
  }
});

// ==================== 10. MODAL ADMINISTRADOR ====================

if (btnOpenAdminModal) {
  btnOpenAdminModal.addEventListener('click', () => {
    if (adminLoginModal) {
      adminLoginModal.classList.remove('hidden');
      adminLoginModal.classList.add('flex');
      if (adminPinInput) {
        adminPinInput.value = '';
        adminPinInput.focus();
      }
      if (adminErrorMsg) adminErrorMsg.classList.add('hidden');
    }
  });
}

if (btnCloseAdminModal) {
  btnCloseAdminModal.addEventListener('click', () => {
    if (adminLoginModal) {
      adminLoginModal.classList.add('hidden');
      adminLoginModal.classList.remove('flex');
    }
  });
}

if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = adminPinInput ? adminPinInput.value : '';
    socket.emit('verify-admin', pin, (res) => {
      if (res && res.success) {
        isAdminMode = true;
        if (adminLoginModal) {
          adminLoginModal.classList.add('hidden');
          adminLoginModal.classList.remove('flex');
        }
        if (adminBadge) {
          adminBadge.classList.remove('hidden');
          adminBadge.classList.add('flex');
        }
        if (btnOpenAdminModal) {
          btnOpenAdminModal.innerHTML = `<i class="fa-solid fa-crown text-amber-400"></i><span>Admin ON</span>`;
        }
        alert('Modo Administrador y Supervisión activado.');
      } else {
        if (adminErrorMsg) adminErrorMsg.classList.remove('hidden');
      }
    });
  });
}

// ==================== 11. TEMPORIZADOR DE LLAMADA ====================

function startCallTimer() {
  callSeconds = 0;
  if (callTimer) callTimer.textContent = '00:00';
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    if (callTimer) callTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  callSeconds = 0;
  if (callTimer) callTimer.textContent = '00:00';
}
