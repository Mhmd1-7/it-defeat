const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

// In-memory storage (replace with database in production)
let users = {};
let chats = {};
let messages = {};
let contacts = {};
let nextUserId = 1000;
let nextChatId = 1;

// Generate unique QfChat number
function generateQfChatNumber() {
  return nextUserId++;
}

// API Routes
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;

  // Check if username exists
  const existingUser = Object.values(users).find(u => u.username === username);
  if (existingUser) {
    return res.json({ success: false, message: 'Username already exists' });
  }

  const qfNumber = generateQfChatNumber();
  const userId = Date.now().toString();

  users[userId] = {
    id: userId,
    username,
    password,
    qfNumber,
    createdAt: new Date()
  };

  contacts[userId] = {};

  res.json({ 
    success: true, 
    user: { 
      id: userId, 
      username, 
      qfNumber 
    } 
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = Object.values(users).find(u => 
    u.username === username && u.password === password
  );

  if (user) {
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        qfNumber: user.qfNumber 
      } 
    });
  } else {
    res.json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/search-user', (req, res) => {
  const { qfNumber } = req.body;
  const user = Object.values(users).find(u => u.qfNumber == qfNumber);

  if (user) {
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        qfNumber: user.qfNumber 
      } 
    });
  } else {
    res.json({ success: false, message: 'User not found' });
  }
});

app.post('/api/add-contact', (req, res) => {
  const { userId, contactId, nickname } = req.body;

  if (!contacts[userId]) contacts[userId] = {};

  contacts[userId][contactId] = {
    contactId,
    nickname,
    addedAt: new Date()
  };

  res.json({ success: true });
});

app.get('/api/contacts/:userId', (req, res) => {
  const { userId } = req.params;
  const userContacts = contacts[userId] || {};

  const contactList = Object.values(userContacts).map(contact => {
    const user = users[contact.contactId];
    return {
      ...contact,
      username: user ? user.username : 'Unknown',
      qfNumber: user ? user.qfNumber : null
    };
  });

  res.json({ contacts: contactList });
});

app.get('/api/chats/:userId', (req, res) => {
  const { userId } = req.params;
  const userChats = Object.values(chats).filter(chat => 
    chat.participants.includes(userId)
  );

  res.json({ chats: userChats });
});

app.get('/api/messages/:chatId', (req, res) => {
  const { chatId } = req.params;
  const chatMessages = messages[chatId] || [];
  res.json({ messages: chatMessages });
});

// Socket.io for real-time messaging
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
  });

  socket.on('send-message', (data) => {
    const { chatId, senderId, content, senderName } = data;

    if (!messages[chatId]) messages[chatId] = [];

    const message = {
      id: Date.now().toString(),
      senderId,
      senderName,
      content,
      timestamp: new Date()
    };

    messages[chatId].push(message);

    io.to(chatId).emit('new-message', message);
  });

  socket.on('create-dm', (data) => {
    const { userId, contactId } = data;

    // Check if DM already exists
    const existingChat = Object.values(chats).find(chat => 
      chat.type === 'dm' && 
      chat.participants.includes(userId) && 
      chat.participants.includes(contactId)
    );

    if (existingChat) {
      socket.emit('dm-created', existingChat);
      return;
    }

    const chatId = `dm_${nextChatId++}`;
    const chat = {
      id: chatId,
      type: 'dm',
      participants: [userId, contactId],
      createdAt: new Date()
    };

    chats[chatId] = chat;
    socket.emit('dm-created', chat);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QfChat</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5;
            height: 100vh;
            overflow: hidden;
        }

        .app-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background: #5D5CDE;
            color: white;
            padding: 1rem;
            text-align: center;
            font-size: 1.5rem;
            font-weight: bold;
        }

        .auth-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }

        .auth-form {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }

        .auth-form h2 {
            margin-bottom: 1.5rem;
            text-align: center;
            color: #333;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: #555;
            font-weight: 500;
        }

        .form-group input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e1e5e9;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        .form-group input:focus {
            outline: none;
            border-color: #5D5CDE;
        }

        .btn {
            width: 100%;
            padding: 0.75rem;
            background: #5D5CDE;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s;
            margin-bottom: 1rem;
        }

        .btn:hover {
            background: #4a49c7;
        }

        .btn-secondary {
            background: #6c757d;
        }

        .btn-secondary:hover {
            background: #5a6268;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .chat-tabs {
            display: flex;
            background: white;
            border-bottom: 1px solid #e1e5e9;
        }

        .chat-tab {
            flex: 1;
            padding: 1rem;
            text-align: center;
            cursor: pointer;
            transition: background-color 0.3s;
            border-bottom: 2px solid transparent;
        }

        .chat-tab.active {
            border-bottom-color: #5D5CDE;
            color: #5D5CDE;
        }

        .chat-tab:hover {
            background: #f8f9fa;
        }

        .chat-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .chat-list {
            width: 300px;
            background: white;
            border-right: 1px solid #e1e5e9;
            overflow-y: auto;
        }

        .chat-messages {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #f8f9fa;
        }

        .chat-item {
            padding: 1rem;
            border-bottom: 1px solid #e1e5e9;
            cursor: pointer;
            transition: background-color 0.3s;
        }

        .chat-item:hover {
            background: #f8f9fa;
        }

        .chat-item.active {
            background: #e7f3ff;
        }

        .messages-container {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
        }

        .message {
            margin-bottom: 1rem;
            padding: 0.75rem;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .message.own {
            background: #5D5CDE;
            color: white;
            margin-left: 25%;
        }

        .message-sender {
            font-weight: bold;
            margin-bottom: 0.25rem;
            font-size: 0.9rem;
        }

        .message-content {
            margin-bottom: 0.25rem;
        }

        .message-time {
            font-size: 0.8rem;
            opacity: 0.7;
        }

        .message-input-container {
            padding: 1rem;
            background: white;
            border-top: 1px solid #e1e5e9;
            display: flex;
            gap: 0.5rem;
        }

        .message-input {
            flex: 1;
            padding: 0.75rem;
            border: 2px solid #e1e5e9;
            border-radius: 24px;
            font-size: 16px;
        }

        .send-btn {
            padding: 0.75rem 1.5rem;
            background: #5D5CDE;
            color: white;
            border: none;
            border-radius: 24px;
            cursor: pointer;
        }

        .add-contact-form {
            padding: 1rem;
            background: white;
            border-bottom: 1px solid #e1e5e9;
        }

        .search-form {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
        }

        .search-input {
            flex: 1;
            padding: 0.5rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }

        .search-btn {
            padding: 0.5rem 1rem;
            background: #5D5CDE;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .search-result {
            padding: 0.75rem;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 1rem;
        }

        .nickname-input {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin: 0.5rem 0;
            font-size: 16px;
        }

        .hidden {
            display: none;
        }

        .user-info {
            padding: 1rem;
            background: white;
            text-align: center;
            border-bottom: 1px solid #e1e5e9;
        }

        @media (max-width: 768px) {
            .chat-content {
                flex-direction: column;
            }

            .chat-list {
                width: 100%;
                max-height: 40vh;
            }

            .chat-messages {
                min-height: 60vh;
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <div class="header">
            QfChat
        </div>

        <!-- Authentication Screen -->
        <div id="auth-screen" class="auth-container">
            <div class="auth-form">
                <div id="login-form">
                    <h2>Login to QfChat</h2>
                    <div class="form-group">
                        <label for="login-username">Username</label>
                        <input type="text" id="login-username" required>
                    </div>
                    <div class="form-group">
                        <label for="login-password">Password</label>
                        <input type="password" id="login-password" required>
                    </div>
                    <button class="btn" onclick="login()">Login</button>
                    <button class="btn btn-secondary" onclick="showSignup()">Sign Up</button>
                </div>

                <div id="signup-form" class="hidden">
                    <h2>Sign Up for QfChat</h2>
                    <div class="form-group">
                        <label for="signup-username">Username</label>
                        <input type="text" id="signup-username" required>
                    </div>
                    <div class="form-group">
                        <label for="signup-password">Password</label>
                        <input type="password" id="signup-password" required>
                    </div>
                    <button class="btn" onclick="signup()">Create Account</button>
                    <button class="btn btn-secondary" onclick="showLogin()">Back to Login</button>
                </div>
            </div>
        </div>

        <!-- Chat Screen -->
        <div id="chat-screen" class="chat-container hidden">
            <div class="user-info">
                <strong id="user-display"></strong>
                <button class="btn" onclick="logout()" style="margin-left: 1rem; width: auto; padding: 0.5rem 1rem;">Logout</button>
            </div>

            <div class="chat-tabs">
                <div class="chat-tab active" onclick="switchTab('all')">All</div>
                <div class="chat-tab" onclick="switchTab('groups')">Group Chats</div>
                <div class="chat-tab" onclick="switchTab('dms')">DMs</div>
            </div>

            <div class="chat-content">
                <div class="chat-list">
                    <div id="all-tab" class="tab-content">
                        <div id="all-chats">
                            <div class="chat-item">
                                <strong>General Chat</strong>
                                <div style="font-size: 0.9rem; color: #666;">Welcome to QfChat!</div>
                            </div>
                        </div>
                    </div>

                    <div id="groups-tab" class="tab-content hidden">
                        <div id="group-chats">
                            <div class="chat-item">
                                <strong>General Chat</strong>
                                <div style="font-size: 0.9rem; color: #666;">Welcome to QfChat!</div>
                            </div>
                        </div>
                    </div>

                    <div id="dms-tab" class="tab-content hidden">
                        <div class="add-contact-form">
                            <h3>Add Contact</h3>
                            <div class="search-form">
                                <input type="number" id="search-qf-number" placeholder="Enter QfChat Number" class="search-input">
                                <button class="search-btn" onclick="searchUser()">Search</button>
                            </div>
                            <div id="search-result"></div>
                        </div>
                        <div id="dm-chats"></div>
                    </div>
                </div>

                <div class="chat-messages">
                    <div class="messages-container" id="messages-container">
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            Select a chat to start messaging
                        </div>
                    </div>
                    <div class="message-input-container hidden" id="message-input-container">
                        <input type="text" id="message-input" placeholder="Type a message..." class="message-input">
                        <button class="send-btn" onclick="sendMessage()">Send</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentUser = null;
        let socket = null;
        let currentChat = null;
        let currentTab = 'all';

        // Initialize app
        function init() {
            const savedUser = localStorage.getItem('qfchat-user');
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
                showChatScreen();
                initSocket();
            } else {
                showAuthScreen();
            }
        }

        function showAuthScreen() {
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('chat-screen').classList.add('hidden');
        }

        function showChatScreen() {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('chat-screen').classList.remove('hidden');
            document.getElementById('user-display').textContent = \`\${currentUser.username} (QfChat #\${currentUser.qfNumber})\`;
            loadContacts();
        }

        function showLogin() {
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('signup-form').classList.add('hidden');
        }

        function showSignup() {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('signup-form').classList.remove('hidden');
        }

        async function login() {
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;

            if (!username || !password) {
                alert('Please fill in all fields');
                return;
            }

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    currentUser = data.user;
                    localStorage.setItem('qfchat-user', JSON.stringify(currentUser));
                    showChatScreen();
                    initSocket();
                } else {
                    alert(data.message);
                }
            } catch (error) {
                alert('Login failed. Please try again.');
            }
        }

        async function signup() {
            const username = document.getElementById('signup-username').value;
            const password = document.getElementById('signup-password').value;

            if (!username || !password) {
                alert('Please fill in all fields');
                return;
            }

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    alert(\`Account created! Your QfChat Number is: \${data.user.qfNumber}\`);
                    currentUser = data.user;
                    localStorage.setItem('qfchat-user', JSON.stringify(currentUser));
                    showChatScreen();
                    initSocket();
                } else {
                    alert(data.message);
                }
            } catch (error) {
                alert('Signup failed. Please try again.');
            }
        }

        function logout() {
            localStorage.removeItem('qfchat-user');
            currentUser = null;
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            showAuthScreen();
        }

        function initSocket() {
            socket = io();

            socket.on('new-message', (message) => {
                if (currentChat && message.chatId === currentChat.id) {
                    displayMessage(message);
                }
            });

            socket.on('dm-created', (chat) => {
                loadContacts();
                openChat(chat);
            });
        }

        function switchTab(tab) {
            currentTab = tab;

            // Update tab appearance
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');

            // Show/hide content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            document.getElementById(\`\${tab}-tab\`).classList.remove('hidden');
        }

        async function searchUser() {
            const qfNumber = document.getElementById('search-qf-number').value;

            if (!qfNumber) {
                alert('Please enter a QfChat Number');
                return;
            }

            try {
                const response = await fetch('/api/search-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qfNumber: parseInt(qfNumber) })
                });

                const data = await response.json();

                if (data.success) {
                    showSearchResult(data.user);
                } else {
                    alert(data.message);
                }
            } catch (error) {
                alert('Search failed. Please try again.');
            }
        }

        function showSearchResult(user) {
            const resultDiv = document.getElementById('search-result');
            resultDiv.innerHTML = \`
                <div class="search-result">
                    <strong>\${user.username}</strong> (QfChat #\${user.qfNumber})
                    <input type="text" placeholder="Enter nickname (optional)" class="nickname-input" id="nickname-input">
                    <button class="btn" onclick="addContact('\${user.id}', '\${user.username}')">Add Contact</button>
                </div>
            \`;
        }

        async function addContact(contactId, username) {
            const nickname = document.getElementById('nickname-input').value || username;

            try {
                const response = await fetch('/api/add-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        userId: currentUser.id, 
                        contactId, 
                        nickname 
                    })
                });

                const data = await response.json();

                if (data.success) {
                    alert('Contact added successfully!');
                    document.getElementById('search-result').innerHTML = '';
                    document.getElementById('search-qf-number').value = '';
                    loadContacts();
                }
            } catch (error) {
                alert('Failed to add contact. Please try again.');
            }
        }

        async function loadContacts() {
            try {
                const response = await fetch(\`/api/contacts/\${currentUser.id}\`);
                const data = await response.json();

                const dmChats = document.getElementById('dm-chats');
                dmChats.innerHTML = '';

                data.contacts.forEach(contact => {
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.innerHTML = \`
                        <strong>\${contact.nickname}</strong>
                        <div style="font-size: 0.9rem; color: #666;">QfChat #\${contact.qfNumber}</div>
                    \`;
                    chatItem.onclick = () => createDM(contact.contactId);
                    dmChats.appendChild(chatItem);
                });
            } catch (error) {
                console.error('Failed to load contacts:', error);
            }
        }

        function createDM(contactId) {
            if (socket) {
                socket.emit('create-dm', { userId: currentUser.id, contactId });
            }
        }

        function openChat(chat) {
            currentChat = chat;

            // Update active chat in UI
            document.querySelectorAll('.chat-item').forEach(item => {
                item.classList.remove('active');
            });

            // Show message input
            document.getElementById('message-input-container').classList.remove('hidden');

            // Load messages
            loadMessages(chat.id);

            // Join chat room
            if (socket) {
                socket.emit('join-chat', chat.id);
            }
        }

        async function loadMessages(chatId) {
            try {
                const response = await fetch(\`/api/messages/\${chatId}\`);
                const data = await response.json();

                const container = document.getElementById('messages-container');
                container.innerHTML = '';

                data.messages.forEach(message => {
                    displayMessage(message);
                });

                container.scrollTop = container.scrollHeight;
            } catch (error) {
                console.error('Failed to load messages:', error);
            }
        }

        function displayMessage(message) {
            const container = document.getElementById('messages-container');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${message.senderId === currentUser.id ? 'own' : ''}\`;

            messageDiv.innerHTML = \`
                <div class="message-sender">\${message.senderName}</div>
                <div class="message-content">\${message.content}</div>
                <div class="message-time">\${new Date(message.timestamp).toLocaleTimeString()}</div>
            \`;

            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function sendMessage() {
            const input = document.getElementById('message-input');
            const content = input.value.trim();

            if (!content || !currentChat || !socket) return;

            socket.emit('send-message', {
                chatId: currentChat.id,
                senderId: currentUser.id,
                senderName: currentUser.username,
                content
            });

            input.value = '';
        }

        // Enter key to send message
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('message-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        });

        // Initialize app
        init();
    </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`QfChat server running on port ${PORT}`);
});