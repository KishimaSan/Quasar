const socket = io();
let currentUser = null;
let currentChat = null;
let pendingFile = null;
let newAvatarUrl = null;
let authMode = 'login';
let typingTimeout = null;
let currentChatData = null;
let onlineUsersList = []; 
let replyToMsg = null; 
let activeContextMsg = null; 
let currentPins = []; 
let currentPinIndex = 0; 

let cropImage = new Image();
let cropCtx = null;
let cropScale = 1;
let cropX = 0;
let cropY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let minScale = 1;
let touchStartX = 0;
let touchStartY = 0;

const loc = {
  dark: { dev: '[ДЬЯВОЛ]', apostle: '[АПОСТОЛ]', imp: 'ЧЕРТЯТА', online: 'В СЕТИ', sub: 'Демонический мессенджер' },
  classic: { dev: '[РАЗРАБОТЧИК]', apostle: '[АДМИН]', imp: 'ПОЛЬЗОВАТЕЛИ', online: 'В СЕТИ', sub: 'Мессенджер' },
  cosmic: { dev: '[КАПИТАН]', apostle: '[ИНЖЕНЕР]', imp: 'ПИЛОТЫ', online: 'НА СВЯЗИ', sub: 'Космический мессенджер' }
};

const monthsList = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// --- УПРАВЛЕНИЕ МОБИЛЬНЫМ МЕНЮ ---
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const btnOpen = document.getElementById('open-sidebar');
  const btnClose = document.getElementById('close-sidebar');

  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.add('open');
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.preventDefault();
      sidebar.classList.remove('open');
    });
  }

  // Закрываем меню при клике на пользователя
  const observer = new MutationObserver(() => {
    document.querySelectorAll('#sidebar li').forEach(li => {
      li.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      });
    });
  });
  observer.observe(sidebar, { childList: true, subtree: true });
});

function populateDateSelects() {
  const daySelect = document.getElementById('birth-day');
  const monthSelect = document.getElementById('birth-month');
  const yearSelect = document.getElementById('birth-year');
  
  daySelect.innerHTML = '<option value="">День</option>';
  for (let i = 1; i <= 31; i++) daySelect.innerHTML += `<option value="${i}">${i}</option>`;
  
  monthSelect.innerHTML = '<option value="">Месяц</option>';
  monthsList.forEach((m, i) => monthSelect.innerHTML += `<option value="${i+1}">${m}</option>`);
  
  yearSelect.innerHTML = '<option value="">Год</option>';
  const currentYear = new Date().getFullYear();
  for (let i = currentYear; i >= 1900; i--) yearSelect.innerHTML += `<option value="${i}">${i}</option>`;
}

function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-');
  if (parts.length !== 3) return null;
  const birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function getAgeWord(age) {
  let n = Math.abs(age) % 100;
  let n1 = n % 10;
  if (n > 10 && n < 20) return 'лет';
  if (n1 > 1 && n1 < 5) return 'года';
  if (n1 === 1) return 'год';
  return 'лет';
}

function getSeenText(timestamp, gender) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  let verb = 'Был(а)';
  if (gender === 'male') verb = 'Был';
  if (gender === 'female') verb = 'Была';

  if (minutes < 1) return `${verb} только что`;
  if (minutes < 60) return `${verb} ${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${verb} ${hours} ч. назад`;
  return `${verb} давно`;
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; } 
  else { input.type = 'password'; btn.textContent = '👁️'; }
}

function createStars() {
  let starfield = document.getElementById('starfield');
  if (!starfield) {
    starfield = document.createElement('div');
    starfield.id = 'starfield';
    document.body.appendChild(starfield);
  }
  starfield.innerHTML = '';
  for (let i = 0; i < 150; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 3 + 1;
    star.style.width = size + 'px'; star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + 'vw'; star.style.top = Math.random() * 100 + 'vh';
    star.style.animationDuration = (Math.random() * 3 + 1) + 's';
    star.style.animationDelay = (Math.random() * 3) + 's';
    starfield.appendChild(star);
  }
}

function applyTheme(theme, bgColor) {
  document.body.className = `theme-${theme} bg-${bgColor || 'dark'}`;
  if (theme === 'cosmic') { createStars(); }
  const t = loc[theme] || loc.dark;
  document.getElementById('subtitle-text').textContent = t.sub;
  document.getElementById('online-title').textContent = t.online;
  document.getElementById('all-list-title').textContent = t.imp;
  if (currentUser) updateRoleBadge(currentUser.role);
}

function getRoleName(role, theme) {
  const t = loc[theme] || loc.dark;
  if (role === 'dev') return t.dev;
  if (role === 'apostle') return t.apostle;
  return ''; 
}

const saved = localStorage.getItem('quasar_user');
if (saved) { try { enterApp(JSON.parse(saved)); } catch (e) { console.error(e); } }

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    authMode = t.dataset.tab;
    document.getElementById('auth-btn').textContent = authMode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ';
    document.getElementById('auth-err').textContent = '';
  };
});

document.getElementById('auth-btn').onclick = async () => {
  const username = document.getElementById('auth-user').value.trim();
  const password = document.getElementById('auth-pass').value;
  const err = document.getElementById('auth-err');
  err.textContent = '';
  try {
    const r = await fetch('/api/' + authMode, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) { err.textContent = data.error; return; }
    
    if (authMode === 'register') {
      const r2 = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const d2 = await r2.json();
      enterApp({ username: d2.username, role: d2.role, avatar: d2.avatar, about: d2.about, birthDate: d2.birthDate, gender: d2.gender, theme: d2.theme, bgColor: d2.bgColor });
    } else {
      enterApp({ username: data.username, role: data.role, avatar: data.avatar, about: data.about, birthDate: data.birthDate, gender: data.gender, theme: data.theme, bgColor: data.bgColor });
    }
  } catch (e) { err.textContent = 'Ошибка соединения с сервером'; }
};

function enterApp(user) {
  currentUser = user;
  localStorage.setItem('quasar_user', JSON.stringify(user));
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  document.getElementById('me-name').textContent = user.username;
  
  applyTheme(user.theme || 'dark', user.bgColor || 'dark');
  populateDateSelects();
  updateMyAvatar(user.avatar);
  socket.emit('login', user.username);
  refreshUsers();
}

function updateRoleBadge(role) {
  const badge = document.getElementById('my-role-badge');
  badge.style.display = 'inline';
  const theme = currentUser.theme || 'dark';
  if (role === 'dev') { badge.textContent = getRoleName('dev', theme); badge.className = 'badge-dev'; } 
  else if (role === 'apostle') { badge.textContent = getRoleName('apostle', theme); badge.className = 'badge-apostle'; } 
  else { badge.style.display = 'none'; }
}

function updateMyAvatar(url) {
  const img = document.getElementById('my-avatar');
  if (url) { img.src = url; img.style.display = 'block'; } else { img.style.display = 'none'; }
}

document.getElementById('logout').onclick = () => { localStorage.removeItem('quasar_user'); location.reload(); };
document.getElementById('btn-profile-logout').onclick = () => { localStorage.removeItem('quasar_user'); location.reload(); };

async function refreshUsers() {
  try {
    const r = await fetch('/api/users');
    let users = await r.json();
    const powerList = document.getElementById('power-list');
    const allList = document.getElementById('all-list');
    const banSelect = document.getElementById('ban-select');
    
    powerList.innerHTML = '';
    allList.innerHTML = '';
    banSelect.innerHTML = '<option value="">-- Выбрать --</option>';
    
    users.sort((a, b) => {
      const rank = { dev: 1, apostle: 2, imp: 3 };
      return (rank[a.role] || 3) - (rank[b.role] || 3);
    });

    users.filter(u => u.username !== currentUser.username).forEach(u => {
      const isOnline = onlineUsersList.includes(u.username);
      if (!isOnline) {
        const li = document.createElement('li');
        li.dataset.user = u.username;
        const avatarHtml = u.avatar ? `<img src="${u.avatar}" class="avatar-mini">` : `<div class="avatar-mini" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">${u.username[0].toUpperCase()}</div>`;
        let roleBadge = '';
        if (u.role === 'dev') roleBadge = `<span class="badge-dev" style="margin-left: 5px;">${getRoleName('dev', currentUser.theme)}</span>`;
        if (u.role === 'apostle') roleBadge = `<span class="badge-apostle" style="margin-left: 5px;">${getRoleName('apostle', currentUser.theme)}</span>`;
        const statusHtml = u.isBanned ? '<span style="color:#f43f5e;font-size:10px;margin-left:5px;">(ИЗГНАН)</span>' : '';
        li.innerHTML = `${avatarHtml} ${u.username} ${roleBadge} ${statusHtml} <span class="dot"></span>`;
        li.title = u.lastSeen ? getSeenText(u.lastSeen, u.gender) : 'Неизвестно';
        li.onclick = () => openChat(u);
        if (u.role === 'dev' || u.role === 'apostle') { powerList.appendChild(li); } else { allList.appendChild(li); }
      }
      let canManage = false;
      if (currentUser.role === 'dev' && u.username !== 'Кишима') canManage = true; 
      else if (currentUser.role === 'apostle' && u.role === 'imp') canManage = true; 
      if (canManage) {
        const opt = document.createElement('option'); opt.value = u.username; opt.textContent = u.username; banSelect.appendChild(opt);
      }
    });
    document.getElementById('power-list-title').style.display = powerList.children.length > 0 ? 'block' : 'none';
    document.getElementById('all-list-title').style.display = allList.children.length > 0 ? 'block' : 'none';
  } catch (error) { console.error(error); }
}
setInterval(refreshUsers, 5000);

socket.on('force_reload', () => { setTimeout(() => { location.reload(); }, 500); });
socket.on('roles_updated', () => { refreshUsers(); });

socket.on('your_role_changed', (newRole) => {
  currentUser.role = newRole;
  localStorage.setItem('quasar_user', JSON.stringify(currentUser));
  updateRoleBadge(newRole);
  if (document.getElementById('modal-settings').style.display === 'flex') document.getElementById('btn-settings').click();
  alert('Ваша роль была изменена!');
});

socket.on('users_online', (online) => {
  onlineUsersList = online; 
  const list = document.getElementById('online-list');
  const onlineTitle = document.getElementById('online-title');
  list.innerHTML = '';
  const filteredOnline = online.filter(u => u !== currentUser.username);
  onlineTitle.style.display = filteredOnline.length > 0 ? 'block' : 'none';

  filteredOnline.forEach(u => {
    const li = document.createElement('li');
    li.className = 'online';
    li.dataset.user = u;
    li.innerHTML = `<span class="dot" style="margin-left:0;margin-right:8px;"></span> ${u}`;
    li.onclick = async () => {
      const r = await fetch('/api/users');
      const users = await r.json();
      const userData = users.find(x => x.username === u);
      if (userData) openChat(userData, true); else openChat({ username: u }, true);
    };
    list.appendChild(li);
  });
  refreshUsers(); 
});

socket.on('user_typing', ({ from, isTyping }) => {
  if (currentChat === from) {
    const indicator = document.getElementById('typing-indicator');
    indicator.style.display = isTyping ? 'block' : 'none';
  }
});

socket.on('message_deleted', (msgId) => {
  const msgEl = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (msgEl) msgEl.remove();
});

socket.on('pins_updated', () => {
  if (currentChat) {
    socket.emit('history', { user1: currentUser.username, user2: currentChat }, (data) => {
      currentPins = data.pins || [];
      currentPins.sort((a, b) => a.time - b.time);
      if (currentPins.length > 0) { currentPinIndex = currentPins.length - 1; } else { currentPinIndex = 0; }
      updatePinnedBar();
    });
  }
});

function updatePinnedBar() {
  const bar = document.getElementById('pinned-bar');
  const text = document.getElementById('pinned-text');
  
  if (currentPins.length === 0) {
    bar.style.display = 'none';
    return;
  }
  
  bar.style.display = 'flex';
  const pin = currentPins[currentPinIndex];
  text.textContent = (pin.from === currentUser.username ? 'Вы: ' : pin.from + ': ') + (pin.text || 'Файл');
}

document.getElementById('pinned-bar').onclick = (e) => {
  if (e.target.closest('#btn-open-pin-list')) return;
  if (currentPins.length === 0) return;
  
  scrollToMessage(currentPins[currentPinIndex].id);
  
  if (currentPins.length > 1) {
    currentPinIndex = (currentPinIndex - 1 + currentPins.length) % currentPins.length;
    updatePinnedBar();
  }
};

document.getElementById('btn-open-pin-list').onclick = (e) => {
  e.stopPropagation();
  const modal = document.getElementById('modal-pin-list');
  const list = document.getElementById('pin-list-ul');
  list.innerHTML = '';
  
  if (currentPins.length === 0) return;
  
  currentPins.sort((a, b) => a.time - b.time).forEach((pin, index) => {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
    li.innerHTML = `
      <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
        <span style="font-size: 12px; color: var(--primary); display: block;">${escapeHtml(pin.from)}</span>
        <span style="font-size: 14px; color: var(--text-main);">${escapeHtml(pin.text || 'Файл')}</span>
      </div>
      <span style="font-size: 10px; color: var(--text-muted); margin-left: 10px;">${new Date(pin.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    `;
    li.onclick = () => {
      modal.style.display = 'none';
      currentPinIndex = index;
      updatePinnedBar();
      scrollToMessage(pin.id);
    };
    list.appendChild(li);
  });
  
  modal.style.display = 'flex';
};

document.getElementById('btn-close-pin-list').onclick = () => {
  document.getElementById('modal-pin-list').style.display = 'none';
};

function openChat(userData, isOnline = false) {
  currentChat = userData.username;
  currentChatData = userData;
  document.getElementById('chat-title').textContent = userData.username;
  
  const statusEl = document.getElementById('chat-status');
  if (!isOnline && userData.lastSeen) { statusEl.textContent = getSeenText(userData.lastSeen, userData.gender); statusEl.style.color = 'var(--text-muted)'; } 
  else { statusEl.textContent = 'В сети'; statusEl.style.color = '#10b981'; }
  statusEl.style.display = 'block';

  const headerAvatar = document.getElementById('chat-avatar');
  if (userData.avatar) { headerAvatar.src = userData.avatar; headerAvatar.style.display = 'block'; } else { headerAvatar.style.display = 'none'; }

  document.getElementById('input-area').style.display = 'flex';
  document.getElementById('messages').innerHTML = '';
  document.getElementById('typing-indicator').style.display = 'none';
  document.querySelectorAll('#sidebar li').forEach(l => l.classList.toggle('active', l.dataset.user === userData.username));
  
  cancelReply();
  currentPins = [];
  currentPinIndex = 0;
  updatePinnedBar();

  socket.emit('history', { user1: currentUser.username, user2: userData.username }, (data) => { 
    data.messages.forEach(renderMessage); 
    currentPins = data.pins || [];
    currentPins.sort((a, b) => a.time - b.time);
    if (currentPins.length > 0) { currentPinIndex = currentPins.length - 1; updatePinnedBar(); }
  });
}

document.getElementById('chat-header-clickable').onclick = () => {
  if (!currentChatData) return;
  const modalView = document.getElementById('modal-view-profile');
  const roleEl = document.getElementById('view-role');
  if (currentChatData.role === 'dev') { roleEl.textContent = getRoleName('dev', currentUser.theme); roleEl.className = 'badge-dev'; roleEl.style.display = 'block'; } 
  else if (currentChatData.role === 'apostle') { roleEl.textContent = getRoleName('apostle', currentUser.theme); roleEl.className = 'badge-apostle'; roleEl.style.display = 'block'; } 
  else { roleEl.style.display = 'none'; }

  const statusEl = document.getElementById('view-status');
  if (currentChatData.lastSeen && !onlineUsersList.includes(currentChatData.username)) { statusEl.textContent = getSeenText(currentChatData.lastSeen, currentChatData.gender); statusEl.style.color = 'var(--text-muted)'; } 
  else { statusEl.textContent = 'В сети'; statusEl.style.color = '#10b981'; }

  let nameText = currentChatData.username;
  if (currentChatData.birthDate) {
    const parts = currentChatData.birthDate.split('-');
    if (parts.length === 3) {
      const formattedDate = `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2]}`;
      const age = calculateAge(currentChatData.birthDate);
      nameText += ` (${formattedDate} / ${age} ${getAgeWord(age)})`;
    }
  }
  document.getElementById('view-username').textContent = nameText;
  
  const viewAvatar = document.getElementById('view-avatar');
  const placeholder = document.getElementById('view-avatar-placeholder');
  if (currentChatData.avatar) { viewAvatar.src = currentChatData.avatar; viewAvatar.style.display = 'block'; placeholder.style.display = 'none'; } 
  else { viewAvatar.style.display = 'none'; placeholder.style.display = 'block'; placeholder.textContent = currentChatData.username[0].toUpperCase(); }
  
  const aboutContainer = document.getElementById('view-about-container');
  if (currentChatData.about && currentChatData.about.trim() !== '') { document.getElementById('view-about').textContent = currentChatData.about; aboutContainer.style.display = 'block'; } 
  else { aboutContainer.style.display = 'none'; }
  modalView.style.display = 'flex';
};

document.getElementById('btn-close-view-profile').onclick = () => { document.getElementById('modal-view-profile').style.display = 'none'; };

function setReply(msg) {
  replyToMsg = msg;
  const replyPanel = document.getElementById('reply-panel');
  const replyText = document.getElementById('reply-text');
  replyText.textContent = msg.text || (msg.file ? 'Файл' : 'Сообщение');
  replyPanel.style.display = 'flex';
  document.getElementById('msg-input').focus();
}

function cancelReply() {
  replyToMsg = null;
  document.getElementById('reply-panel').style.display = 'none';
}

document.getElementById('cancel-reply').onclick = cancelReply;

function renderMessage(m) {
  if ((m.from !== currentUser.username && m.to !== currentUser.username) && currentUser.role !== 'dev') return;
  if (currentUser.role !== 'dev' && !((m.from === currentUser.username && m.to === currentChat) || (m.from === currentChat && m.to === currentUser.username))) return;

  const div = document.createElement('div');
  div.className = 'msg ' + (m.from === currentUser.username ? 'mine' : 'theirs');
  div.dataset.msgId = m.id;

  let html = '';
  
  if (m.forwardedFrom) {
    html += `<div class="forwarded-label">➡️ Переслано от ${escapeHtml(m.forwardedFrom)}</div>`;
  }

  if (m.replyTo) {
    html += `<div class="reply-quote" onclick="scrollToMessage('${m.replyTo.id}')">
      <span class="reply-author">${escapeHtml(m.replyTo.author)}</span>
      <span class="reply-body">${escapeHtml(m.replyTo.text || 'Файл')}</span>
    </div>`;
  }

  if (m.isPinned) {
    html += `<span class="pin-label" style="font-size:10px; color:var(--primary); display:block; margin-bottom:3px;">📌 Закреплено</span>`;
  }

  if (m.text) html += escapeHtml(m.text) + '<br>';
  
  if (m.file) {
    if (/\.(png|jpe?g|gif|webp)$/i.test(m.file)) { 
      html += `<img src="${m.file}" alt="Фото" style="cursor: pointer;" onclick="openFullscreenImage('${m.file}')">`; 
    } 
    else if (/\.(mp4|webm|ogg|mov)$/i.test(m.file)) {
      html += `<video src="${m.file}#t=0.5" controls preload="metadata" style="max-width: 100%; border-radius: 10px; margin-top: 8px; background: #000;"></video>`;
    }
    else { html += `<a class="file-link" href="${m.file}" download="${m.fileName || ''}">📎 ${escapeHtml(m.fileName || 'файл')}</a>`; }
  }

  const d = new Date(m.time);
  html += `<span class="time">${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}</span>`;
  div.innerHTML = html;
  div.msgData = m;
  
  div.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(e.pageX, e.pageY, m); });
  
  let touchTimer;
  div.addEventListener('touchstart', (e) => {
    touchTimer = setTimeout(() => { openContextMenu(e.touches[0].pageX, e.touches[0].pageY, m); }, 500);
  }, { passive: true });
  div.addEventListener('touchend', () => clearTimeout(touchTimer));
  div.addEventListener('touchmove', () => clearTimeout(touchTimer));

  const box = document.getElementById('messages');
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function scrollToMessage(msgId) {
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => { el.classList.remove('highlight'); }, 2000);
  }
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function openFullscreenImage(src) {
  const modal = document.getElementById('modal-image-view');
  const img = document.getElementById('fullscreen-image');
  img.src = src;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Блокируем прокрутку фона
}

document.getElementById('btn-close-image').onclick = () => {
  document.getElementById('modal-image-view').style.display = 'none';
  document.body.style.overflow = ''; // Возвращаем прокрутку
};

const contextMenu = document.getElementById('context-menu');
const ctxCopy = document.getElementById('ctx-copy');
const ctxReply = document.getElementById('ctx-reply');
const ctxReport = document.getElementById('ctx-report');
const ctxDelete = document.getElementById('ctx-delete');
const ctxForward = document.getElementById('ctx-forward');
const ctxPin = document.getElementById('ctx-pin');

function openContextMenu(x, y, msg) {
  const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
  if (el && el.msgData) { activeContextMsg = el.msgData; } else { activeContextMsg = msg; }
  
  ctxCopy.style.display = activeContextMsg.text ? 'block' : 'none';
  ctxReport.style.display = activeContextMsg.from !== currentUser.username ? 'block' : 'none';
  ctxDelete.style.display = (activeContextMsg.from === currentUser.username || currentUser.role === 'dev') ? 'block' : 'none';
  
  ctxForward.style.display = 'block';
  ctxPin.style.display = 'block';
  ctxPin.textContent = activeContextMsg.isPinned ? '📍 Открепить' : '📌 Закрепить';
  
  contextMenu.style.display = 'block';
  contextMenu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  contextMenu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
}

window.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
});

ctxCopy.onclick = () => {
  if (activeContextMsg && activeContextMsg.text) {
    navigator.clipboard.writeText(activeContextMsg.text).then(() => { contextMenu.style.display = 'none'; });
  }
};

ctxReply.onclick = () => {
  if (activeContextMsg) { setReply(activeContextMsg); contextMenu.style.display = 'none'; }
};

ctxReport.onclick = () => {
  if (activeContextMsg) { contextMenu.style.display = 'none'; openReportModal('message', activeContextMsg.id); }
};

ctxDelete.onclick = () => {
  if (!activeContextMsg) return;
  contextMenu.style.display = 'none';
  
  const modal = document.getElementById('delete-choice-modal');
  modal.style.display = 'flex';

  document.getElementById('btn-del-all').onclick = async () => {
    modal.style.display = 'none';
    const r = await fetch('/api/delete-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgId: activeContextMsg.id, username: currentUser.username, mode: 'all' }) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
  };

  document.getElementById('btn-del-me').onclick = async () => {
    modal.style.display = 'none';
    const r = await fetch('/api/delete-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgId: activeContextMsg.id, username: currentUser.username, mode: 'me' }) });
    if (!r.ok) { const d = await r.json(); alert(d.error); }
  };

  document.getElementById('btn-del-cancel').onclick = () => { modal.style.display = 'none'; };
};

ctxForward.onclick = async () => {
  if (!activeContextMsg) return;
  contextMenu.style.display = 'none';
  
  const modal = document.getElementById('modal-forward');
  const list = document.getElementById('forward-users-list');
  list.innerHTML = '';
  
  const r = await fetch('/api/users');
  const users = await r.json();
  
  users.filter(u => u.username !== currentUser.username).forEach(u => {
    const li = document.createElement('li');
    const avatarHtml = u.avatar ? `<img src="${u.avatar}" class="avatar-mini">` : `<div class="avatar-mini" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">${u.username[0].toUpperCase()}</div>`;
    li.innerHTML = `${avatarHtml} ${u.username}`;
    li.onclick = async () => {
      modal.style.display = 'none';
      const r2 = await fetch('/api/forward-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentUser.username, to: u.username, forwardedFrom: activeContextMsg.from, text: activeContextMsg.text, file: activeContextMsg.file, fileName: activeContextMsg.fileName }) });
      if (r2.ok) alert(`Переслано пользователю ${u.username}`);
    };
    list.appendChild(li);
  });
  
  modal.style.display = 'flex';
};

document.getElementById('btn-cancel-forward').onclick = () => { document.getElementById('modal-forward').style.display = 'none'; };

ctxPin.onclick = async () => {
  if (!activeContextMsg) return;
  contextMenu.style.display = 'none';
  
  const r = await fetch('/api/pin-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgId: activeContextMsg.id, username: currentUser.username }) });
  
  if (!r.ok) {
    const d = await r.json();
    alert(d.error);
  } else {
    const data = await r.json();
    activeContextMsg.isPinned = data.isPinned;
    
    const msgEl = document.querySelector(`[data-msg-id="${activeContextMsg.id}"]`);
    if (msgEl) {
      msgEl.msgData.isPinned = data.isPinned;
      if (data.isPinned) {
        if (!msgEl.querySelector('.pin-label')) {
          const pinLabel = document.createElement('span');
          pinLabel.className = 'pin-label';
          pinLabel.style.cssText = 'font-size:10px; color:var(--primary); display:block; margin-bottom:3px;';
          pinLabel.textContent = '📌 Закреплено';
          msgEl.insertBefore(pinLabel, msgEl.firstChild);
        }
      } else {
        const pinLabel = msgEl.querySelector('.pin-label');
        if (pinLabel) pinLabel.remove();
      }
    }

    socket.emit('history', { user1: currentUser.username, user2: currentChat }, (historyData) => {
      currentPins = historyData.pins || [];
      currentPins.sort((a, b) => a.time - b.time);
      if (currentPins.length > 0) { currentPinIndex = currentPins.length - 1; updatePinnedBar(); } else { document.getElementById('pinned-bar').style.display = 'none'; }
    });
  }
};

socket.on('new_message', (m) => {
  if (!currentChat) return;
  if ((m.from === currentUser.username && m.to === currentChat) || (m.from === currentChat && m.to === currentUser.username)) { renderMessage(m); }
});

socket.on('banned', () => { alert('Вы были изгнаны (забанены).'); localStorage.removeItem('quasar_user'); location.reload(); });

const msgInput = document.getElementById('msg-input');
msgInput.addEventListener('input', () => {
  if (!currentChat) return;
  socket.emit('typing', { to: currentChat, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { socket.emit('typing', { to: currentChat, isTyping: false }); }, 1500);
});

async function uploadFile(file) {
  if (!file) return;
  const previewBox = document.getElementById('file-preview');
  const previewName = document.getElementById('preview-name');
  const previewImg = document.getElementById('preview-img');
  previewImg.style.display = 'none'; previewImg.src = '';
  previewBox.style.display = 'flex';
  previewName.textContent = 'Загрузка: ' + file.name + '...';

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => { previewImg.src = e.target.result; previewImg.style.display = 'block'; };
    reader.readAsDataURL(file);
  }
  
  if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.crossOrigin = 'anonymous';
    video.currentTime = 0.5;
    video.addEventListener('loadeddata', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      previewImg.src = canvas.toDataURL('image/jpeg');
      previewImg.style.display = 'block';
      URL.revokeObjectURL(video.src);
    });
  }

  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await r.json();
    pendingFile = { url: data.url, name: data.name };
    previewName.textContent = data.name;
  } catch (err) { previewName.textContent = 'Ошибка загрузки'; }
}

document.getElementById('file-input').onchange = (e) => { uploadFile(e.target.files[0]); e.target.value = ''; };
document.getElementById('cancel-file').onclick = () => {
  pendingFile = null;
  document.getElementById('file-preview').style.display = 'none';
  document.getElementById('preview-name').textContent = '';
  document.getElementById('preview-img').style.display = 'none';
};

const chatArea = document.getElementById('chat');
chatArea.addEventListener('dragover', (e) => { e.preventDefault(); chatArea.classList.add('drag-over'); });
chatArea.addEventListener('dragleave', (e) => { e.preventDefault(); chatArea.classList.remove('drag-over'); });
chatArea.addEventListener('drop', (e) => {
  e.preventDefault(); chatArea.classList.remove('drag-over');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]);
});

document.getElementById('send-btn').onclick = sendMessage;
msgInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && !pendingFile) return;
  if (!currentChat) return;
  
  const msgData = { from: currentUser.username, to: currentChat, text, file: pendingFile?.url || null, fileName: pendingFile?.name || null };

  if (replyToMsg) {
    msgData.replyTo = { id: replyToMsg.id, author: replyToMsg.from, text: replyToMsg.text || (replyToMsg.file ? 'Файл' : '') };
  }

  socket.emit('send_message', msgData);
  
  msgInput.value = '';
  pendingFile = null;
  cancelReply();
  document.getElementById('file-preview').style.display = 'none';
  document.getElementById('preview-name').textContent = '';
  document.getElementById('preview-img').style.display = 'none';
  socket.emit('typing', { to: currentChat, isTyping: false });
  clearTimeout(typingTimeout);
}

const modal = document.getElementById('modal-settings');
const modalCrop = document.getElementById('modal-crop');
const canvas = document.getElementById('crop-canvas');
cropCtx = canvas.getContext('2d');
const zoomSlider = document.getElementById('zoom-slider');

document.getElementById('btn-settings').onclick = () => {
  modal.style.display = 'flex';
  document.getElementById('settings-username').value = currentUser.username;
  document.getElementById('settings-about').value = currentUser.about || '';
  document.getElementById('settings-old-pass').value = '';
  document.getElementById('settings-new-pass').value = '';
  newAvatarUrl = currentUser.avatar || null;
  
  document.getElementById('theme-select').value = currentUser.theme || 'dark';
  document.getElementById('bg-color-select').value = currentUser.bgColor || 'dark';
  document.getElementById('gender-select').value = currentUser.gender || '';
  
  if (currentUser.birthDate) {
    const parts = currentUser.birthDate.split('-');
    if (parts.length === 3) {
      document.getElementById('birth-day').value = parseInt(parts[0]);
      document.getElementById('birth-month').value = parseInt(parts[1]);
      document.getElementById('birth-year').value = parts[2];
    }
  } else {
    document.getElementById('birth-day').value = '';
    document.getElementById('birth-month').value = '';
    document.getElementById('birth-year').value = '';
  }

  const avatarPreview = document.getElementById('settings-avatar-preview');
  if (newAvatarUrl) { avatarPreview.src = newAvatarUrl; avatarPreview.style.display = 'block'; } else { avatarPreview.style.display = 'none'; }

  if (currentUser.role === 'dev') {
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('btn-make-apostle').style.display = 'block';
    document.getElementById('btn-dev-console').style.display = 'block';
  } else if (currentUser.role === 'apostle') {
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('btn-make-apostle').style.display = 'none';
    document.getElementById('btn-dev-console').style.display = 'none';
  } else {
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('btn-dev-console').style.display = 'none';
  }
};

document.getElementById('btn-close-settings').onclick = () => { modal.style.display = 'none'; };

document.getElementById('avatar-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    cropImage = new Image();
    cropImage.onload = () => {
      modal.style.display = 'none'; modalCrop.style.display = 'flex';
      const minSide = Math.min(cropImage.width, cropImage.height);
      minScale = canvas.width / minSide; 
      cropScale = minScale; cropX = 0; cropY = 0;
      zoomSlider.value = minScale; zoomSlider.min = minScale; zoomSlider.max = minScale * 4;
      drawCrop();
    };
    cropImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};

function drawCrop() {
  cropCtx.clearRect(0, 0, canvas.width, canvas.height);
  cropCtx.save();
  const drawW = cropImage.width * cropScale;
  const drawH = cropImage.height * cropScale;
  const maxOffsetX = (drawW - canvas.width) / 2;
  const maxOffsetY = (drawH - canvas.height) / 2;
  if (cropX > maxOffsetX) cropX = maxOffsetX;
  if (cropX < -maxOffsetX) cropX = -maxOffsetX;
  if (cropY > maxOffsetY) cropY = maxOffsetY;
  if (cropY < -maxOffsetY) cropY = -maxOffsetY;
  cropCtx.translate(canvas.width / 2, canvas.height / 2);
  cropCtx.scale(cropScale, cropScale);
  cropCtx.translate(-cropImage.width / 2 + cropX, -cropImage.height / 2 + cropY);
  cropCtx.drawImage(cropImage, 0, 0);
  cropCtx.restore();
}

zoomSlider.oninput = (e) => { cropScale = parseFloat(e.target.value); drawCrop(); };
let cropContainer = document.querySelector('.crop-container');

// Для мышки
cropContainer.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX - cropX; startY = e.clientY - cropY; });
window.addEventListener('mousemove', (e) => { if (!isDragging) return; cropX = e.clientX - startX; cropY = e.clientY - startY; drawCrop(); });
window.addEventListener('mouseup', () => { isDragging = false; });

// Для пальцев
cropContainer.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    isDragging = true;
    touchStartX = e.touches[0].clientX - cropX;
    touchStartY = e.touches[0].clientY - cropY;
  }
}, { passive: false });

cropContainer.addEventListener('touchmove', (e) => {
  if (!isDragging || e.touches.length !== 1) return;
  e.preventDefault(); // Запрещаем прокрутку страницы во время движения картинки
  cropX = e.touches[0].clientX - touchStartX;
  cropY = e.touches[0].clientY - touchStartY;
  drawCrop();
}, { passive: false });

cropContainer.addEventListener('touchend', () => {
  isDragging = false;
});
document.getElementById('btn-crop-cancel').onclick = () => { modalCrop.style.display = 'none'; modal.style.display = 'flex'; };

document.getElementById('btn-crop-save').onclick = () => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 300; tempCanvas.height = 300;
  const tCtx = tempCanvas.getContext('2d');
  tCtx.drawImage(canvas, 0, 0);
  tempCanvas.toBlob(async (blob) => {
    const fd = new FormData(); fd.append('avatar', blob, 'avatar.jpg');
    const r = await fetch('/api/avatar', { method: 'POST', body: fd });
    const data = await r.json();
    newAvatarUrl = data.url;
    const avatarPreview = document.getElementById('settings-avatar-preview');
    avatarPreview.src = newAvatarUrl; avatarPreview.style.display = 'block';
    modalCrop.style.display = 'none'; modal.style.display = 'flex';
  }, 'image/jpeg', 0.9);
};

document.getElementById('btn-save-settings').onclick = async () => {
  const newUsername = document.getElementById('settings-username').value.trim();
  const about = document.getElementById('settings-about').value.trim();
  const oldPass = document.getElementById('settings-old-pass').value;
  const newPass = document.getElementById('settings-new-pass').value;
  
  const theme = document.getElementById('theme-select').value;
  const bgColor = document.getElementById('bg-color-select').value;
  
  const bDay = document.getElementById('birth-day').value;
  const bMonth = document.getElementById('birth-month').value;
  const bYear = document.getElementById('birth-year').value;
  let birthDate = '';
  if (bDay && bMonth && bYear) { birthDate = `${bDay}-${bMonth}-${bYear}`; }
  
  const gender = document.getElementById('gender-select').value;

  if (!newUsername) return alert('Имя не может быть пустым');
  if (newPass && !oldPass) return alert('Введите текущий пароль для смены!');

  const r = await fetch('/api/update-profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldUsername: currentUser.username, newUsername, avatar: newAvatarUrl, about, birthDate, gender, oldPassword: oldPass, newPassword: newPass, theme, bgColor })
  });
  const data = await r.json();
  if (!r.ok) return alert(data.error);
  
  currentUser.username = data.username; 
  currentUser.avatar = data.avatar; 
  currentUser.about = data.about;
  currentUser.birthDate = data.birthDate;
  currentUser.gender = data.gender;
  currentUser.theme = data.theme;
  currentUser.bgColor = data.bgColor;
  
  localStorage.setItem('quasar_user', JSON.stringify(currentUser));
  document.getElementById('me-name').textContent = currentUser.username;
  updateMyAvatar(currentUser.avatar);
  applyTheme(currentUser.theme, currentUser.bgColor);
  modal.style.display = 'none';
  refreshUsers();
  alert('Профиль обновлен!');
};

document.getElementById('btn-delete-account').onclick = async () => {
  if (!confirm('Вы уверены, что хотите навсегда удалить аккаунт?')) return;
  const r = await fetch('/api/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
  const data = await r.json();
  if (!r.ok) return alert(data.error);
  alert('Аккаунт удален.'); localStorage.removeItem('quasar_user'); location.reload();
};

document.getElementById('btn-ban').onclick = async () => {
  const target = document.getElementById('ban-select').value;
  if (!target) return alert('Выберите пользователя');
  const r = await fetch('/api/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, targetUsername: target, banStatus: true }) });
  const data = await r.json();
  if (!r.ok) return alert(data.error);
  alert(`Пользователь ${target} изгнан.`);
  refreshUsers();
};

document.getElementById('btn-make-apostle').onclick = async () => {
  const target = document.getElementById('ban-select').value;
  if (!target) return alert('Выберите пользователя');
  const r = await fetch('/api/set-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devUsername: currentUser.username, targetUsername: target, role: 'apostle' }) });
  const data = await r.json();
  if (!r.ok) return alert(data.error);
  alert(`Пользователь ${target} повышен!`);
  refreshUsers();
};

document.getElementById('btn-delete-user').onclick = async () => {
  const target = document.getElementById('ban-select').value;
  if (!target) return alert('Выберите пользователя');
  if (!confirm(`Вы уверены, что хотите навсегда стереть пользователя ${target}?`)) return;
  const r = await fetch('/api/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: target, adminUsername: currentUser.username }) });
  const data = await r.json();
  if (!r.ok) return alert(data.error);
  alert(`Пользователь ${target} стерт.`);
  refreshUsers();
};

const reportModal = document.getElementById('modal-report');
const reportReason = document.getElementById('report-reason');
const reportCustomGroup = document.getElementById('report-custom-group');
const reportCustom = document.getElementById('report-custom');

function openReportModal(type, targetId) {
  reportTargetType = type;
  reportTargetId = targetId;
  reportReason.value = 'spam';
  reportCustom.value = '';
  reportCustomGroup.style.display = 'none';
  
  const targetText = document.getElementById('report-target-text');
  if (type === 'user') targetText.textContent = `Жалоба на пользователя: ${targetId}`;
  else targetText.textContent = `Жалоба на сообщение`;
  
  reportModal.style.display = 'flex';
}

reportReason.onchange = (e) => {
  if (e.target.value === 'other') reportCustomGroup.style.display = 'block';
  else reportCustomGroup.style.display = 'none';
};

document.getElementById('btn-cancel-report').onclick = () => { reportModal.style.display = 'none'; };

document.getElementById('btn-send-report').onclick = async () => {
  const reason = reportReason.value;
  const custom = reportCustom.value.trim();
  if (reason === 'other' && !custom) return alert('Пожалуйста, опишите причину жалобы.');

  const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentUser.username, target: reportTargetId, type: reportTargetType, reason, customReason: custom }) });

  if (r.ok) {
    alert('Жалоба отправлена.');
    reportModal.style.display = 'none';
  } else { alert('Ошибка при отправке жалобы.'); }
};

document.getElementById('btn-report-user').onclick = () => {
  if (currentChatData) {
    document.getElementById('modal-view-profile').style.display = 'none';
    openReportModal('user', currentChatData.username);
  }
};

// --- КОНСОЛЬ РАЗРАБОТЧИКА ---
const consoleModal = document.getElementById('modal-dev-console');

document.getElementById('btn-dev-console').onclick = () => {
  document.getElementById('modal-settings').style.display = 'none';
  consoleModal.style.display = 'flex';
  loadConsoleData();
};

document.getElementById('btn-close-console').onclick = () => { consoleModal.style.display = 'none'; };

async function loadConsoleData() {
  const r = await fetch(`/api/reports?username=${currentUser.username}`);
  const reports = await r.json();
  const list = document.getElementById('console-reports-list');
  list.innerHTML = '';
  
  if (reports.length === 0) {
    list.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Жалоб пока нет</p>';
  } else {
    reports.forEach(rep => {
      const card = document.createElement('div');
      card.className = 'report-card';
      const date = new Date(rep.time).toLocaleString();
      let reasonText = rep.reason;
      if (rep.reason === 'spam') reasonText = 'Спам / Реклама';
      if (rep.reason === 'abuse') reasonText = 'Оскорбления / Травля';
      if (rep.reason === 'nsfw') reasonText = 'Контент 18+';
      if (rep.reason === 'other') reasonText = 'Другое';
      
      card.innerHTML = `
        <div class="report-header">
          <span>От: <span class="report-from">${escapeHtml(rep.from)}</span></span>
          <div style="display: flex; gap: 10px; align-items: center;">
            <span class="report-time">${date}</span>
            <button class="del-report-btn" data-id="${rep.id}" style="background: transparent; border: none; color: #f43f5e; cursor: pointer; font-size: 16px; padding: 0; line-height: 1;">✖</button>
          </div>
        </div>
        <div>На: <span class="report-target">${escapeHtml(rep.target)}</span> (${rep.type === 'user' ? 'Профиль' : 'Сообщение'})</div>
        <div class="report-reason">Причина: ${reasonText}</div>
        ${rep.customReason ? `<div class="report-custom">"${escapeHtml(rep.customReason)}"</div>` : ''}
      `;
      list.appendChild(card);
    });
    
    // Обработчики удаления
    document.querySelectorAll('.del-report-btn').forEach(btn => {
      btn.onclick = async () => {
        const repId = btn.getAttribute('data-id');
        const r = await fetch('/api/delete-report', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: repId, username: currentUser.username })
        });
        if (r.ok) { loadConsoleData(); } else { const d = await r.json(); alert(d.error); }
      };
    });
  }

  const rUsers = await fetch('/api/users');
  const users = await rUsers.json();
  const select = document.getElementById('console-user-select');
  select.innerHTML = '<option value="">-- Выбрать --</option>';
  users.filter(u => u.username !== 'Кишима').forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = u.username + (u.isBanned ? ' (ЗАБАНЕН)' : '');
    select.appendChild(opt);
  });

  const rLogs = await fetch(`/api/logs?username=${currentUser.username}`);
  const logs = await rLogs.json();
  const logsList = document.getElementById('console-logs-list');
  logsList.innerHTML = '';
  logs.forEach(log => { appendLogToConsole(log); });
}

function appendLogToConsole(log) {
  const logsList = document.getElementById('console-logs-list');
  if (!logsList) return;
  
  const div = document.createElement('div');
  const timeStr = new Date(log.time).toLocaleTimeString();
  let color = 'var(--text-main)';
  if (log.action === 'БАН' || log.action === 'УДАЛЕНИЕ') color = '#f43f5e';
  if (log.action === 'ВХОД') color = '#10b981';
  if (log.action === 'ЖАЛОБА') color = '#fbbf24';
  
  div.innerHTML = `<span style="color: var(--text-muted);">[${timeStr}]</span> <span style="color: ${color};">[${log.action}]</span> ${escapeHtml(log.details)}`;
  logsList.appendChild(div);
}

socket.on('new_log', (log) => {
  if (document.getElementById('modal-dev-console').style.display === 'flex') {
    appendLogToConsole(log);
    const logsList = document.getElementById('console-logs-list');
    if (logsList) logsList.scrollTop = logsList.scrollHeight;
  }
});

document.getElementById('console-btn-ban').onclick = async () => {
  const target = document.getElementById('console-user-select').value;
  if (!target) return alert('Выберите пользователя');
  const r = await fetch('/api/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, targetUsername: target, banStatus: true }) });
  if (r.ok) { alert(`Пользователь ${target} изгнан.`); loadConsoleData(); } else { const d = await r.json(); alert(d.error); }
};

document.getElementById('console-btn-unban').onclick = async () => {
  const target = document.getElementById('console-user-select').value;
  if (!target) return alert('Выберите пользователя');
  const r = await fetch('/api/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, targetUsername: target, banStatus: false }) });
  if (r.ok) { alert(`Пользователь ${target} разбанен.`); loadConsoleData(); } else { const d = await r.json(); alert(d.error); }
};

document.getElementById('btn-clear-reports').onclick = async () => {
  if (!confirm('Вы уверены, что хотите удалить ВСЕ жалобы?')) return;
  const r = await fetch('/api/clear-reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username })
  });
  if (r.ok) { loadConsoleData(); } else { const d = await r.json(); alert(d.error); }
};

const modals = ['modal-settings', 'modal-crop', 'modal-view-profile', 'modal-image-view', 'modal-report', 'modal-forward', 'modal-pin-list', 'modal-dev-console'];
modals.forEach(id => {
  const modalEl = document.getElementById(id);
  if (modalEl) {
    modalEl.addEventListener('mousedown', (e) => {
      if (e.target === modalEl) { modalEl.style.display = 'none'; }
    });
  }
});