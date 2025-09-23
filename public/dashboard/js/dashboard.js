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
        
        // API Configuration
        this.apiBase = window.location.origin + '/api';
        
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
        
        // Auto refresh ogni 30 secondi
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
                console.error('Invalid session data:', error);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    /**
     * 🔑 Gestione login
     */
    async handleLogin(e) {
        e.preventDefault();
        console.log('🔑 Login form submitted');
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('login-error');
        
        console.log('👤 Username:', username);
        console.log('🔒 Password length:', password.length);
        
        if (!username || !password) {
            this.showError(loginError, 'Username e password richiesti');
            return;
        }

        try {
            console.log('📡 Sending login request to:', `${this.apiBase}/operators/login`);
            
            // Login request
            const response = await fetch(`${this.apiBase}/operators/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            console.log('📬 Response status:', response.status);
            const data = await response.json();
            console.log('📦 Response data:', data);

            if (response.ok && data.success) {
                console.log('✅ Login successful');
                this.currentOperator = data.operator;
                localStorage.setItem('operator_session', JSON.stringify(this.currentOperator));
                
                this.showDashboard();
                this.refreshData();
                
                // Set operator online
                await this.setOperatorStatus(true);
                
            } else {
                console.error('❌ Login failed:', data.message);
                this.showError(loginError, data.message || 'Credenziali non valide');
            }
        } catch (error) {
            console.error('💥 Login error:', error);
            this.showError(loginError, 'Errore di connessione. Riprova.');
        }
    }

    /**
     * 🚪 Gestione logout
     */
    async handleLogout() {
        if (confirm('Sei sicuro di voler uscire?')) {
            try {
                // Set operator offline
                await this.setOperatorStatus(false);
            } catch (error) {
                console.error('Logout error:', error);
            }
            
            this.currentOperator = null;
            localStorage.removeItem('operator_session');
            this.showLogin();
            
            // Clear intervals
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
        }
    }

    /**
     * 🔄 Toggle stato operatore (online/offline)
     */
    async toggleOperatorStatus() {
        if (!this.currentOperator) return;
        
        const isOnline = this.currentOperator.isOnline;
        await this.setOperatorStatus(!isOnline);
    }

    /**
     * 📡 Imposta stato operatore
     */
    async setOperatorStatus(isOnline) {
        try {
            const response = await fetch(`${this.apiBase}/operators/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.currentOperator.id}`
                },
                body: JSON.stringify({ 
                    operatorId: this.currentOperator.id,
                    isOnline 
                })
            });

            if (response.ok) {
                this.currentOperator.isOnline = isOnline;
                localStorage.setItem('operator_session', JSON.stringify(this.currentOperator));
                this.updateStatusUI();
            }
        } catch (error) {
            console.error('Status update error:', error);
        }
    }

    /**
     * 🎨 Aggiorna UI stato
     */
    updateStatusUI() {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('operator-status');
        
        if (this.currentOperator.isOnline) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Online';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Offline';
        }
    }

    /**
     * 📺 Mostra schermata login
     */
    showLogin() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('dashboard-screen').classList.remove('active');
        
        // Clear form
        const form = document.getElementById('login-form');
        if (form) form.reset();
        
        // Hide error
        const error = document.getElementById('login-error');
        if (error) error.classList.remove('show');
    }

    /**
     * 📊 Mostra dashboard
     */
    showDashboard() {
        console.log('📊 showDashboard() called');
        
        const loginScreen = document.getElementById('login-screen');
        const dashboardScreen = document.getElementById('dashboard-screen');
        
        console.log('🔍 login-screen element:', loginScreen);
        console.log('🔍 dashboard-screen element:', dashboardScreen);
        
        if (loginScreen) {
            loginScreen.classList.remove('active');
            console.log('✅ Removed active from login-screen');
        }
        
        if (dashboardScreen) {
            dashboardScreen.classList.add('active');
            console.log('✅ Added active to dashboard-screen');
        }
        
        // Update operator name
        const operatorName = document.getElementById('operator-name');
        console.log('🔍 operator-name element:', operatorName);
        
        if (operatorName && this.currentOperator) {
            operatorName.textContent = this.currentOperator.name || this.currentOperator.username;
            console.log('✅ Updated operator name');
        }
        
        this.updateStatusUI();
        this.switchSection('overview');
    }

    /**
     * 🔄 Cambio sezione
     */
    switchSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        // Update content
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`${section}-section`).classList.add('active');
        
        this.currentSection = section;
        
        // Load section specific data
        switch (section) {
            case 'overview':
                this.loadOverviewData();
                break;
            case 'chats':
                this.loadChatsData();
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
            const [chatsResponse, ticketsResponse, analyticsResponse] = await Promise.all([
                fetch(`${this.apiBase}/operators/pending-sessions`),
                fetch(`${this.apiBase}/tickets?status=open`),
                fetch(`${this.apiBase}/analytics/operator/${this.currentOperator.id}`)
            ]);

            // Update metrics
            if (chatsResponse.ok) {
                const chatsData = await chatsResponse.json();
                document.getElementById('total-chats').textContent = chatsData.total_pending || 0;
                document.getElementById('pending-chats').textContent = chatsData.total_pending || 0;
            }

            if (ticketsResponse.ok) {
                const ticketsData = await ticketsResponse.json();
                document.getElementById('total-tickets').textContent = ticketsData.tickets?.length || 0;
                document.getElementById('open-tickets').textContent = ticketsData.tickets?.length || 0;
            }

            if (analyticsResponse.ok) {
                const analyticsData = await analyticsResponse.json();
                document.getElementById('avg-response').textContent = 
                    analyticsData.avgResponseTime || '--';
                document.getElementById('satisfaction').textContent = 
                    analyticsData.satisfaction || '--';
            }

            // Load recent activity
            await this.loadRecentActivity();

        } catch (error) {
            console.error('Error loading overview data:', error);
        }
    }

    /**
     * 📝 Carica attività recente
     */
    async loadRecentActivity() {
        try {
            const response = await fetch(`${this.apiBase}/analytics/recent-activity/${this.currentOperator.id}`);
            
            if (response.ok) {
                const data = await response.json();
                const activityList = document.getElementById('activity-list');
                
                if (data.activities && data.activities.length > 0) {
                    activityList.innerHTML = data.activities.map(activity => `
                        <div class="activity-item">
                            <div class="activity-icon">
                                <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                            </div>
                            <div class="activity-content">
                                <p>${activity.description}</p>
                                <span class="activity-time">${this.formatTime(activity.timestamp)}</span>
                            </div>
                        </div>
                    `).join('');
                } else {
                    activityList.innerHTML = '<p class="no-data">Nessuna attività recente</p>';
                }
            }
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    /**
     * 💬 Carica dati chat
     */
    async loadChatsData() {
        try {
            const response = await fetch(`${this.apiBase}/operators/pending-sessions`);
            
            if (response.ok) {
                const data = await response.json();
                const pendingList = document.getElementById('pending-chat-list');
                
                if (data.pending_sessions && data.pending_sessions.length > 0) {
                    pendingList.innerHTML = data.pending_sessions.map(session => `
                        <div class="pending-chat-item" data-session-id="${session.sessionId}">
                            <div class="chat-preview">
                                <div class="user-info">
                                    <i class="fas fa-user"></i>
                                    <span class="session-id">${session.sessionId.slice(0, 8)}...</span>
                                </div>
                                <p class="original-question">${session.originalQuestion || 'Richiesta supporto'}</p>
                                <div class="chat-meta">
                                    <span class="waiting-time">${this.formatWaitingTime(session.handover_time)}</span>
                                    <button class="btn-take-chat" onclick="dashboardApp.takeChat('${session.sessionId}')">
                                        <i class="fas fa-headset"></i>
                                        Prendi Chat
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    pendingList.innerHTML = '<p class="no-data">Nessuna chat in attesa</p>';
                }
            }
        } catch (error) {
            console.error('Error loading chats data:', error);
        }
    }

    /**
     * 📞 Prendi chat in carico
     */
    async takeChat(sessionId) {
        try {
            const response = await fetch(`${this.apiBase}/chat?action=operator_take&sessionId=${sessionId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.currentOperator.id}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.activeChat = sessionId;
                    await this.loadChatWindow(sessionId);
                    await this.loadChatsData(); // Refresh pending list
                    
                    // Show success message
                    this.showNotification('Chat presa in carico con successo!', 'success');
                }
            }
        } catch (error) {
            console.error('Error taking chat:', error);
            this.showNotification('Errore nel prendere la chat', 'error');
        }
    }

    /**
     * 💻 Carica finestra chat
     */
    async loadChatWindow(sessionId) {
        try {
            // Get session info
            const response = await fetch(`${this.apiBase}/chat?action=session_info&sessionId=${sessionId}`);
            
            if (response.ok) {
                const data = await response.json();
                const session = data.session;
                
                // Update chat window
                const chatWindow = document.getElementById('chat-window');
                const template = document.getElementById('chat-window-template');
                
                chatWindow.innerHTML = template.innerHTML;
                
                // Fill session info
                chatWindow.querySelector('.session-id').textContent = sessionId;
                chatWindow.querySelector('.start-time').textContent = 
                    this.formatTime(session.handover_time);
                
                // Load chat history
                await this.loadChatHistory(sessionId);
                
                // Setup message sending
                this.setupChatInput(sessionId);
            }
        } catch (error) {
            console.error('Error loading chat window:', error);
        }
    }

    /**
     * 💬 Carica storico chat per sessione specifica
     */
    async loadChatHistory(sessionId) {
        try {
            const response = await fetch(`${this.apiBase}/chat/history/${sessionId}`);
            
            if (response.ok) {
                const data = await response.json();
                const chatMessages = document.getElementById('chat-messages');
                
                if (data.messages && data.messages.length > 0) {
                    chatMessages.innerHTML = data.messages.map(msg => `
                        <div class="chat-message ${msg.sender.toLowerCase()}" data-timestamp="${msg.timestamp}">
                            <div class="message-info">
                                <span class="sender">${msg.sender === 'USER' ? 'Utente' : 'Bot/Operatore'}</span>
                                <span class="time">${this.formatTime(msg.timestamp)}</span>
                            </div>
                            <div class="message-bubble">
                                ${this.escapeHtml(msg.message)}
                            </div>
                        </div>
                    `).join('');
                } else {
                    chatMessages.innerHTML = '<p class="no-messages">Nessun messaggio ancora</p>';
                }
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    /**
     * 📚 Carica storico completo di tutte le chat per analytics
     */
    async loadAllChatHistory() {
        try {
            const response = await fetch(`${this.apiBase}/operators/chat-history?limit=50`);
            
            if (response.ok) {
                const data = await response.json();
                const analyticsHistory = document.getElementById('analytics-chat-history');
                
                if (data.sessions && data.sessions.length > 0) {
                    analyticsHistory.innerHTML = `
                        <h3>Storico Chat Recenti (${data.sessions.length})</h3>
                        <div class="chat-history-list">
                            ${data.sessions.map(session => `
                                <div class="session-item" data-session-id="${session.sessionId}">
                                    <div class="session-header">
                                        <div class="session-info">
                                            <strong>Sessione: ${session.sessionId.slice(0, 12)}...</strong>
                                            <span class="session-status status-${session.status.toLowerCase()}">${session.status}</span>
                                            <span class="message-count">${session.messageCount} messaggi</span>
                                        </div>
                                        <div class="session-time">
                                            ${this.formatTime(session.startedAt)}
                                        </div>
                                    </div>
                                    ${session.operator ? `
                                        <div class="session-operator">
                                            👤 Operatore: ${session.operator.name}
                                        </div>
                                    ` : ''}
                                    ${session.lastMessage ? `
                                        <div class="session-last-message">
                                            <strong>${session.lastMessage.sender}:</strong> 
                                            ${this.escapeHtml(session.lastMessage.message.slice(0, 100))}${session.lastMessage.message.length > 100 ? '...' : ''}
                                        </div>
                                    ` : ''}
                                    <button class="btn-view-session" onclick="dashboardApp.viewSessionDetails('${session.sessionId}')">
                                        <i class="fas fa-eye"></i> Visualizza
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <div class="pagination-info">
                            Pagina ${data.pagination.page} di ${data.pagination.pages} - ${data.pagination.total} sessioni totali
                        </div>
                    `;
                } else {
                    analyticsHistory.innerHTML = '<p class="no-data">Nessuna sessione chat trovata</p>';
                }
            }
        } catch (error) {
            console.error('Error loading all chat history:', error);
        }
    }

    /**
     * 🔍 Visualizza dettagli sessione in modal
     */
    async viewSessionDetails(sessionId) {
        try {
            const response = await fetch(`${this.apiBase}/operators/chat-history?sessionId=${sessionId}`);
            
            if (response.ok) {
                const data = await response.json();
                const session = data.sessions[0];
                
                if (session) {
                    // Create modal with session details
                    const modal = document.createElement('div');
                    modal.className = 'session-modal';
                    modal.innerHTML = `
                        <div class="modal-content">
                            <div class="modal-header">
                                <h3>Dettagli Sessione: ${session.sessionId}</h3>
                                <button class="modal-close" onclick="this.closest('.session-modal').remove()">×</button>
                            </div>
                            <div class="modal-body">
                                <div class="session-meta">
                                    <p><strong>Status:</strong> ${session.status}</p>
                                    <p><strong>Iniziata:</strong> ${this.formatTime(session.startedAt)}</p>
                                    <p><strong>Ultima attività:</strong> ${this.formatTime(session.lastActivity)}</p>
                                    ${session.operator ? `<p><strong>Operatore:</strong> ${session.operator.name}</p>` : ''}
                                </div>
                                <div class="session-messages">
                                    <h4>Conversazione (${session.messageCount} messaggi):</h4>
                                    <div class="messages-container">
                                        ${session.messages.map(msg => `
                                            <div class="message-item ${msg.sender.toLowerCase()}">
                                                <div class="message-header">
                                                    <span class="sender">${msg.sender}</span>
                                                    <span class="time">${this.formatTime(msg.timestamp)}</span>
                                                </div>
                                                <div class="message-content">${this.escapeHtml(msg.message)}</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                }
            }
        } catch (error) {
            console.error('Error viewing session details:', error);
        }
    }

    /**
     * 🔒 HTML escape per sicurezza
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 🎫 Carica dati ticket
     */
    async loadTicketsData() {
        try {
            const response = await fetch(`${this.apiBase}/tickets`);
            
            if (response.ok) {
                const data = await response.json();
                const ticketsList = document.getElementById('tickets-list');
                
                if (data.tickets && data.tickets.length > 0) {
                    ticketsList.innerHTML = data.tickets.map(ticket => `
                        <div class="ticket-item" data-ticket-id="${ticket.id}">
                            <div class="ticket-header">
                                <div class="ticket-info">
                                    <h4>#${ticket.id}</h4>
                                    <span class="ticket-priority priority-${ticket.priority}">${ticket.priority}</span>
                                    <span class="ticket-status status-${ticket.status}">${ticket.status}</span>
                                </div>
                                <div class="ticket-time">
                                    ${this.formatTime(ticket.createdAt)}
                                </div>
                            </div>
                            <div class="ticket-content">
                                <p class="ticket-subject">${ticket.subject || 'Supporto richiesto'}</p>
                                <p class="ticket-contact">📧 ${ticket.userEmail}</p>
                                ${ticket.whatsappNumber ? `<p class="ticket-contact">📱 ${ticket.whatsappNumber}</p>` : ''}
                            </div>
                            <div class="ticket-actions">
                                <button class="btn-assign" onclick="dashboardApp.assignTicket('${ticket.id}')">
                                    <i class="fas fa-user-check"></i>
                                    Assegna a me
                                </button>
                                <button class="btn-view" onclick="dashboardApp.viewTicket('${ticket.id}')">
                                    <i class="fas fa-eye"></i>
                                    Visualizza
                                </button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    ticketsList.innerHTML = '<p class="no-data">Nessun ticket disponibile</p>';
                }
            }
        } catch (error) {
            console.error('Error loading tickets data:', error);
        }
    }

    /**
     * 📈 Carica dati analytics
     */
    async loadAnalyticsData() {
        try {
            const response = await fetch(`${this.apiBase}/analytics/operator/${this.currentOperator.id}`);
            
            if (response.ok) {
                const data = await response.json();
                
                // TODO: Implement charts with Chart.js
                // For now, show placeholder data
                console.log('Analytics data:', data);
            }
            
            // Load chat history for analytics section
            await this.loadAllChatHistory();
            
        } catch (error) {
            console.error('Error loading analytics data:', error);
        }
    }

    /**
     * 🔄 Refresh solo chat
     */
    async refreshChats() {
        const refreshBtn = document.getElementById('refresh-chats');
        refreshBtn.classList.add('loading');
        
        try {
            await this.loadChatsData();
        } finally {
            refreshBtn.classList.remove('loading');
        }
    }

    /**
     * ⚠️ Mostra messaggio di errore
     */
    showError(element, message) {
        element.textContent = message;
        element.classList.add('show');
        
        setTimeout(() => {
            element.classList.remove('show');
        }, 5000);
    }

    /**
     * 🔔 Mostra notifica
     */
    showNotification(message, type = 'info') {
        // TODO: Implement toast notifications
        console.log(`${type.toUpperCase()}: ${message}`);
    }

    /**
     * 🕒 Formatta timestamp
     */
    formatTime(timestamp) {
        if (!timestamp) return '--';
        
        const date = new Date(timestamp);
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
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
    
    console.log('🔧 Debug helpers available:');
    console.log('- debugDashboard.fakeLogin() - Login senza autenticazione');
    console.log('- debugDashboard.clearSession() - Cancella sessione');
}