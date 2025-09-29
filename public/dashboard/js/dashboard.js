/**
 * 🎄 Dashboard Operatori - Lucine di Natale
 * Sistema di gestione completo per operatori support
 */

class DashboardApp {
    constructor() {
        this.currentOperator = null;
        this.currentSection = 'overview';
        this.activeChat = null;
        this.refreshInterval = null;
        this.websocket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // API Configuration
        this.apiBase = window.location.origin + '/api';
        this.wsUrl = window.location.origin.replace('http', 'ws');
        
        this.init();
    }

    /**
     * 🚀 Inizializzazione applicazione
     */
    init() {
        console.log('🚀 Dashboard App inizializzato');
        console.log('📡 API Base:', this.apiBase);
        
        this.setupEventListeners();
        this.checkAuthStatus();
        
        // Auto refresh ogni 30 secondi (fallback se WebSocket non funziona)
        this.refreshInterval = setInterval(() => {
            if (this.currentOperator) {
                this.refreshData();
            }
        }, 30000);
    }

    /**
     * 🎯 Setup Event Listeners
     */
    setupEventListeners() {
        // Login Form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Logout Button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Status Toggle
        const statusToggle = document.getElementById('toggle-status');
        if (statusToggle) {
            statusToggle.addEventListener('click', () => this.toggleOperatorStatus());
        }

        // Navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.switchSection(section);
            });
        });

        // Refresh Buttons
        const refreshBtn = document.getElementById('refresh-chats');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshChats());
        }
        
        const refreshAllChatsBtn = document.getElementById('refresh-all-chats');
        if (refreshAllChatsBtn) {
            refreshAllChatsBtn.addEventListener('click', () => this.loadAllChatsData());
        }
        
        // Status Filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.loadAllChatsData());
        }
    }

    /**
     * 🔐 Controllo stato autenticazione
     */
    checkAuthStatus() {
        const savedOperator = localStorage.getItem('operator_session');
        if (savedOperator) {
            try {
                this.currentOperator = JSON.parse(savedOperator);
                this.showDashboard();
                this.refreshData();
            } catch (error) {
                console.error('❌ Invalid session data:', error);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    /**
     * 🔑 Gestione login
     */
    async handleLogin(event) {
        event.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        
        if (!username || !password) {
            this.showError(errorDiv, 'Username e password sono obbligatori');
            return;
        }
        
        try {
            console.log('🔐 Attempting login...');
            
            const response = await fetch(`${this.apiBase}/operators/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log('✅ Login successful:', data.operator);
                
                this.currentOperator = data.operator;
                this.authToken = data.token;
                
                // Salva sessione
                localStorage.setItem('operator_session', JSON.stringify(this.currentOperator));
                localStorage.setItem('auth_token', this.authToken);
                
                // Nascondi errori e mostra dashboard
                errorDiv.textContent = '';
                this.showDashboard();
                this.refreshData();
                
                this.showToast('Login effettuato con successo', 'success');
                
            } else {
                console.error('❌ Login failed:', data.error);
                this.showError(errorDiv, data.error || 'Credenziali non valide');
            }
            
        } catch (error) {
            console.error('❌ Login error:', error);
            this.showError(errorDiv, 'Errore di connessione al server');
        }
    }

    /**
     * 🚪 Gestione logout
     */
    async handleLogout() {
        try {
            if (this.currentOperator) {
                await fetch(`${this.apiBase}/operators/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        operatorId: this.currentOperator.id 
                    })
                });
            }
        } catch (error) {
            console.error('❌ Logout error:', error);
        }
        
        // Cleanup locale
        this.currentOperator = null;
        this.authToken = null;
        localStorage.removeItem('operator_session');
        localStorage.removeItem('auth_token');
        
        // Disconnetti WebSocket
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        this.showLogin();
        this.showToast('Logout effettuato', 'info');
    }

    /**
     * 📱 Mostra schermata login
     */
    showLogin() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('dashboard-screen').style.display = 'none';
        
        // Reset form
        const form = document.getElementById('login-form');
        if (form) form.reset();
        
        // Focus su username
        const usernameInput = document.getElementById('username');
        if (usernameInput) usernameInput.focus();
    }

    /**
     * 📊 Mostra dashboard
     */
    showDashboard() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard-screen').style.display = 'flex';
        
        // Aggiorna info operatore
        const operatorName = document.getElementById('operator-name');
        if (operatorName && this.currentOperator) {
            operatorName.textContent = this.currentOperator.name || this.currentOperator.username;
        }
        
        // Connetti WebSocket
        this.connectWebSocket();
        
        // Initialize notifications (disabled temporarily)
        // this.initializeNotifications();
        
        // Carica sezione iniziale
        this.switchSection('overview');
    }

    /**
     * 🔄 Toggle status operatore
     */
    async toggleOperatorStatus() {
        if (!this.currentOperator) return;
        
        try {
            const newStatus = !this.currentOperator.isOnline;
            
            const response = await fetch(`${this.apiBase}/operators/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    operatorId: this.currentOperator.id,
                    isOnline: newStatus
                })
            });
            
            if (response.ok) {
                this.currentOperator.isOnline = newStatus;
                this.updateStatusUI();
                this.showToast(`Status: ${newStatus ? 'Online' : 'Offline'}`, 'success');
            } else {
                throw new Error('Failed to update status');
            }
            
        } catch (error) {
            console.error('❌ Status toggle error:', error);
            this.showToast('Errore aggiornamento status', 'error');
        }
    }

    /**
     * 🎨 Aggiorna UI status
     */
    updateStatusUI() {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('operator-status');
        
        if (this.currentOperator && this.currentOperator.isOnline) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Online';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Offline';
        }
    }

    /**
     * 🔀 Cambia sezione
     */
    switchSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
        
        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${section}-section`)?.classList.add('active');
        
        this.currentSection = section;
        
        // Load section specific data
        switch (section) {
            case 'overview':
                this.loadOverviewData();
                break;
            case 'chats':
                this.loadChatsData();
                break;
            case 'all-chats':
                this.loadAllChatsData();
                break;
            case 'tickets':
                this.loadTicketsData();
                break;
            case 'analytics':
                this.loadAnalyticsData();
                break;
        }
    }

    /**
     * 🔄 Refresh tutti i dati
     */
    async refreshData() {
        switch (this.currentSection) {
            case 'overview':
                await this.loadOverviewData();
                break;
            case 'chats':
                await this.loadChatsData();
                break;
            case 'all-chats':
                await this.loadAllChatsData();
                break;
            case 'tickets':
                await this.loadTicketsData();
                break;
            case 'analytics':
                await this.loadAnalyticsData();
                break;
        }
    }

    /**
     * 📊 Carica dati overview
     */
    async loadOverviewData() {
        try {
            console.log('📊 Loading overview data...');
            
            const response = await fetch('/api/analytics/dashboard', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Analytics API failed: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Analytics data loaded:', data);
            
            // Update metric cards with real data
            document.getElementById('total-chats').textContent = data.summary.activeChats || 0;
            document.getElementById('total-tickets').textContent = data.summary.openTickets || 0;
            
            // Format average session duration
            const avgDuration = data.summary.avgSessionDuration;
            const avgResponse = avgDuration > 0 ? `${avgDuration} min` : '--';
            document.getElementById('avg-response').textContent = avgResponse;
            
            // Format satisfaction rating
            const satisfaction = data.summary.satisfaction;
            const satisfactionText = satisfaction ? `${satisfaction}/5` : '--';
            document.getElementById('satisfaction').textContent = satisfactionText;
            
            // Update navigation badges
            document.getElementById('pending-chats').textContent = data.summary.activeChats || 0;
            document.getElementById('total-sessions').textContent = data.summary.totalChats || 0;
            document.getElementById('open-tickets').textContent = data.summary.openTickets || 0;
            
            // Render recent activity from real data
            this.renderRecentActivity(data.recentActivity || []);
            
            // Store analytics data for other sections
            this.analyticsData = data;
            
        } catch (error) {
            console.error('❌ Failed to load overview data:', error);
            this.showToast('Errore nel caricamento dei dati analytics', 'error');
            
            // Fallback to placeholder data
            document.getElementById('total-chats').textContent = '--';
            document.getElementById('total-tickets').textContent = '--';
            document.getElementById('avg-response').textContent = '--';
            document.getElementById('satisfaction').textContent = '--';
        }
    }

    /**
     * 📝 Render attività recente
     */
    renderRecentActivity(activities) {
        const activityList = document.getElementById('activity-list');
        if (!activityList || !activities || activities.length === 0) {
            if (activityList) {
                activityList.innerHTML = '<p class="no-data">Nessuna attività recente</p>';
            }
            return;
        }
        
        activityList.innerHTML = activities.map(activity => {
            const timeAgo = this.getTimeAgo(new Date(activity.timestamp));
            const icon = activity.sender === 'USER' ? 'user' : 
                        activity.sender === 'OPERATOR' ? 'headset' : 'robot';
            const senderLabel = activity.sender === 'USER' ? 'Utente' : 
                               activity.sender === 'OPERATOR' ? 'Operatore' : 'Bot';
            
            return `
                <div class="activity-item">
                    <div class="activity-icon ${activity.sender.toLowerCase()}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="activity-content">
                        <p><strong>${senderLabel}:</strong> ${activity.message}</p>
                        <span class="activity-time">${timeAgo} • Sessione: ${activity.sessionId.substr(-8)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 💬 Carica dati chat
     */
    async loadChatsData() {
        try {
            console.log('💬 Loading chats data...');
            
            const response = await fetch(`${this.apiBase}/operators/pending-chats`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Chats data loaded:', data);
                
                this.renderPendingChats(data.pending || []);
                
                // Update badge
                document.getElementById('pending-chats').textContent = data.count || 0;
            } else {
                console.error('❌ Failed to load chats:', response.status);
                this.showToast('Errore nel caricamento delle chat', 'error');
            }
            
        } catch (error) {
            console.error('❌ Failed to load chats:', error);
            this.showToast('Errore nel caricamento delle chat', 'error');
        }
    }

    /**
     * 🎨 Render chat pendenti
     */
    renderPendingChats(sessions) {
        const chatList = document.getElementById('pending-chat-list');
        if (!chatList) return;
        
        if (sessions.length === 0) {
            chatList.innerHTML = '<p class="no-data">Nessuna chat in attesa</p>';
            return;
        }
        
        chatList.innerHTML = sessions.map(session => {
            const waitTime = this.formatWaitingTime(new Date(session.startedAt).getTime());
            const lastMessage = session.lastMessage || 'Nessun messaggio';
            
            return `
                <div class="chat-item" data-session-id="${session.sessionId}">
                    <div class="chat-info">
                        <div class="chat-header">
                            <span class="session-id">#${session.sessionId.substr(-6)}</span>
                            <span class="wait-time">${waitTime}</span>
                        </div>
                        <p class="last-message">${lastMessage}</p>
                        <div class="chat-actions">
                            <button class="btn-take-chat" onclick="dashboardApp.takeChat('${session.sessionId}')">
                                <i class="fas fa-headset"></i>
                                Prendi in carico
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 🤝 Prendi in carico chat
     */
    async takeChat(sessionId) {
        try {
            console.log('🤝 Taking chat:', sessionId);
            
            const response = await fetch(`${this.apiBase}/operators/take-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'X-Session-ID': sessionId
                },
                body: JSON.stringify({
                    sessionId,
                    operatorId: this.currentOperator.id
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log('✅ Chat taken successfully');
                this.showToast('Chat presa in carico', 'success');
                
                // Refresh chat list
                this.loadChatsData();
                
                // Open chat window
                this.openChatWindow(sessionId);
                
            } else {
                throw new Error(data.error || 'Failed to take chat');
            }
            
        } catch (error) {
            console.error('❌ Failed to take chat:', error);
            this.showToast('Errore nel prendere la chat', 'error');
        }
    }

    /**
     * 🪟 Apri finestra chat
     */
    async openChatWindow(sessionId) {
        try {
            // Get session details
            const response = await fetch(`${this.apiBase}/operators/session/${sessionId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load session');
            }
            
            const sessionData = await response.json();
            console.log('📖 Session data:', sessionData);
            
            // Store active chat
            this.activeChat = sessionData.session;
            
            // Render chat window
            this.renderChatWindow(sessionData.session, sessionData.messages || []);
            
        } catch (error) {
            console.error('❌ Failed to open chat window:', error);
            this.showToast('Errore apertura chat', 'error');
        }
    }

    /**
     * 🎨 Render finestra chat
     */
    renderChatWindow(session, messages) {
        const chatWindow = document.getElementById('chat-window');
        if (!chatWindow) return;
        
        const template = document.getElementById('chat-window-template');
        if (!template) return;
        
        chatWindow.innerHTML = template.innerHTML;
        
        // Update session info
        document.querySelector('.session-id').textContent = session.sessionId;
        document.querySelector('.start-time').textContent = 
            new Date(session.startedAt).toLocaleString('it-IT');
        
        // Render messages
        this.renderChatMessages(messages);
        
        // Setup message input
        this.setupMessageInput();
    }

    /**
     * 💭 Render messaggi chat
     */
    renderChatMessages(messages) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = messages.map(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const senderClass = msg.sender.toLowerCase();
            const senderName = msg.sender === 'USER' ? 'Cliente' : 
                              msg.sender === 'BOT' ? 'Assistente' : 'Tu';
            
            return `
                <div class="message ${senderClass}">
                    <div class="message-content">
                        <div class="message-header">
                            <span class="sender">${senderName}</span>
                            <span class="time">${time}</span>
                        </div>
                        <p class="message-text">${msg.message}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    /**
     * ⌨️ Setup input messaggi
     */
    setupMessageInput() {
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-message');
        const charCount = document.querySelector('.char-count');
        
        if (!messageInput || !sendButton) return;
        
        // Character counter
        messageInput.addEventListener('input', () => {
            const length = messageInput.value.length;
            charCount.textContent = `${length}/500`;
            
            if (length > 450) {
                charCount.style.color = '#ff4444';
            } else {
                charCount.style.color = '';
            }
        });
        
        // Send message on Enter
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Send button click
        sendButton.addEventListener('click', () => this.sendMessage());
    }

    /**
     * 📤 Invia messaggio
     */
    async sendMessage() {
        const messageInput = document.getElementById('message-input');
        if (!messageInput || !this.activeChat) return;
        
        const message = messageInput.value.trim();
        if (!message) return;
        
        try {
            console.log('📤 Sending message:', message);
            
            const response = await fetch(`${this.apiBase}/operators/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'X-Session-ID': this.activeChat.sessionId
                },
                body: JSON.stringify({
                    sessionId: this.activeChat.sessionId,
                    operatorId: this.currentOperator.id,
                    message
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log('✅ Message sent successfully');
                
                // Clear input
                messageInput.value = '';
                document.querySelector('.char-count').textContent = '0/500';
                
                // Add message to UI immediately
                this.addMessageToUI(message, 'OPERATOR');
                
            } else {
                throw new Error(data.error || 'Failed to send message');
            }
            
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            this.showToast('Errore invio messaggio', 'error');
        }
    }

    /**
     * ➕ Aggiungi messaggio alla UI
     */
    addMessageToUI(message, sender) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        const time = new Date().toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const senderClass = sender.toLowerCase();
        const senderName = sender === 'USER' ? 'Cliente' : 
                          sender === 'BOT' ? 'Assistente' : 'Tu';
        
        const messageHTML = `
            <div class="message ${senderClass}">
                <div class="message-content">
                    <div class="message-header">
                        <span class="sender">${senderName}</span>
                        <span class="time">${time}</span>
                    </div>
                    <p class="message-text">${message}</p>
                </div>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    /**
     * 🎫 Carica dati ticket
     */
    async loadTicketsData() {
        try {
            console.log('🎫 Loading tickets data...');
            
            const statusFilter = document.getElementById('ticket-status-filter')?.value || 'all';
            const priorityFilter = document.getElementById('ticket-priority-filter')?.value || 'all';
            
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (priorityFilter !== 'all') params.append('priority', priorityFilter);
            
            const response = await fetch(`${this.apiBase}/tickets?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Tickets data loaded:', data);
                
                this.renderTickets(data.tickets || []);
                
                // Update badge
                const openTickets = data.tickets?.filter(t => t.status === 'OPEN').length || 0;
                document.getElementById('open-tickets').textContent = openTickets;
                
            } else {
                throw new Error('Failed to load tickets');
            }
            
        } catch (error) {
            console.error('❌ Failed to load tickets:', error);
            this.showToast('Errore nel caricamento dei ticket', 'error');
        }
    }

    /**
     * 🎨 Render ticket
     */
    renderTickets(tickets) {
        const ticketsList = document.getElementById('tickets-list');
        if (!ticketsList) return;
        
        if (tickets.length === 0) {
            ticketsList.innerHTML = '<p class="no-data">Nessun ticket trovato</p>';
            return;
        }
        
        ticketsList.innerHTML = tickets.map(ticket => {
            const statusClass = ticket.status.toLowerCase();
            const priorityClass = ticket.priority.toLowerCase();
            const createdDate = new Date(ticket.createdAt).toLocaleDateString('it-IT');
            
            return `
                <div class="ticket-item ${statusClass}">
                    <div class="ticket-header">
                        <span class="ticket-id">#${ticket.id.substr(-6)}</span>
                        <span class="ticket-priority ${priorityClass}">${ticket.priority}</span>
                        <span class="ticket-status ${statusClass}">${ticket.status}</span>
                    </div>
                    <div class="ticket-content">
                        <h4>${ticket.subject}</h4>
                        <p>${ticket.description}</p>
                        <div class="ticket-meta">
                            <span>📧 ${ticket.contactMethod}: ${ticket.contactValue}</span>
                            <span>📅 ${createdDate}</span>
                        </div>
                    </div>
                    <div class="ticket-actions">
                        <button class="btn-ticket-action">
                            <i class="fas fa-eye"></i>
                            Visualizza
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 📈 Carica dati analytics
     */
    async loadAnalyticsData() {
        try {
            console.log('📈 Loading analytics data...');
            
            const period = document.getElementById('analytics-period')?.value || 'today';
            
            // Use stored analytics data if available, otherwise fetch
            if (this.analyticsData) {
                this.renderAnalytics(this.analyticsData);
            } else {
                // Fetch fresh analytics
                const response = await fetch(`/api/analytics/dashboard`);
                
                if (response.ok) {
                    const data = await response.json();
                    this.analyticsData = data;
                    this.renderAnalytics(data);
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to load analytics:', error);
            this.showToast('Errore nel caricamento analytics', 'error');
        }
    }

    /**
     * 🎨 Render analytics
     */
    renderAnalytics(data) {
        // For now, just show placeholder charts
        // In a real implementation, you'd use Chart.js or similar
        const chartPlaceholder = '<div class="chart-placeholder-text">📊 Grafico non ancora implementato</div>';
        
        document.querySelectorAll('.chart-placeholder canvas').forEach(canvas => {
            canvas.style.display = 'none';
            canvas.parentElement.innerHTML = chartPlaceholder;
        });
        
        // Show chat history in analytics section
        this.loadAllChatsData('analytics-chat-history');
    }

    /**
     * 📜 Carica tutte le chat
     */
    async loadAllChatsData(containerId = 'all-chats-container') {
        try {
            console.log('📜 Loading all chats data...');
            
            const statusFilter = document.getElementById('status-filter')?.value || '';
            
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            
            const response = await fetch(`${this.apiBase}/operators/all-sessions?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ All chats data loaded:', data);
                
                this.renderAllChats(data.sessions || [], containerId);
                
                // Update badge for total sessions
                document.getElementById('total-sessions').textContent = data.total || 0;
                
            } else {
                throw new Error('Failed to load all chats');
            }
            
        } catch (error) {
            console.error('❌ Failed to load all chats:', error);
            this.showToast('Errore nel caricamento dello storico chat', 'error');
        }
    }

    /**
     * 🎨 Render tutte le chat
     */
    renderAllChats(sessions, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (sessions.length === 0) {
            container.innerHTML = '<p class="no-data">Nessuna chat trovata</p>';
            return;
        }
        
        container.innerHTML = sessions.map(session => {
            const startDate = new Date(session.startedAt).toLocaleString('it-IT');
            const duration = session.endedAt ? 
                this.calculateDuration(session.startedAt, session.endedAt) : 'In corso';
            
            const statusClass = session.status.toLowerCase().replace('_', '-');
            const statusLabel = session.status === 'ACTIVE' ? 'Attiva' :
                               session.status === 'WITH_OPERATOR' ? 'Con Operatore' :
                               session.status === 'ENDED' ? 'Terminata' : session.status;
            
            return `
                <div class="chat-history-item ${statusClass}">
                    <div class="chat-summary">
                        <div class="chat-header">
                            <span class="session-id">#${session.sessionId.substr(-8)}</span>
                            <span class="chat-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="chat-details">
                            <p><strong>Inizio:</strong> ${startDate}</p>
                            <p><strong>Durata:</strong> ${duration}</p>
                            ${session.operatorId ? `<p><strong>Operatore:</strong> ${session.operatorId}</p>` : ''}
                        </div>
                        <div class="chat-actions">
                            <button class="btn-view-chat" onclick="dashboardApp.viewChatHistory('${session.sessionId}')">
                                <i class="fas fa-eye"></i>
                                Visualizza
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 👁️ Visualizza storico chat
     */
    async viewChatHistory(sessionId) {
        try {
            console.log('👁️ Viewing chat history:', sessionId);
            
            const response = await fetch(`${this.apiBase}/operators/session/${sessionId}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Switch to chats section and open chat window
                this.switchSection('chats');
                this.renderChatWindow(data.session, data.messages || []);
                
                // Set as active chat (readonly)
                this.activeChat = { ...data.session, readonly: true };
                
                // Disable input for historical chats
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-message');
                
                if (messageInput) {
                    messageInput.disabled = true;
                    messageInput.placeholder = 'Chat terminata - visualizzazione in sola lettura';
                }
                if (sendButton) {
                    sendButton.disabled = true;
                }
                
            } else {
                throw new Error('Failed to load chat history');
            }
            
        } catch (error) {
            console.error('❌ Failed to view chat history:', error);
            this.showToast('Errore visualizzazione storico', 'error');
        }
    }

    /**
     * 🔄 Refresh chat correnti
     */
    async refreshChats() {
        await this.loadChatsData();
        this.showToast('Chat aggiornate', 'info');
    }

    /**
     * 🔌 Connessione WebSocket
     */
    connectWebSocket() {
        if (!this.currentOperator) {
            console.log('❌ No operator - skipping WebSocket connection');
            return;
        }
        
        console.log('🔌 Connecting to WebSocket...');
        
        try {
            this.websocket = new WebSocket(this.wsUrl);
            
            this.websocket.onopen = () => {
                console.log('✅ WebSocket connected');
                this.reconnectAttempts = 0;
                
                // Authenticate with operator ID
                this.websocket.send(JSON.stringify({
                    type: 'operator_auth',
                    operatorId: this.currentOperator.id
                }));
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('📨 WebSocket message:', data);
                    
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('❌ WebSocket message parse error:', error);
                }
            };
            
            this.websocket.onclose = (event) => {
                console.log('🔌 WebSocket closed:', event.code, event.reason);
                this.websocket = null;
                
                // Auto-reconnect after delay
                if (this.currentOperator && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                    
                    console.log(`🔄 Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`);
                    
                    setTimeout(() => {
                        this.connectWebSocket();
                    }, delay);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
            };
            
        } catch (error) {
            console.error('❌ WebSocket connection error:', error);
        }
    }

    /**
     * 📨 Gestione messaggi WebSocket
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'auth_success':
                console.log('✅ WebSocket authenticated');
                this.showToast('Connessione real-time attiva', 'success');
                break;
                
            case 'notification':
                this.handleNotification(data);
                break;
                
            case 'new_message':
                if (this.activeChat && data.sessionId === this.activeChat.sessionId) {
                    this.addMessageToUI(data.message, data.sender);
                }
                break;
                
            case 'chat_ended':
                if (this.activeChat && data.sessionId === this.activeChat.sessionId) {
                    this.showToast('Chat terminata', 'info');
                    this.refreshChats();
                }
                break;
                
            default:
                console.log('🔔 Unknown WebSocket message type:', data.type);
        }
    }

    /**
     * 🔔 Initialize notification system
     */
    async initializeNotifications() {
        try {
            if (window.notificationManager) {
                // Request permission on first login
                const hasPermission = await window.notificationManager.requestPermission();
                console.log('🔔 Notification permission:', hasPermission);
                
                // Listen for service worker messages
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.addEventListener('message', (event) => {
                        if (event.data.type === 'notification_clicked') {
                            this.handleNotificationClick(event.data.data);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error initializing notifications:', error);
        }
    }

    /**
     * 🖱️ Handle notification click from service worker
     */
    handleNotificationClick(data) {
        console.log('🔔 Notification click handled:', data);
        
        switch (data.type) {
            case 'newChat':
                if (data.sessionId) {
                    this.switchSection('chats');
                    setTimeout(() => {
                        this.openChatWindow(data.sessionId);
                    }, 100);
                }
                break;
                
            case 'newMessage':
                if (data.sessionId) {
                    this.switchSection('chats');
                }
                break;
                
            case 'newTicket':
                this.switchSection('tickets');
                break;
        }
    }

    /**
     * 🔔 Gestione notifiche WebSocket
     */
    handleNotification(notification) {
        console.log('🔔 WebSocket notification received:', notification);
        
        switch (notification.notificationType || notification.type) {
            case 'new_operator_request':
                this.handleNewOperatorRequest(notification);
                break;
            case 'chat_assigned':
                this.handleChatAssigned(notification);
                break;
            case 'new_message':
                this.handleNewMessage(notification);
                break;
            default:
                // Show generic notification
                if (notification.title && notification.message) {
                    this.showToast(`${notification.title}: ${notification.message}`, 'info');
                }
        }
    }

    /**
     * 🆕 Gestione nuova richiesta operatore
     */
    handleNewOperatorRequest(notification) {
        console.log('🙋 New operator request:', notification);
        
        // Play notification sound
        this.playNotificationSound();
        
        // Show prominent notification
        this.showToast(`🙋 Nuova richiesta di supporto da ${notification.sessionId || 'cliente'}`, 'warning', 10000);
        
        // Update pending chats count and reload
        this.loadChatsData();
        
        // If on overview, refresh data
        if (this.currentSection === 'overview') {
            this.loadOverviewData();
        }
        
        // Browser notification (if permission granted)
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🙋 Nuova richiesta supporto', {
                body: notification.message || 'Un cliente ha richiesto assistenza',
                icon: '/dashboard/icons/notification-icon.png',
                requireInteraction: true,
                tag: 'operator-request'
            });
        }
    }

    /**
     * 💬 Gestione nuovo messaggio in chat attiva
     */
    handleNewMessage(notification) {
        // Se la chat è aperta, aggiorna i messaggi
        if (this.activeChat && this.activeChat.sessionId === notification.sessionId) {
            this.refreshChatMessages();
        }
        
        // Toast notification per nuovi messaggi
        this.showToast(`💬 Nuovo messaggio da ${notification.sessionId}`, 'info');
    }

    /**
     * 📋 Gestione chat assegnata
     */
    handleChatAssigned(notification) {
        this.showToast(`📋 Chat assegnata: ${notification.sessionId}`, 'success');
        this.loadChatsData();
    }

    /**
     * 🔊 Play notification sound
     */
    playNotificationSound() {
        try {
            const audio = new Audio('/dashboard/sounds/notification.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log('🔊 Sound play failed:', e));
        } catch (error) {
            console.log('🔊 Notification sound not available');
        }
    }
        
        // Handle specific notification events with enhanced browser notifications
        switch (notification.event) {
            case 'new_chat_assigned':
                this.refreshChats();
                
                // Enhanced browser notification (disabled temporarily)
                // if (window.notificationManager) {
                //     window.notificationManager.showNewChatNotification({
                //         sessionId: notification.sessionId,
                //         operatorId: notification.operator?.id,
                //         message: notification.message
                //     });
                // }
                break;
                
            case 'new_message':
                // Only refresh if not viewing this chat
                if (!this.activeChat || this.activeChat.sessionId !== notification.sessionId) {
                    this.refreshChats();
                }
                
                // Show message notification (disabled temporarily)
                // if (window.notificationManager) {
                //     window.notificationManager.showNewMessageNotification({
                //         sessionId: notification.sessionId,
                //         message: notification.message,
                //         messageId: notification.messageId
                //     });
                // }
                break;
                
            case 'chat_ended':
                this.refreshChats();
                break;
                
            case 'urgent_request':
                // if (window.notificationManager) {
                //     window.notificationManager.showUrgentNotification({
                //         message: notification.message,
                //         sessionId: notification.sessionId
                //     });
                // }
                break;
                
            case 'new_ticket':
                // if (window.notificationManager) {
                //     window.notificationManager.showTicketNotification({
                //         ticketId: notification.ticketId,
                //         subject: notification.subject
                //     });
                // }
                break;
        }
    }

    /**
     * 🍞 Mostra toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'check-circle' :
                    type === 'error' ? 'exclamation-triangle' :
                    type === 'warning' ? 'exclamation-circle' :
                    'info-circle';
        
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    /**
     * ❌ Mostra errore
     */
    showError(element, message) {
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    /**
     * ⏰ Calcola durata sessione
     */
    calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diffMs = end - start;
        
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        }
    }

    /**
     * 🕐 Formatta tempo fa
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMinutes < 1) {
            return 'Ora';
        }
        
        if (diffMinutes < 60) {
            return `${diffMinutes} min fa`;
        }
        
        // Se è oggi (< 24 ore)
        if (diffHours < 24 && date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // Se è ieri
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `Ieri ${date.toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        }
        
        // Se è più vecchio
        if (diffDays < 7) {
            return `${diffDays} giorni fa`;
        }
        
        // Formato completo
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * ⏱️ Formatta tempo di attesa
     */
    formatWaitingTime(timestamp) {
        if (!timestamp) return '0 min';
        
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            return `${hours}h ${minutes % 60}m`;
        }
    }

    /**
     * 🎨 Icona per tipo attività
     */
    getActivityIcon(type) {
        const icons = {
            'chat_taken': 'headset',
            'chat_completed': 'check-circle',
            'ticket_assigned': 'ticket-alt',
            'ticket_resolved': 'check-square',
            'login': 'sign-in-alt',
            'logout': 'sign-out-alt'
        };
        
        return icons[type] || 'info-circle';
    }
}

// 🚀 Inizializza app quando DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new DashboardApp();
});

// 🔧 Debug helpers (remove in production)
if (window.location.hostname === 'localhost') {
    window.debugDashboard = {
        fakeLogin: () => {
            const fakeOperator = {
                id: 'op_001',
                username: 'admin',
                name: 'Operatore Demo',
                email: 'admin@lucinedinatale.it',
                isOnline: true,
                isActive: true
            };
            
            localStorage.setItem('operator_session', JSON.stringify(fakeOperator));
            window.dashboardApp.currentOperator = fakeOperator;
            window.dashboardApp.showDashboard();
            window.dashboardApp.refreshData();
        },
        
        clearSession: () => {
            localStorage.removeItem('operator_session');
            window.dashboardApp.showLogin();
        }
    };
    
    console.log('🔧 Debug mode - use window.debugDashboard.fakeLogin() to test');
}