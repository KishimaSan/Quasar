const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e7 });

const USERS_FILE = path.join(__dirname, 'users.json');
const MSGS_FILE = path.join(__dirname, 'messages.json');
const REPORTS_FILE = path.join(__dirname, 'reports.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const AVATAR_DIR = path.join(__dirname, 'public', 'avatars');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(MSGS_FILE)) fs.writeFileSync(MSGS_FILE, '[]');
if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, '[]');

const loadJSON = (f, def) => { try { return JSON.parse(fs.readFileSync(f)); } catch { return def; } };
const saveJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

let actionLogs = [];
const disconnectTimers = {}; // Таймеры для отслеживания реального выхода

function addLog(action, details) {
  const logEntry = { time: Date.now(), action: action, details: details };
  actionLogs.push(logEntry);
  if (actionLogs.length > 200) actionLogs.shift();
  io.emit('new_log', logEntry);
}

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- РЕГИСТРАЦИЯ ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (!/^[a-zA-Zа-яА-Я0-9_]{2,20}$/.test(username))
    return res.status(400).json({ error: 'Логин: 2-20 символов, буквы/цифры/_' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });

  const users = loadJSON(USERS_FILE, {});
  if (users[username]) return res.status(400).json({ error: 'Этот логин уже занят' });

  let role = 'imp';
  if (username === 'Кишима') role = 'dev';
  
  const hash = await bcrypt.hash(password, 10);
  users[username] = { 
    password: hash, role: role, isBanned: false, avatar: null, about: '', 
    birthDate: '', gender: '',
    lastSeen: Date.now(), theme: 'dark', bgColor: 'dark'
  };
  saveJSON(USERS_FILE, users);
  addLog('РЕГИСТРАЦИЯ', `Создан новый аккаунт: ${username}`);
  res.json({ ok: true, username });
});

// --- ВХОД ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON(USERS_FILE, {});
  const u = users[username];
  if (!u) return res.status(400).json({ error: 'Пользователь не найден' });
  
  if (u.isBanned) return res.status(403).json({ error: 'Вы изгнаны (забанены)' });

  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ error: 'Неверный пароль' });
  
  res.json({ 
    ok: true, username, role: u.role, avatar: u.avatar, about: u.about,
    birthDate: u.birthDate, gender: u.gender,
    theme: u.theme || 'dark', bgColor: u.bgColor || 'dark'
  });
});

// --- СПИСОК ПОЛЬЗОВАТЕЛЕЙ ---
app.get('/api/users', (req, res) => {
  const users = loadJSON(USERS_FILE, {});
  const list = Object.keys(users).map(name => ({
    username: name, avatar: users[name].avatar, role: users[name].role,
    isBanned: users[name].isBanned, about: users[name].about, 
    birthDate: users[name].birthDate, gender: users[name].gender,
    lastSeen: users[name].lastSeen || Date.now()
  }));
  res.json(list);
});

// --- ПОЛУЧЕНИЕ ЛОГОВ ---
app.get('/api/logs', (req, res) => {
  const { username } = req.query;
  const users = loadJSON(USERS_FILE, {});
  if (!users[username] || users[username].role !== 'dev') return res.status(403).json({ error: 'Доступ запрещен' });
  res.json(actionLogs);
});

// --- ПОЛУЧЕНИЕ ВСЕХ ЖАЛОБ ---
app.get('/api/reports', (req, res) => {
  const { username } = req.query;
  const users = loadJSON(USERS_FILE, {});
  if (!users[username] || users[username].role !== 'dev') return res.status(403).json({ error: 'Доступ запрещен' });
  
  const reports = loadJSON(REPORTS_FILE, []);
  reports.sort((a, b) => b.time - a.time);
  res.json(reports);
});

// --- УДАЛЕНИЕ ОДНОЙ ЖАЛОБЫ ---
app.post('/api/delete-report', (req, res) => {
  const { reportId, username } = req.body;
  const users = loadJSON(USERS_FILE, {});
  if (!users[username] || users[username].role !== 'dev') return res.status(403).json({ error: 'Доступ запрещен' });

  let reports = loadJSON(REPORTS_FILE, []);
  reports = reports.filter(r => r.id !== reportId);
  saveJSON(REPORTS_FILE, reports);
  res.json({ ok: true });
});

// --- ОЧИСТКА ВСЕХ ЖАЛОБ ---
app.post('/api/clear-reports', (req, res) => {
  const { username } = req.body;
  const users = loadJSON(USERS_FILE, {});
  if (!users[username] || users[username].role !== 'dev') return res.status(403).json({ error: 'Доступ запрещен' });

  saveJSON(REPORTS_FILE, []);
  addLog('ОЧИСТКА', `${username} очистил все жалобы`);
  res.json({ ok: true });
});

// --- ЗАГРУЗКА АВАТАРКИ ---
const avatarStorage = multer.diskStorage({
  destination: AVATAR_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomBytes(8).toString('hex') + ext);
  }
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ url: '/avatars/' + req.file.filename });
});

// --- ОБНОВЛЕНИЕ ПРОФИЛЯ ---
app.post('/api/update-profile', async (req, res) => {
  const { oldUsername, newUsername, avatar, about, birthDate, gender, oldPassword, newPassword, theme, bgColor } = req.body;
  const users = loadJSON(USERS_FILE, {});
  
  if (!users[oldUsername]) return res.status(400).json({ error: 'Пользователь не найден' });
  const user = users[oldUsername];

  if (newPassword) {
    if (!oldPassword) return res.status(400).json({ error: 'Введите текущий пароль' });
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'Неверный текущий пароль' });
    user.password = await bcrypt.hash(newPassword, 10);
  }

  let nameChanged = false;
  if (newUsername && newUsername !== oldUsername) {
    if (!/^[a-zA-Zа-яА-Я0-9_]{2,20}$/.test(newUsername))
      return res.status(400).json({ error: 'Новый логин: 2-20 символов' });
    if (users[newUsername]) return res.status(400).json({ error: 'Этот логин уже занят' });
    
    users[newUsername] = { ...user };
    delete users[oldUsername];
    nameChanged = true;
    
    const msgs = loadJSON(MSGS_FILE, []);
    let msgsChanged = false;
    msgs.forEach(m => {
      if (m.from === oldUsername) { m.from = newUsername; msgsChanged = true; }
      if (m.to === oldUsername) { m.to = newUsername; msgsChanged = true; }
    });
    if (msgsChanged) saveJSON(MSGS_FILE, msgs);
    addLog('СМЕНА НИКА', `${oldUsername} сменил ник на ${newUsername}`);
  }
  
  const finalUsername = newUsername || oldUsername;
  if (avatar !== undefined) users[finalUsername].avatar = avatar;
  if (about !== undefined && users[finalUsername].role !== 'dev') users[finalUsername].about = about; 
  if (birthDate !== undefined) users[finalUsername].birthDate = birthDate;
  if (gender !== undefined) users[finalUsername].gender = gender;
  if (theme !== undefined) users[finalUsername].theme = theme;
  if (bgColor !== undefined) users[finalUsername].bgColor = bgColor;
  
  saveJSON(USERS_FILE, users);

  if (nameChanged) { io.emit('force_reload'); }
  
  res.json({ 
    ok: true, username: finalUsername, avatar: users[finalUsername].avatar, 
    about: users[finalUsername].about, birthDate: users[finalUsername].birthDate, gender: users[finalUsername].gender,
    theme: users[finalUsername].theme, bgColor: users[finalUsername].bgColor
  });
});

// --- УДАЛЕНИЕ АККАУНТА ---
app.post('/api/delete-account', (req, res) => {
  const { username, adminUsername } = req.body;
  const users = loadJSON(USERS_FILE, {});
  
  if (!users[username]) return res.status(400).json({ error: 'Пользователь не найден' });
  if (users[username].role === 'dev') return res.status(400).json({ error: 'Разработчика нельзя удалить' });

  if (adminUsername) {
    const admin = users[adminUsername];
    if (!admin) return res.status(403).json({ error: 'Админ не найден' });

    if (admin.role === 'apostle' && users[username].role !== 'imp') {
      return res.status(403).json({ error: 'Апостол может удалять только чертят' });
    } else if (admin.role !== 'dev' && admin.role !== 'apostle') {
      return res.status(403).json({ error: 'Недостаточно полномочий' });
    }
  } else {
    if (users[username].role === 'dev') return res.status(400).json({ error: 'Разработчика нельзя удалить' });
  }
  
  delete users[username];
  saveJSON(USERS_FILE, users);
  
  const msgs = loadJSON(MSGS_FILE, []);
  const filteredMsgs = msgs.filter(m => m.from !== username && m.to !== username);
  saveJSON(MSGS_FILE, filteredMsgs);
  
  addLog('УДАЛЕНИЕ', `Аккаунт ${username} стерт из базы`);

  for (const s of io.sockets.sockets.values()) {
    if (s.username === username) s.disconnect();
  }
  res.json({ ok: true });
});

// --- БАН ---
app.post('/api/ban', (req, res) => {
  const { adminUsername, targetUsername, banStatus } = req.body;
  const users = loadJSON(USERS_FILE, {});
  
  const admin = users[adminUsername];
  if (!admin || (admin.role !== 'dev' && admin.role !== 'apostle')) return res.status(403).json({ error: 'Недостаточно полномочий' });
  if (!users[targetUsername]) return res.status(400).json({ error: 'Пользователь не найден' });
  
  if (admin.role === 'apostle' && (users[targetUsername].role === 'dev' || users[targetUsername].role === 'apostle')) {
    return res.status(403).json({ error: 'Апостол не может банить вышестоящих' });
  }
  if (targetUsername === 'Кишима') return res.status(400).json({ error: 'Разработчика невозможно забанить' });

  users[targetUsername].isBanned = banStatus;
  saveJSON(USERS_FILE, users);
  
  addLog(banStatus ? 'БАН' : 'РАЗБАН', `${adminUsername} ${banStatus ? 'забанил' : 'разбанил'} ${targetUsername}`);

  if (banStatus) {
    for (const s of io.sockets.sockets.values()) {
      if (s.username === targetUsername) { s.emit('banned'); s.disconnect(); }
    }
  }
  res.json({ ok: true });
});

// --- СМЕНА РОЛИ ---
app.post('/api/set-role', (req, res) => {
  const { devUsername, targetUsername, role } = req.body;
  const users = loadJSON(USERS_FILE, {});
  
  if (!users[devUsername] || users[devUsername].role !== 'dev') {
    return res.status(403).json({ error: 'Только Разработчик может назначать Апостолов' });
  }
  if (targetUsername === 'Кишима') return res.status(400).json({ error: 'Нельзя менять роль Разработчика' });

  users[targetUsername].role = role;
  saveJSON(USERS_FILE, users);

  addLog('СМЕНА РОЛИ', `${devUsername} назначил ${targetUsername} на роль ${role}`);

  io.emit('roles_updated');
  for (const s of io.sockets.sockets.values()) {
    if (s.username === targetUsername) s.emit('your_role_changed', role);
  }
  res.json({ ok: true });
});

// --- ОТПРАВКА ЖАЛОБЫ ---
app.post('/api/report', (req, res) => {
  const { from, target, type, reason, customReason } = req.body;
  const reports = loadJSON(REPORTS_FILE, []);
  const newReport = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    time: Date.now(), from, target, type, reason,
    customReason: customReason || ''
  };
  reports.push(newReport);
  saveJSON(REPORTS_FILE, reports);
  
  addLog('ЖАЛОБА', `${from} пожаловался на ${target} (${reason})`);
  res.json({ ok: true });
});

// --- УДАЛЕНИЕ СООБЩЕНИЯ ---
app.post('/api/delete-message', (req, res) => {
  const { msgId, username, mode } = req.body;
  const messages = loadJSON(MSGS_FILE, []);
  
  const msgIndex = messages.findIndex(m => m.id === msgId);
  if (msgIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });
  
  const users = loadJSON(USERS_FILE, {});
  const isAuthor = messages[msgIndex].from === username;
  const isDev = users[username]?.role === 'dev';
  
  if (!isAuthor && !isDev) return res.status(403).json({ error: 'Нет прав на удаление' });
  
  if (mode === 'all') {
    messages.splice(msgIndex, 1);
    saveJSON(MSGS_FILE, messages);
    io.emit('message_deleted', msgId);
  } else {
    if (!messages[msgIndex].deletedFor) messages[msgIndex].deletedFor = [];
    messages[msgIndex].deletedFor.push(username);
    saveJSON(MSGS_FILE, messages);
    for (const s of io.sockets.sockets.values()) {
      if (s.username === username) s.emit('message_deleted', msgId);
    }
  }
  res.json({ ok: true });
});

// --- ПЕРЕСЫЛКА СООБЩЕНИЯ ---
app.post('/api/forward-message', (req, res) => {
  const { from, to, forwardedFrom, text, file, fileName } = req.body;
  const messages = loadJSON(MSGS_FILE, []);
  
  const newMsg = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2),
    time: Date.now(), from, to, text, file, fileName, forwardedFrom
  };
  
  messages.push(newMsg);
  saveJSON(MSGS_FILE, messages);
  
  for (const s of io.sockets.sockets.values()) {
    if (s.username === to || s.username === from) s.emit('new_message', newMsg);
  }
  
  res.json({ ok: true });
});

// --- ЗАКРЕПЛЕНИЕ СООБЩЕНИЯ ---
app.post('/api/pin-message', (req, res) => {
  const { msgId, username } = req.body;
  const messages = loadJSON(MSGS_FILE, []);
  
  const msgIndex = messages.findIndex(m => m.id === msgId);
  if (msgIndex === -1) return res.status(404).json({ error: 'Сообщение не найдено' });
  
  messages[msgIndex].isPinned = !messages[msgIndex].isPinned;
  saveJSON(MSGS_FILE, messages);
  
  io.emit('pins_updated', { chatFrom: messages[msgIndex].from, chatTo: messages[msgIndex].to });
  
  res.json({ ok: true, isPinned: messages[msgIndex].isPinned });
});

// --- ФАЙЛЫ ---
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomBytes(8).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ url: '/uploads/' + req.file.filename, name: req.file.originalname });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('login', (username) => {
    socket.username = username;
    
    if (disconnectTimers[username]) {
      clearTimeout(disconnectTimers[username]);
      delete disconnectTimers[username];
    } else {
      addLog('ВХОД', `Пользователь ${username} вошел в сеть`);
    }

    const users = loadJSON(USERS_FILE, {});
    if (users[username]) { users[username].lastSeen = Date.now(); saveJSON(USERS_FILE, users); }
    
    io.emit('users_online', [...io.sockets.sockets.values()].filter(s => s.username).map(s => s.username));
  });

  socket.on('typing', ({ to, isTyping }) => {
    for (const s of io.sockets.sockets.values()) {
      if (s.username === to) s.emit('user_typing', { from: socket.username, isTyping });
    }
  });

  socket.on('send_message', (msg) => {
    const messages = loadJSON(MSGS_FILE, []);
    const full = { ...msg, id: Date.now() + '-' + Math.random().toString(36).slice(2), time: Date.now() };
    messages.push(full);
    saveJSON(MSGS_FILE, messages);

    let logText = msg.text ? (msg.text.length > 20 ? msg.text.slice(0, 20) + '...' : msg.text) : '[Файл]';
    addLog('СООБЩЕНИЕ', `${socket.username} -> ${msg.to}: "${logText}"`);

    const users = loadJSON(USERS_FILE, {});
    for (const s of io.sockets.sockets.values()) {
      if (!s.username) continue;
      if (s.username === msg.to || s.username === msg.from || users[s.username]?.role === 'dev') {
        s.emit('new_message', full);
      }
    }
  });

  socket.on('history', ({ user1, user2 }, cb) => {
    const messages = loadJSON(MSGS_FILE, []);
    const filtered = messages.filter(m => 
      ((m.from === user1 && m.to === user2) || (m.from === user2 && m.to === user1)) &&
      (!m.deletedFor || !m.deletedFor.includes(user1))
    );
    const pins = filtered.filter(m => m.isPinned);
    cb({ messages: filtered, pins: pins });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      const username = socket.username;
      
      disconnectTimers[username] = setTimeout(() => {
        addLog('ВЫХОД', `Пользователь ${username} отключился`);
        
        const users = loadJSON(USERS_FILE, {});
        if (users[username]) { users[username].lastSeen = Date.now(); saveJSON(USERS_FILE, users); }
        
        delete disconnectTimers[username];
        io.emit('users_online', [...io.sockets.sockets.values()].filter(s => s.username).map(s => s.username));
      }, 5000);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n😈 Сеть КВАЗАР запущена: http://localhost:${PORT}\n`);
  console.log('Владыка (Разработчик): логин "Кишима", пароль "Kishima4680"');
});