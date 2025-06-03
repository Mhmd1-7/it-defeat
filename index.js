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
let nextChatId = 1;

// Generate unique 6-digit QfChat number
function generateQfChatNumber() {
  let qfNumber;
  let isUnique = false;

  while (!isUnique) {
    // Generate random 6-digit number (100000-999999)
    qfNumber = Math.floor(Math.random() * 900000) + 100000;

    // Check if this number already exists
    const existingUser = Object.values(users).find(u => u.qfNumber === qfNumber);
    if (!existingUser) {
      isUnique = true;
    }
  }

  return qfNumber;
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

// Serve the main HTML file - simplified version without loading issues
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QfChat</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="/socket.io/socket.io.js"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: {
                            50: '#f0f9ff',
                            100: '#e0f2fe',
                            200: '#bae6fd',
                            300: '#7dd3fc',
                            400: '#38bdf8',
                            500: '#0ea5e9',
                            600: '#0284c7',
                            700: '#0369a1',
                            800: '#075985',
                            900: '#0c4a6e',
                        },
                        secondary: {
                            50: '#f8fafc',
                            100: '#f1f5f9',
                            200: '#e2e8f0',
                            300: '#cbd5e1',
                            400: '#94a3b8',
                            500: '#64748b',
                            600: '#475569',
                            700: '#334155',
                            800: '#1e293b',
                            900: '#0f172a',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        .chat-bubble-sent { border-radius: 18px 18px 0 18px; }
        .chat-bubble-received { border-radius: 18px 18px 18px 0; }

        .number-input::-webkit-inner-spin-button,
        .number-input::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .number-input { -moz-appearance: textfield; }
    </style>
</head>
<body class="bg-gray-100 dark:bg-secondary-900 min-h-screen">
    <!-- Main App Container -->
    <div id="app" class="max-w-screen-xl mx-auto">
        <!-- Login/Signup Container -->
        <div id="auth-container" class="flex flex-col items-center justify-center min-h-screen p-4">
            <div class="w-full max-w-md bg-white dark:bg-secondary-800 rounded-lg shadow-md overflow-hidden">
                <!-- Auth Header -->
                <div class="flex justify-center p-6 bg-primary-600">
                    <div class="text-4xl text-white flex items-center space-x-2">
                        <i class="fas fa-comments"></i>
                        <span class="font-bold">QfChat</span>
                    </div>
                </div>

                <!-- Auth Tabs -->
                <div class="flex border-b border-gray-200">
                    <button id="login-tab" class="w-1/2 py-3 px-4 text-center font-medium text-primary-600 bg-white focus:outline-none">
                        Login
                    </button>
                    <button id="signup-tab" class="w-1/2 py-3 px-4 text-center font-medium text-gray-500 bg-gray-50 focus:outline-none">
                        Sign Up
                    </button>
                </div>

                <!-- Login Form -->
                <div id="login-form" class="p-6">
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Username</label>
                        <input type="text" id="login-username" class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Enter your username">
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Password</label>
                        <input type="password" id="login-password" class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Enter your password">
                    </div>
                    <button id="login-button" class="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md transition duration-200">
                        Login
                    </button>
                </div>

                <!-- Signup Form -->
                <div id="signup-form" class="p-6 hidden">
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Username</label>
                        <input type="text" id="signup-username" class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Choose a username">
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Password</label>
                        <input type="password" id="signup-password" class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Create a password">
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Your QfChat Code</label>
                        <div class="bg-gray-50 p-3 rounded-md text-center">
                            <div id="user-code" class="text-2xl font-mono text-primary-600 mb-2">123456</div>
                            <p class="text-xs text-gray-500">Share this code with friends to connect!</p>
                        </div>
                    </div>
                    <button id="signup-button" class="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md transition duration-200">
                        Create Account
                    </button>
                </div>
            </div>
        </div>

        <!-- Main App Interface -->
        <div id="main-container" class="hidden h-screen flex flex-col md:flex-row">
            <!-- Sidebar -->
            <div class="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col h-full">
                <!-- Sidebar Header -->
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <div class="flex items-center space-x-2">
                        <div class="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <h2 id="user-name-display" class="font-medium text-gray-800">User Name</h2>
                            <span class="text-xs text-gray-500" id="user-code-display">123456</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <button id="add-contact-button" class="text-gray-500 hover:text-primary-600 focus:outline-none">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button id="logout-button" class="text-gray-500 hover:text-red-500 focus:outline-none">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>

                <!-- Contacts List -->
                <div id="contacts-list" class="flex-1 overflow-y-auto">
                    <div class="p-8 text-center text-gray-500">
                        <i class="fas fa-user-friends text-4xl mb-4"></i>
                        <p>No contacts yet</p>
                        <p class="text-sm mt-2">Add someone using their QfChat code</p>
                    </div>
                </div>
            </div>

            <!-- Main Chat Area -->
            <div class="flex-1 flex flex-col h-full bg-gray-50">
                <!-- Empty State -->
                <div id="empty-state" class="h-full flex flex-col items-center justify-center p-6">
                    <div class="w-24 h-24 mb-6 bg-gray-200 rounded-full flex items-center justify-center">
                        <i class="fas fa-comments text-4xl text-gray-400"></i>
                    </div>
                    <h3 class="text-xl font-medium text-gray-700 mb-2">No Conversation Selected</h3>
                    <p class="text-gray-500 text-center max-w-md">
                        Select a contact from the list or add a new contact to start chatting
                    </p>
                    <button id="empty-add-contact" class="mt-6 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md flex items-center">
                        <i class="fas fa-user-plus mr-2"></i>
                        Add New Contact
                    </button>
                </div>

                <!-- Chat Interface -->
                <div id="chat-interface" class="h-full flex flex-col hidden">
                    <!-- Chat Header -->
                    <div class="py-3 px-4 border-b border-gray-200 bg-white flex items-center">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <h3 id="contact-name" class="font-medium text-gray-800">Contact Name</h3>
                                <div class="text-xs text-gray-500">Online</div>
                            </div>
                        </div>
                    </div>

                    <!-- Messages Area -->
                    <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4">
                        <!-- Messages will be added here -->
                    </div>

                    <!-- Message Input -->
                    <div class="p-4 border-t border-gray-200 bg-white">
                        <div class="flex items-center space-x-2">
                            <textarea id="message-input" class="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" placeholder="Type a message..." rows="1"></textarea>
                            <button id="send-button" class="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Contact Modal -->
        <div id="add-contact-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="p-6 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-800">Add New Contact</h3>
                    <button id="close-add-contact" class="text-gray-500 hover:text-gray-700 focus:outline-none">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="p-6">
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Contact's QfChat Code</label>
                        <input type="number" id="contact-code" class="number-input w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Enter 6-digit code">
                    </div>
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-medium mb-2">Nickname (Optional)</label>
                        <input type="text" id="contact-nickname" class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Add a nickname">
                    </div>
                    <button id="submit-add-contact" class="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-md">
                        Add Contact
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // App state
        let currentUser = null;
        let socket = null;
        let currentChat = null;

        // Initialize app when page loads
        window.addEventListener('load', function() {
            console.log('App loaded');

            // Check for saved user
            const savedUser = localStorage.getItem('qfchat-user');
            if (savedUser) {
                try {
                    currentUser = JSON.parse(savedUser);
                    showMainApp();
                    initSocket();
                    loadContacts();
                } catch (e) {
                    console.error('Error loading saved user:', e);
                    localStorage.removeItem('qfchat-user');
                }
            }

            setupEventListeners();
        });

        function setupEventListeners() {
            // Auth tabs
            document.getElementById('login-tab').addEventListener('click', function() {
                this.classList.add('text-primary-600', 'bg-white');
                this.classList.remove('text-gray-500', 'bg-gray-50');

                document.getElementById('signup-tab').classList.remove('text-primary-600', 'bg-white');
                document.getElementById('signup-tab').classList.add('text-gray-500', 'bg-gray-50');

                document.getElementById('login-form').classList.remove('hidden');
                document.getElementById('signup-form').classList.add('hidden');
            });

            document.getElementById('signup-tab').addEventListener('click', function() {
                this.classList.add('text-primary-600', 'bg-white');
                this.classList.remove('text-gray-500', 'bg-gray-50');

                document.getElementById('login-tab').classList.remove('text-primary-600', 'bg-white');
                document.getElementById('login-tab').classList.add('text-gray-500', 'bg-gray-50');

                document.getElementById('signup-form').classList.remove('hidden');
                document.getElementById('login-form').classList.add('hidden');

                // Generate random code
                const randomCode = Math.floor(100000 + Math.random() * 900000);
                document.getElementById('user-code').textContent = randomCode;
            });

            // Login
            document.getElementById('login-button').addEventListener('click', login);

            // Signup
            document.getElementById('signup-button').addEventListener('click', signup);

            // Logout
            document.getElementById('logout-button').addEventListener('click', logout);

            // Modal controls
            document.getElementById('add-contact-button').addEventListener('click', () => openModal('add-contact-modal'));
            document.getElementById('empty-add-contact').addEventListener('click', () => openModal('add-contact-modal'));
            document.getElementById('close-add-contact').addEventListener('click', () => closeModal('add-contact-modal'));

            // Add contact
            document.getElementById('submit-add-contact').addEventListener('click', addContact);

            // Send message
            document.getElementById('send-button').addEventListener('click', sendMessage);
            document.getElementById('message-input').addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        async function login() {
            const username = document.getElementById('login-username').value.trim();
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
                    showMainApp();
                    initSocket();
                    loadContacts();
                    alert('Welcome back!');
                } else {
                    alert(data.message);
                }
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed. Please try again.');
            }
        }

        async function signup() {
            const username = document.getElementById('signup-username').value.trim();
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
                    currentUser = data.user;
                    localStorage.setItem('qfchat-user', JSON.stringify(currentUser));
                    showMainApp();
                    initSocket();
                    alert(\`Welcome! Your QfChat code is \${data.user.qfNumber}\`);
                } else {
                    alert(data.message);
                }
            } catch (error) {
                console.error('Signup error:', error);
                alert('Signup failed. Please try again.');
            }
        }

        function showMainApp() {
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('main-container').classList.remove('hidden');
            document.getElementById('user-name-display').textContent = currentUser.username;
            document.getElementById('user-code-display').textContent = currentUser.qfNumber;
        }

        function initSocket() {
            socket = io();

            socket.on('connect', () => {
                console.log('Connected to server');
            });

            socket.on('new-message', (message) => {
                if (currentChat && currentChat.id) {
                    displayMessage(message);
                    scrollToBottom();
                }
            });

            socket.on('dm-created', (chat) => {
                openChat(chat);
                loadContacts();
            });
        }

        function logout() {
            localStorage.removeItem('qfchat-user');
            currentUser = null;
            currentChat = null;
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            document.getElementById('main-container').classList.add('hidden');
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        }

        function openModal(modalId) {
            document.getElementById(modalId).classList.remove('hidden');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.add('hidden');
        }

        async function addContact() {
            const contactCode = parseInt(document.getElementById('contact-code').value);
            const nickname = document.getElementById('contact-nickname').value.trim();

            if (!contactCode || contactCode.toString().length !== 6) {
                alert('Please enter a valid 6-digit code');
                return;
            }

            try {
                // Search for user
                const searchResponse = await fetch('/api/search-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qfNumber: contactCode })
                });

                const searchData = await searchResponse.json();

                if (!searchData.success) {
                    alert('User not found');
                    return;
                }

                // Add contact
                const addResponse = await fetch('/api/add-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.id,
                        contactId: searchData.user.id,
                        nickname: nickname || searchData.user.username
                    })
                });

                const addData = await addResponse.json();

                if (addData.success) {
                    document.getElementById('contact-code').value = '';
                    document.getElementById('contact-nickname').value = '';
                    closeModal('add-contact-modal');
                    loadContacts();
                    alert('Contact added successfully!');
                }
            } catch (error) {
                console.error('Add contact error:', error);
                alert('Failed to add contact');
            }
        }

        async function loadContacts() {
            try {
                const response = await fetch(\`/api/contacts/\${currentUser.id}\`);
                const data = await response.json();

                const contactsList = document.getElementById('contacts-list');

                if (data.contacts.length === 0) {
                    contactsList.innerHTML = \`
                        <div class="p-8 text-center text-gray-500">
                            <i class="fas fa-user-friends text-4xl mb-4"></i>
                            <p>No contacts yet</p>
                            <p class="text-sm mt-2">Add someone using their QfChat code</p>
                        </div>
                    \`;
                    return;
                }

                contactsList.innerHTML = '';

                data.contacts.forEach(contact => {
                    const contactItem = document.createElement('div');
                    contactItem.className = 'flex items-center px-4 py-3 cursor-pointer hover:bg-gray-100 border-b border-gray-200';
                    contactItem.innerHTML = \`
                        <div class="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 mr-3">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="flex-1">
                            <h4 class="font-medium text-gray-800">\${contact.nickname}</h4>
                            <p class="text-sm text-gray-500">QfChat #\${contact.qfNumber}</p>
                        </div>
                    \`;
                    contactItem.addEventListener('click', () => createDM(contact.contactId, contact));
                    contactsList.appendChild(contactItem);
                });
            } catch (error) {
                console.error('Load contacts error:', error);
            }
        }

        function createDM(contactId, contact) {
            if (socket) {
                socket.emit('create-dm', { userId: currentUser.id, contactId });
                currentChat = { contact: contact };
            }
        }

        function openChat(chat) {
            currentChat = chat;

            document.getElementById('empty-state').classList.add('hidden');
            document.getElementById('chat-interface').classList.remove('hidden');

            if (currentChat.contact) {
                document.getElementById('contact-name').textContent = currentChat.contact.nickname;
            }

            loadMessages();

            if (socket) {
                socket.emit('join-chat', chat.id);
            }
        }

        async function loadMessages() {
            if (!currentChat || !currentChat.id) return;

            try {
                const response = await fetch(\`/api/messages/\${currentChat.id}\`);
                const data = await response.json();

                const container = document.getElementById('chat-messages');
                container.innerHTML = '';

                data.messages.forEach(message => {
                    displayMessage(message);
                });

                scrollToBottom();
            } catch (error) {
                console.error('Load messages error:', error);
            }
        }

        function displayMessage(message) {
            const container = document.getElementById('chat-messages');
            const messageDiv = document.createElement('div');
            const isOwn = message.senderId === currentUser.id;

            messageDiv.className = isOwn ? 'flex justify-end mb-4' : 'flex justify-start mb-4';

            const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (isOwn) {
                messageDiv.innerHTML = \`
                    <div class="bg-primary-600 text-white rounded-lg py-2 px-3 max-w-xs chat-bubble-sent">
                        <p class="text-sm">\${message.content}</p>
                        <span class="text-xs opacity-70 block text-right mt-1">\${time}</span>
                    </div>
                \`;
            } else {
                messageDiv.innerHTML = \`
                    <div class="bg-white rounded-lg py-2 px-3 max-w-xs chat-bubble-received shadow">
                        <p class="text-sm text-gray-800">\${message.content}</p>
                        <span class="text-xs text-gray-500 block mt-1">\${time}</span>
                    </div>
                \`;
            }

            container.appendChild(messageDiv);
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

        function scrollToBottom() {
            const container = document.getElementById('chat-messages');
            container.scrollTop = container.scrollHeight;
        }
    </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`QfChat server running on port ${PORT}`);
});