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

        // Auto refresh ogni 15 secondi SOLO per i badge
        // Le sezioni si refreshano solo quando vengono visualizzate
        this.badgeRefreshInterval = setInterval(() => {
            if (this.currentOperator) {
                this.updateAllBadges();
            }
        }, 15000); // 15 secondi - WebSocket gestisce notifiche real-time
    }

    /**
     * 🔔 Centralized Badge Update Function - OPTIMIZED
     * Single API call instead of 3 separate calls
     */
    async updateAllBadges() {
        try {
            // Single endpoint call
            const response = await fetch(`${this.apiBase}/operators/dashboard-summary`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!response.ok) {
                console.warn('⚠️ Dashboard summary failed:', response.status);
                return;
            }

            const data = await response.json();
            const badges = data.badges || {};

            // Update all badges
            this.setBadge('pending-chats', badges.pendingChats || 0);
            this.setBadge('open-tickets', badges.openTickets || 0);
            this.setBadge('total-sessions', badges.totalSessions || 0);

            console.log('✅ Badges updated:', badges);

        } catch (error) {
            console.error('❌ Failed to update badges:', error);
        }
    }

    /**
     * 🏷️ Helper: Set badge value
     */
    setBadge(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            if (value > 0 && elementId === 'pending-chats') {
                element.classList.add('has-pending');
            }
        }
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

        // Sidebar Toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
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
            refreshAllChatsBtn.addEventListener('click', () => {
                const statusFilter = document.getElementById('status-filter');
                const selectedStatus = statusFilter ? statusFilter.value : '';
                this.loadChatsHistory(selectedStatus);
            });
        }
        
        // Status Filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                const selectedStatus = statusFilter.value;
                this.loadChatsHistory(selectedStatus);
            });
        }

        // User Management
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => this.showCreateUserModal());
        }

        const saveUserBtn = document.getElementById('save-user-btn');
        if (saveUserBtn) {
            saveUserBtn.addEventListener('click', () => this.saveUser());
        }

        // Modal close buttons
        document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = document.getElementById('user-modal');
                if (modal) {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                }
            });
        });
    }

    /**
     * 🔐 Controllo stato autenticazione
     */
    checkAuthStatus() {
        const savedOperator = localStorage.getItem('operator_session');
        const savedToken = localStorage.getItem('auth_token');
        
        if (savedOperator && savedToken) {
            try {
                this.currentOperator = JSON.parse(savedOperator);
                this.authToken = savedToken;
                this.showDashboard();
                this.refreshData();
            } catch (error) {
                console.error('❌ Invalid session data:', error);
                localStorage.removeItem('operator_session');
                localStorage.removeItem('auth_token');
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
                console.log('🔑 JWT Token received:', data.token);
                console.log('👤 Operator ID from server:', data.operator.id);
                
                this.currentOperator = data.operator;
                this.authToken = data.token;
                
                // Salva sessione
                localStorage.setItem('operator_session', JSON.stringify(this.currentOperator));
                localStorage.setItem('auth_token', this.authToken);
                
                console.log('💾 Saved to localStorage - currentOperator:', this.currentOperator);
                
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
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('dashboard-container').classList.add('hidden');
        
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
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-container').classList.remove('hidden');

        // Aggiorna info operatore
        const operatorName = document.getElementById('operator-name');
        if (operatorName && this.currentOperator) {
            operatorName.textContent = this.currentOperator.displayName || this.currentOperator.name || this.currentOperator.username;
        }

        // 👑 Show admin menu if user is ADMIN
        if (this.currentOperator && this.currentOperator.role === 'ADMIN') {
            const adminSection = document.getElementById('admin-section');
            if (adminSection) {
                adminSection.style.display = 'block';
            }
        }

        // Connetti WebSocket
        this.connectWebSocket();

        // Request notification permission
        this.requestNotificationPermission();

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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    operatorId: this.currentOperator.id,
                    isOnline: newStatus
                })
            });
            
            if (response.status === 403 || response.status === 401) {
                console.warn('⚠️ Token expired or invalid - logging out');
                alert('Sessione scaduta. Effettua nuovamente il login.');
                this.handleLogout();
                return;
            }

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Status updated:', data);

                // Update local state
                this.currentOperator.isOnline = newStatus;

                // Update localStorage
                localStorage.setItem('operator_session', JSON.stringify(this.currentOperator));

                // Update UI
                this.updateStatusUI();

                this.showToast(`Status: ${newStatus ? 'Online' : 'Offline'}`, 'success');
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update status');
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
        const statusIndicator = document.getElementById('status-indicator');

        if (!statusIndicator) return;

        if (this.currentOperator && this.currentOperator.isOnline) {
            statusIndicator.className = 'status-indicator online';
        } else {
            statusIndicator.className = 'status-indicator offline';
        }
    }

    /**
     * 📱 Toggle sidebar
     */
    toggleSidebar() {
        const sidebar = document.getElementById('dashboard-sidebar');
        const toggleIcon = document.querySelector('#sidebar-toggle i');
        
        if (sidebar && toggleIcon) {
            sidebar.classList.toggle('collapsed');
            
            if (sidebar.classList.contains('collapsed')) {
                toggleIcon.className = 'fas fa-chevron-right';
            } else {
                toggleIcon.className = 'fas fa-chevron-left';
            }
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
                this.loadChatsHistory();
                break;
            case 'tickets':
                this.loadTickets();
                break;
            case 'analytics':
                this.loadAnalyticsData();
                break;
            case 'users':
                this.loadUsers();
                break;
        }
    }

    /**
     * 🔄 Refresh tutti i dati
     */
    async refreshData() {
        // Refresh ONLY the current section, not everything
        switch (this.currentSection) {
            case 'overview':
                await this.loadOverviewData();
                break;
            case 'chats':
                await this.loadChatsData();
                break;
            case 'all-chats':
                await this.loadChatsHistory();
                break;
            case 'tickets':
                await this.loadTickets();
                break;
            case 'analytics':
                await this.loadAnalyticsData();
                break;
            case 'users':
                await this.loadUsers();
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
            
            const response_data = await response.json();
            console.log('✅ Analytics data loaded:', response_data);
            
            // Extract data from API response wrapper
            const data = response_data.data || response_data;
            
            // Update metric cards with real data (safe DOM access)
            const setElementText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };
            
            setElementText('metric-active-chats', data.summary?.activeChats || 0);
            setElementText('metric-operator-chats', data.summary?.operatorChats || 0);
            setElementText('metric-open-tickets', data.summary?.openTickets || 0);
            setElementText('metric-total-messages', data.summary?.totalMessages || 0);
            
            // Format average session duration (only if element exists)
            const avgResponseEl = document.getElementById('avg-response');
            if (avgResponseEl) {
                const avgDuration = data.summary?.avgSessionDuration;
                const avgResponse = avgDuration > 0 ? `${avgDuration} min` : '--';
                avgResponseEl.textContent = avgResponse;
            }
            
            // Format satisfaction rating (only if element exists)
            const satisfactionEl = document.getElementById('satisfaction');
            if (satisfactionEl) {
                const satisfaction = data.summary?.satisfaction;
                const satisfactionText = satisfaction ? `${satisfaction}/5` : '--';
                satisfactionEl.textContent = satisfactionText;
            }
            
            // Badges updated by background interval
            
            // Render recent activity from real data
            this.renderRecentActivity(data.recentActivity || []);
            
            // Store analytics data for other sections
            this.analyticsData = data;
            
        } catch (error) {
            console.error('❌ Failed to load overview data:', error);
            this.showToast('Errore nel caricamento dei dati analytics', 'error');
            
            // Fallback to placeholder data
            const setElementText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };
            
            setElementText('metric-active-chats', '--');
            setElementText('metric-operator-chats', '--');
            setElementText('metric-open-tickets', '--');
            setElementText('metric-total-messages', '--');
            const satisfactionEl = document.getElementById('satisfaction');
            if (satisfactionEl) {
                satisfactionEl.textContent = '--';
            }
        }
    }

    /**
     * 📝 Render attività recente (raggruppate per sessione)
     */
    renderRecentActivity(activities) {
        const activityList = document.getElementById('recent-activity');
        if (!activityList || !activities || activities.length === 0) {
            if (activityList) {
                activityList.innerHTML = '<p class="no-data">Nessuna attività recente</p>';
            }
            return;
        }

        // Group activities by sessionId
        const groupedActivities = {};
        activities.forEach(activity => {
            if (!groupedActivities[activity.sessionId]) {
                groupedActivities[activity.sessionId] = [];
            }
            groupedActivities[activity.sessionId].push(activity);
        });

        // Render grouped activities
        activityList.innerHTML = Object.entries(groupedActivities).map(([sessionId, sessionActivities]) => {
            const firstActivity = sessionActivities[0];
            const latestTime = this.getTimeAgo(new Date(firstActivity.timestamp));
            const messageCount = sessionActivities.length;

            // Build messages preview
            const messagesPreview = sessionActivities.slice(0, 3).map(activity => {
                const icon = activity.sender === 'USER' ? 'user' :
                            activity.sender === 'OPERATOR' ? 'headset' : 'robot';
                const senderLabel = activity.sender === 'USER' ? 'Utente' :
                                   activity.sender === 'OPERATOR' ? 'Operatore' : 'Bot';
                const messagePreview = activity.message.length > 60
                    ? activity.message.substring(0, 60) + '...'
                    : activity.message;

                return `
                    <div class="message-line">
                        <i class="fas fa-${icon} message-icon ${activity.sender.toLowerCase()}"></i>
                        <span class="message-text"><strong>${senderLabel}:</strong> ${messagePreview}</span>
                    </div>
                `;
            }).join('');

            const moreMessagesText = messageCount > 3 ? `<p class="more-messages">+${messageCount - 3} altri messaggi</p>` : '';

            return `
                <div class="session-group clickable" onclick="dashboardApp.jumpToChat('${sessionId}')">
                    <div class="session-header">
                        <div class="session-info-header">
                            <i class="fas fa-comments"></i>
                            <span class="session-id-label">Sessione: ${sessionId.substr(-8).toUpperCase()}</span>
                            <span class="message-count">${messageCount} messaggio${messageCount > 1 ? 'i' : ''}</span>
                        </div>
                        <div class="session-time">
                            <i class="fas fa-clock"></i>
                            <span>${latestTime}</span>
                        </div>
                    </div>
                    <div class="session-messages">
                        ${messagesPreview}
                        ${moreMessagesText}
                    </div>
                    <div class="session-action">
                        <i class="fas fa-chevron-right"></i>
                        <span class="action-tooltip">Clicca per gestire la chat</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 🏃‍♂️ Jump to chat from recent activity
     */
    async jumpToChat(sessionId) {
        try {
            console.log('🏃‍♂️ Jumping to chat:', sessionId);
            
            // Switch to chats section
            this.switchSection('chats');
            
            // Check if chat needs to be taken
            const response = await fetch(`${this.apiBase}/operators/pending-chats`);
            if (response.ok) {
                const data = await response.json();
                const pendingChat = data.pending.find(chat => chat.sessionId === sessionId);
                
                if (pendingChat) {
                    // Chat is pending, show it and highlight
                    this.loadChatsData();
                    setTimeout(() => {
                        const chatElement = document.querySelector(`[data-session-id="${sessionId}"]`);
                        if (chatElement) {
                            chatElement.scrollIntoView({ behavior: 'smooth' });
                            chatElement.classList.add('highlighted');
                            setTimeout(() => {
                                chatElement.classList.remove('highlighted');
                            }, 3000);
                        }
                    }, 500);
                } else {
                    // Chat might be already taken, try to open it
                    this.openChatWindow(sessionId);
                }
            }
            
        } catch (error) {
            console.error('❌ Jump to chat error:', error);
            this.showToast('Chat non trovata o non disponibile', 'warning');
        }
    }

    /**
     * 🎫 Load tickets
     */
    async loadTickets(statusFilter = '') {
        try {
            console.log('🎫 Loading tickets...', { statusFilter });

            const response = await fetch(`${this.apiBase}/tickets`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Tickets loaded:', data);

                this.renderTickets(data.tickets || []);
            } else {
                console.error('❌ Failed to load tickets:', response.status);
                this.showToast('Errore nel caricamento dei ticket', 'error');
            }

        } catch (error) {
            console.error('❌ Failed to load tickets:', error);
            this.showToast('Errore nel caricamento dei ticket', 'error');
        }
    }

    /**
     * 🎨 Render tickets
     */
    renderTickets(tickets) {
        const ticketsList = document.getElementById('tickets-list');
        if (!ticketsList) return;

        if (tickets.length === 0) {
            ticketsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎫</div>
                    <h3>Nessun ticket</h3>
                    <p>I ticket di supporto appariranno qui quando saranno disponibili</p>
                </div>
            `;
            return;
        }

        ticketsList.innerHTML = tickets.map(ticket => {
            const statusBadge = this.getTicketStatusBadge(ticket.status);
            const priorityBadge = this.getPriorityBadge(ticket.priority);
            const createdDate = new Date(ticket.createdAt).toLocaleDateString('it-IT');
            const assignedTo = ticket.assignedTo?.name || 'Non assegnato';

            return `
                <div class="ticket-item" data-ticket-id="${ticket.id}">
                    <div class="ticket-header">
                        <div class="ticket-info">
                            <i class="fas fa-ticket-alt"></i>
                            <span class="ticket-number">#${ticket.ticketNumber}</span>
                            ${statusBadge}
                            ${priorityBadge}
                        </div>
                        <div class="ticket-date">
                            <i class="fas fa-calendar"></i>
                            <span>${createdDate}</span>
                        </div>
                    </div>

                    <div class="ticket-body">
                        <h4 class="ticket-subject">${ticket.subject}</h4>
                        <p class="ticket-description">${ticket.description.substring(0, 150)}${ticket.description.length > 150 ? '...' : ''}</p>
                        <div class="ticket-meta">
                            <span><i class="fas fa-user"></i> ${assignedTo}</span>
                            ${ticket.userEmail ? `<span><i class="fas fa-envelope"></i> ${ticket.userEmail}</span>` : ''}
                            ${ticket.userPhone ? `<span><i class="fas fa-phone"></i> ${ticket.userPhone}</span>` : ''}
                        </div>
                    </div>

                    <div class="ticket-footer">
                        <button class="btn-secondary" onclick="dashboardApp.viewTicket('${ticket.id}', '${ticket.ticketNumber}')">
                            <i class="fas fa-eye"></i>
                            Dettagli
                        </button>
                        ${ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' ?
                            `<button class="btn-primary" onclick="dashboardApp.assignTicket('${ticket.id}')">
                                <i class="fas fa-user-check"></i>
                                ${ticket.assignedTo ? 'Riassegna' : 'Assegna'}
                            </button>` : ''
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Get ticket status badge
     */
    getTicketStatusBadge(status) {
        const badges = {
            'OPEN': '<span class="status-badge open">Aperto</span>',
            'IN_PROGRESS': '<span class="status-badge in-progress">In Lavorazione</span>',
            'RESOLVED': '<span class="status-badge resolved">Risolto</span>',
            'CLOSED': '<span class="status-badge closed">Chiuso</span>'
        };
        return badges[status] || `<span class="status-badge">${status}</span>`;
    }

    /**
     * Get priority badge
     */
    getPriorityBadge(priority) {
        const badges = {
            'URGENT': '<span class="priority-badge urgent">Urgente</span>',
            'HIGH': '<span class="priority-badge high">Alta</span>',
            'MEDIUM': '<span class="priority-badge medium">Media</span>',
            'LOW': '<span class="priority-badge low">Bassa</span>'
        };
        return badges[priority] || `<span class="priority-badge">${priority}</span>`;
    }

    /**
     * 📋 View ticket details
     */
    async viewTicket(ticketId, ticketNumber) {
        try {
            console.log('📋 Loading ticket details:', ticketId);

            const response = await fetch(`${this.apiBase}/tickets/${ticketNumber}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!response.ok) {
                throw new Error('Failed to load ticket');
            }

            const ticket = await response.json();
            this.showTicketModal(ticket);

        } catch (error) {
            console.error('❌ Failed to load ticket:', error);
            this.showToast('Errore nel caricamento del ticket', 'error');
        }
    }

    /**
     * 🎫 Show ticket modal
     */
    showTicketModal(ticket) {
        const modal = document.getElementById('ticket-modal');
        const modalBody = document.getElementById('ticket-modal-body');

        if (!modal || !modalBody) return;

        // Get list of operators for assignment
        this.loadOperatorsForAssignment(ticket);

        const createdDate = new Date(ticket.createdAt).toLocaleString('it-IT');
        const resolvedDate = ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString('it-IT') : null;

        modalBody.innerHTML = `
            <div class="ticket-detail">
                <div class="ticket-detail-header">
                    <div>
                        <h2>#${ticket.ticketNumber}</h2>
                        ${this.getTicketStatusBadge(ticket.status)}
                        ${this.getPriorityBadge(ticket.priority)}
                    </div>
                    <div class="ticket-actions">
                        ${ticket.status === 'OPEN' ?
                            `<button class="btn-primary" onclick="dashboardApp.updateTicketStatus('${ticket.ticketNumber}', 'IN_PROGRESS')">
                                <i class="fas fa-play"></i> Inizia Lavorazione
                            </button>` : ''
                        }
                        ${ticket.status === 'IN_PROGRESS' ?
                            `<button class="btn-success" onclick="dashboardApp.updateTicketStatus('${ticket.ticketNumber}', 'RESOLVED')">
                                <i class="fas fa-check"></i> Risolvi
                            </button>` : ''
                        }
                        ${ticket.sessionId ?
                            `<button class="btn-secondary" onclick="dashboardApp.reopenChatFromTicket('${ticket.ticketNumber}')">
                                <i class="fas fa-comments"></i> Riapri Chat
                            </button>` : ''
                        }
                    </div>
                </div>

                <div class="ticket-info-grid">
                    <div class="info-item">
                        <label><i class="fas fa-calendar"></i> Creato</label>
                        <span>${createdDate}</span>
                    </div>
                    ${resolvedDate ? `
                        <div class="info-item">
                            <label><i class="fas fa-check-circle"></i> Risolto</label>
                            <span>${resolvedDate}</span>
                        </div>
                    ` : ''}
                    <div class="info-item">
                        <label><i class="fas fa-user"></i> Assegnato a</label>
                        <select id="ticket-operator-select" class="operator-select" onchange="dashboardApp.assignTicketToOperator('${ticket.ticketNumber}', this.value)">
                            <option value="">Non assegnato</option>
                            <!-- Will be populated by loadOperatorsForAssignment -->
                        </select>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-exclamation-circle"></i> Priorità</label>
                        <select id="ticket-priority-select" class="priority-select" onchange="dashboardApp.updateTicketPriority('${ticket.ticketNumber}', this.value)">
                            <option value="LOW" ${ticket.priority === 'LOW' ? 'selected' : ''}>Bassa</option>
                            <option value="MEDIUM" ${ticket.priority === 'MEDIUM' ? 'selected' : ''}>Media</option>
                            <option value="HIGH" ${ticket.priority === 'HIGH' ? 'selected' : ''}>Alta</option>
                            <option value="URGENT" ${ticket.priority === 'URGENT' ? 'selected' : ''}>Urgente</option>
                        </select>
                    </div>
                </div>

                <div class="ticket-section">
                    <h3><i class="fas fa-align-left"></i> Oggetto</h3>
                    <p>${ticket.subject}</p>
                </div>

                <div class="ticket-section">
                    <h3><i class="fas fa-file-alt"></i> Descrizione</h3>
                    <div class="ticket-description">${ticket.description}</div>
                </div>

                <div class="ticket-section">
                    <h3><i class="fas fa-envelope"></i> Contatti</h3>
                    <div class="contact-info">
                        ${ticket.userEmail ? `<div><i class="fas fa-envelope"></i> ${ticket.userEmail}</div>` : ''}
                        ${ticket.userPhone ? `<div><i class="fas fa-phone"></i> ${ticket.userPhone}</div>` : ''}
                        <div><i class="fas fa-${ticket.contactMethod === 'EMAIL' ? 'envelope' : 'phone'}"></i> Metodo preferito: ${ticket.contactMethod}</div>
                    </div>
                </div>

                ${ticket.notes && ticket.notes.length > 0 ? `
                    <div class="ticket-section">
                        <h3><i class="fas fa-sticky-note"></i> Note</h3>
                        <div class="notes-list">
                            ${ticket.notes.map(note => `
                                <div class="note-item ${note.isPublic ? 'public' : 'private'}">
                                    <div class="note-header">
                                        <span>${note.isPublic ? '👁️ Pubblica' : '🔒 Privata'}</span>
                                        <span>${new Date(note.createdAt).toLocaleString('it-IT')}</span>
                                    </div>
                                    <p>${note.note}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="ticket-section">
                    <h3><i class="fas fa-plus-circle"></i> Aggiungi Nota</h3>
                    <textarea id="new-note-text" placeholder="Scrivi una nota..." rows="3"></textarea>
                    <div class="note-actions">
                        <label>
                            <input type="checkbox" id="note-is-public"> Nota pubblica (visibile al cliente)
                        </label>
                        <button class="btn-primary" onclick="dashboardApp.addTicketNote('${ticket.ticketNumber}')">
                            <i class="fas fa-save"></i> Salva Nota
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    /**
     * 👥 Load operators for assignment dropdown
     */
    async loadOperatorsForAssignment(ticket) {
        try {
            const response = await fetch(`${this.apiBase}/operators/list`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (response.ok) {
                const operators = await response.json();
                const select = document.getElementById('ticket-operator-select');

                if (select) {
                    // Add operators to dropdown
                    operators.forEach(op => {
                        const option = document.createElement('option');
                        option.value = op.id;
                        option.textContent = op.name;
                        option.selected = ticket.assignedTo?.id === op.id;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('❌ Failed to load operators:', error);
        }
    }

    /**
     * 🔄 Update ticket status
     */
    async updateTicketStatus(ticketNumber, newStatus) {
        try {
            // Find ticket by number to get ID
            const ticketsResponse = await fetch(`${this.apiBase}/tickets`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!ticketsResponse.ok) throw new Error('Failed to fetch tickets');

            const ticketsData = await ticketsResponse.json();
            const ticket = ticketsData.tickets.find(t => t.ticketNumber === ticketNumber);

            if (!ticket) throw new Error('Ticket not found');

            const response = await fetch(`${this.apiBase}/tickets/${ticket.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (response.ok) {
                this.showToast(`Ticket ${ticketNumber} aggiornato a ${newStatus}`, 'success');
                this.closeTicketModal();
                this.loadTickets();
            } else {
                throw new Error('Failed to update ticket');
            }
        } catch (error) {
            console.error('❌ Failed to update ticket status:', error);
            this.showToast('Errore nell\'aggiornamento del ticket', 'error');
        }
    }

    /**
     * 👤 Assign ticket to operator
     */
    async assignTicketToOperator(ticketNumber, operatorId) {
        if (!operatorId) return;

        try {
            const ticketsResponse = await fetch(`${this.apiBase}/tickets`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!ticketsResponse.ok) throw new Error('Failed to fetch tickets');

            const ticketsData = await ticketsResponse.json();
            const ticket = ticketsData.tickets.find(t => t.ticketNumber === ticketNumber);

            if (!ticket) throw new Error('Ticket not found');

            const response = await fetch(`${this.apiBase}/tickets/${ticket.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ operatorId })
            });

            if (response.ok) {
                this.showToast('Ticket assegnato con successo', 'success');
                this.loadTickets();
            } else {
                throw new Error('Failed to assign ticket');
            }
        } catch (error) {
            console.error('❌ Failed to assign ticket:', error);
            this.showToast('Errore nell\'assegnazione del ticket', 'error');
        }
    }

    /**
     * 🎯 Update ticket priority
     */
    async updateTicketPriority(ticketNumber, newPriority) {
        try {
            const ticketsResponse = await fetch(`${this.apiBase}/tickets`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!ticketsResponse.ok) throw new Error('Failed to fetch tickets');

            const ticketsData = await ticketsResponse.json();
            const ticket = ticketsData.tickets.find(t => t.ticketNumber === ticketNumber);

            if (!ticket) throw new Error('Ticket not found');

            const response = await fetch(`${this.apiBase}/tickets/${ticket.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ priority: newPriority })
            });

            if (response.ok) {
                this.showToast('Priorità aggiornata', 'success');
                this.loadTickets();
            } else {
                throw new Error('Failed to update priority');
            }
        } catch (error) {
            console.error('❌ Failed to update priority:', error);
            this.showToast('Errore nell\'aggiornamento della priorità', 'error');
        }
    }

    /**
     * 📝 Add note to ticket
     */
    async addTicketNote(ticketNumber) {
        const noteText = document.getElementById('new-note-text');
        const isPublic = document.getElementById('note-is-public');

        if (!noteText || !noteText.value.trim()) {
            this.showToast('Inserisci il testo della nota', 'warning');
            return;
        }

        try {
            const ticketsResponse = await fetch(`${this.apiBase}/tickets`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            if (!ticketsResponse.ok) throw new Error('Failed to fetch tickets');

            const ticketsData = await ticketsResponse.json();
            const ticket = ticketsData.tickets.find(t => t.ticketNumber === ticketNumber);

            if (!ticket) throw new Error('Ticket not found');

            const response = await fetch(`${this.apiBase}/tickets/${ticket.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    note: noteText.value,
                    isPublic: isPublic?.checked || false,
                    operatorId: this.currentOperator.id
                })
            });

            if (response.ok) {
                this.showToast('Nota aggiunta con successo', 'success');
                noteText.value = '';
                if (isPublic) isPublic.checked = false;
                // Reload ticket details
                this.viewTicket(ticket.id, ticketNumber);
            } else {
                throw new Error('Failed to add note');
            }
        } catch (error) {
            console.error('❌ Failed to add note:', error);
            this.showToast('Errore nell\'aggiunta della nota', 'error');
        }
    }

    /**
     * 💬 Reopen chat from ticket
     */
    async reopenChatFromTicket(ticketNumber) {
        try {
            const response = await fetch(`${this.apiBase}/tickets/${ticketNumber}/reopen-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    operatorId: this.currentOperator.id
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.showToast('Chat riaperta con successo', 'success');
                this.closeTicketModal();
                this.switchSection('chats');
            } else {
                throw new Error('Failed to reopen chat');
            }
        } catch (error) {
            console.error('❌ Failed to reopen chat:', error);
            this.showToast('Errore nella riapertura della chat', 'error');
        }
    }

    /**
     * ❌ Close ticket modal
     */
    closeTicketModal() {
        const modal = document.getElementById('ticket-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Assign ticket to operator (legacy - for compatibility)
     */
    assignTicket(ticketId) {
        // This is called from old code, redirect to modal
        this.viewTicket(ticketId, null);
    }

    /**
     * 📜 Load chat history with filters
     */
    async loadChatsHistory(statusFilter = '') {
        try {
            console.log('📜 Loading chat history...', { statusFilter });

            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            params.append('limit', '50');

            const response = await fetch(`${this.apiBase}/operators/chat-history?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Chat history loaded:', data);

                this.renderChatsHistory(data.sessions || []);
            } else {
                console.error('❌ Failed to load chat history:', response.status);
                this.showToast('Errore nel caricamento dello storico', 'error');
            }

        } catch (error) {
            console.error('❌ Failed to load chat history:', error);
            this.showToast('Errore nel caricamento dello storico', 'error');
        }
    }

    /**
     * 🎨 Render chat history
     */
    renderChatsHistory(sessions) {
        const container = document.getElementById('all-chats-container');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h3>Nessuno storico</h3>
                    <p>Lo storico delle chat apparirà qui man mano che vengono gestite</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const statusBadge = this.getStatusBadge(session.status);
            const duration = session.endedAt
                ? this.formatDuration(new Date(session.startedAt), new Date(session.endedAt))
                : 'In corso';
            const lastActivity = this.formatTimeAgo(new Date(session.lastActivity));
            const operators = session.operators && session.operators.length > 0
                ? session.operators.map(op => op.name).join(', ')
                : 'Nessun operatore';

            return `
                <div class="history-item" data-session-id="${session.sessionId}">
                    <div class="history-header">
                        <div class="history-session-info">
                            <i class="fas fa-comments"></i>
                            <span class="history-session-id">ID: ${session.sessionId.substr(-8).toUpperCase()}</span>
                            ${statusBadge}
                        </div>
                        <div class="history-time">
                            <i class="fas fa-clock"></i>
                            <span>${lastActivity}</span>
                        </div>
                    </div>

                    <div class="history-body">
                        <p class="history-message">${session.lastMessage}</p>
                        <div class="history-meta">
                            <span><i class="fas fa-calendar"></i> ${new Date(session.startedAt).toLocaleDateString('it-IT')}</span>
                            <span><i class="fas fa-stopwatch"></i> ${duration}</span>
                            <span><i class="fas fa-user-headset"></i> ${operators}</span>
                        </div>
                    </div>

                    <div class="history-footer">
                        <button class="btn-secondary" onclick="dashboardApp.viewSession('${session.sessionId}')">
                            <i class="fas fa-eye"></i>
                            Visualizza
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Get status badge HTML
     */
    getStatusBadge(status) {
        const badges = {
            'ACTIVE': '<span class="status-badge active">Attiva</span>',
            'WITH_OPERATOR': '<span class="status-badge with-operator">Con Operatore</span>',
            'WAITING_OPERATOR': '<span class="status-badge waiting">In Attesa</span>',
            'ENDED': '<span class="status-badge ended">Terminata</span>',
            'RESOLVED': '<span class="status-badge resolved">Risolta</span>',
            'NOT_RESOLVED': '<span class="status-badge not-resolved">Non Risolta</span>',
            'CANCELLED': '<span class="status-badge cancelled">Cancellata</span>'
        };
        return badges[status] || `<span class="status-badge">${status}</span>`;
    }

    /**
     * Format duration between two dates
     */
    formatDuration(start, end) {
        const diff = end - start;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }

    /**
     * View session details
     */
    async viewSession(sessionId) {
        try {
            console.log('📋 Loading session details:', sessionId);

            // Fetch session data with messages
            const response = await fetch(`${this.apiBase}/chat/sessions/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load session');
            }

            const session = await response.json();

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>📋 Dettagli Sessione ${sessionId.substring(0, 8)}...</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="session-info" style="margin-bottom: 20px;">
                            <p><strong>ID:</strong> ${sessionId}</p>
                            <p><strong>Status:</strong> <span class="status-badge status-${session.status?.toLowerCase()}">${session.status || 'UNKNOWN'}</span></p>
                            <p><strong>Creata:</strong> ${new Date(session.createdAt).toLocaleString('it-IT')}</p>
                            ${session.endedAt ? `<p><strong>Terminata:</strong> ${new Date(session.endedAt).toLocaleString('it-IT')}</p>` : ''}
                            ${session.operatorName ? `<p><strong>Operatore:</strong> ${session.operatorName}</p>` : ''}
                        </div>

                        <div class="messages-container" style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; background: #f9f9f9; max-height: 400px; overflow-y: auto;">
                            <h4 style="margin-top: 0;">💬 Conversazione</h4>
                            ${this.renderSessionMessages(session.messages || [])}
                        </div>
                    </div>
                    <div class="modal-actions" style="margin-top: 20px; text-align: right;">
                        <button class="btn-secondary close-modal">Chiudi</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Close handlers
            const closeButtons = modal.querySelectorAll('.close-modal');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.remove();
                });
            });

            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });

            // Show modal
            modal.style.display = 'flex';

        } catch (error) {
            console.error('❌ Error loading session:', error);
            this.showToast('Errore nel caricamento della sessione', 'error');
        }
    }

    /**
     * Render messages for session modal
     */
    renderSessionMessages(messages) {
        if (!messages || messages.length === 0) {
            return '<p style="color: #999; font-style: italic;">Nessun messaggio disponibile</p>';
        }

        return messages.map(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const senderClass = msg.sender === 'USER' ? 'user-msg' :
                               msg.sender === 'OPERATOR' ? 'operator-msg' : 'system-msg';
            const senderIcon = msg.sender === 'USER' ? '👤' :
                              msg.sender === 'OPERATOR' ? '👨‍💼' : '🤖';

            return `
                <div class="message-item ${senderClass}" style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 6px; border-left: 3px solid ${msg.sender === 'USER' ? '#4CAF50' : msg.sender === 'OPERATOR' ? '#2196F3' : '#9E9E9E'};">
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                        ${senderIcon} <strong>${msg.sender}</strong> <span style="float: right;">${time}</span>
                    </div>
                    <div style="white-space: pre-wrap; word-break: break-word;">${this.escapeHtml(msg.message)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 💬 Carica dati chat
     */
    async loadChatsData() {
        try {
            console.log('💬 Loading chats data...');

            const response = await fetch(`${this.apiBase}/operators/pending-chats`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Chats data loaded:', data);

                // Render waiting chats (in queue, not yet assigned)
                this.renderWaitingChats(data.waiting || []);

                // Render active chats (assigned to operators)
                this.renderActiveChats(data.active || []);

                // Update badges
                const waitingBadge = document.getElementById('waiting-count-badge');
                if (waitingBadge) {
                    waitingBadge.textContent = data.waitingCount || 0;
                }

                const activeBadge = document.getElementById('active-count-badge');
                if (activeBadge) {
                    activeBadge.textContent = data.activeCount || 0;
                }

                // Remove pulse animation when operator views the chats section
                const pendingChatsEl = document.getElementById('pending-chats');
                if (pendingChatsEl) {
                    pendingChatsEl.classList.remove('has-pending');
                }
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
     * 🎨 Render chat in attesa (queue)
     */
    renderWaitingChats(sessions) {
        const chatList = document.getElementById('waiting-chat-list');
        if (!chatList) return;

        if (sessions.length === 0) {
            chatList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h3>Nessuna chat in attesa</h3>
                    <p>Le richieste in coda appariranno qui</p>
                </div>
            `;
            return;
        }
        
        chatList.innerHTML = sessions.map(session => {
            const waitTime = this.formatWaitingTime(session.timeWaiting || 0);
            const lastMessage = session.lastMessage || 'Richiesta operatore';
            const userLastSeen = this.formatTimeAgo(new Date(session.userLastSeen));
            const isUrgent = (session.timeWaiting || 0) > 300000; // > 5 minuti
            
            return `
                <div class="chat-card ${isUrgent ? 'urgent' : ''}" data-session-id="${session.sessionId}">
                    <div class="card-header">
                        <div class="session-info">
                            <span class="session-id">ID: ${session.sessionId.substr(-6).toUpperCase()}</span>
                            <div class="urgency-badge ${isUrgent ? 'urgent' : 'normal'}">
                                ${isUrgent ? 'URGENTE' : 'IN ATTESA'}
                            </div>
                        </div>
                        <div class="time-badge">
                            <i class="fas fa-clock"></i> ${waitTime}
                        </div>
                    </div>
                    
                    <div class="card-body">
                        <div class="message-preview">
                            <i class="fas fa-comment-dots"></i>
                            <p>${lastMessage}</p>
                        </div>
                        
                        <div class="user-info">
                            <div class="info-item">
                                <i class="fas fa-user"></i>
                                <span>Ultima attività: ${userLastSeen}</span>
                            </div>
                            ${session.assignedOperator ? 
                                `<div class="info-item">
                                    <i class="fas fa-user-check"></i>
                                    <span>Assegnato: ${session.assignedOperator.name}</span>
                                </div>` : 
                                ''
                            }
                        </div>
                    </div>
                    
                    <div class="card-footer">
                        <button class="btn-primary ${isUrgent ? 'btn-urgent' : ''}" 
                                onclick="dashboardApp.takeChat('${session.sessionId}')">
                            <i class="fas fa-headset"></i>
                            <span>${isUrgent ? 'GESTISCI URGENTE' : 'Prendi in carico'}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 🎨 Render chat attive (assigned to operators)
     */
    renderActiveChats(sessions) {
        const chatList = document.getElementById('active-chat-list');
        if (!chatList) return;

        if (sessions.length === 0) {
            chatList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>Nessuna chat attiva</h3>
                    <p>Le chat gestite dagli operatori appariranno qui</p>
                </div>
            `;
            return;
        }

        chatList.innerHTML = sessions.map(session => {
            const waitTime = this.formatWaitingTime(session.timeWaiting || 0);
            const lastMessage = session.lastMessage || 'Chat in corso';
            const userLastSeen = this.formatTimeAgo(new Date(session.userLastSeen));
            const operatorName = session.assignedOperator?.name || 'Operatore';
            const isMyChat = session.assignedOperator?.id === this.currentOperator?.id;

            return `
                <div class="chat-card active ${isMyChat ? 'my-chat' : ''}" data-session-id="${session.sessionId}">
                    <div class="card-header">
                        <div class="session-info">
                            <span class="session-id">ID: ${session.sessionId.substr(-6).toUpperCase()}</span>
                            <div class="urgency-badge active">
                                ${isMyChat ? 'TUA CHAT' : 'IN CORSO'}
                            </div>
                        </div>
                        <div class="time-badge">
                            <i class="fas fa-clock"></i>
                            <span>${waitTime}</span>
                        </div>
                    </div>

                    <div class="card-body">
                        <div class="message-preview">
                            <p>${lastMessage}</p>
                        </div>

                        <div class="user-info">
                            <div class="info-item">
                                <i class="fas fa-user-check"></i>
                                <span>Operatore: ${operatorName}</span>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-clock"></i>
                                <span>Ultima attività: ${userLastSeen}</span>
                            </div>
                        </div>
                    </div>

                    <div class="card-footer">
                        ${isMyChat ?
                            `<button class="btn-primary"
                                    onclick="dashboardApp.openChatWindow('${session.sessionId}')">
                                <i class="fas fa-comments"></i>
                                <span>Apri Chat</span>
                            </button>` :
                            `<button class="btn-secondary" disabled>
                                <i class="fas fa-lock"></i>
                                <span>Gestita da ${operatorName}</span>
                            </button>`
                        }
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
            // FIRST: Auto-take the chat to ensure operator is assigned
            console.log('🔄 Auto-taking chat before opening:', sessionId);
            
            const takeResponse = await fetch(`${this.apiBase}/operators/take-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'X-Session-ID': sessionId
                },
                body: JSON.stringify({
                    sessionId,
                    operatorId: this.currentOperator.id
                })
            });
            
            if (!takeResponse.ok) {
                const takeError = await takeResponse.json();
                // If chat is already taken by someone else, still try to open (might be read-only)
                console.warn('⚠️ Take chat failed:', takeError.error);
            } else {
                console.log('✅ Chat auto-taken successfully');
            }
            
            // THEN: Get session details
            const response = await fetch(`${this.apiBase}/operators/chat/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load session');
            }
            
            const sessionData = await response.json();
            console.log('📖 Session data:', sessionData);
            
            // Store active chat
            this.activeChat = sessionData.session;
            
            // Show chat modal
            this.showChatModal();
            
            // Render chat window
            this.renderChatWindow(sessionData.session, sessionData.messages || []);
            
        } catch (error) {
            console.error('❌ Failed to open chat window:', error);
            this.showToast(`Errore apertura chat: ${error.message}`, 'error');
        }
    }

    /**
     * 📱 Show chat modal
     */
    showChatModal() {
        const modal = document.getElementById('chat-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Add escape key handler
            this.escapeHandler = this.handleEscapeKey.bind(this);
            document.addEventListener('keydown', this.escapeHandler);
            
            // Add click outside handler
            this.backdropHandler = this.handleModalBackdropClick.bind(this);
            modal.addEventListener('click', this.backdropHandler);
        }
    }

    /**
     * ❌ Hide chat modal
     */
    hideChatModal() {
        const modal = document.getElementById('chat-modal');
        if (modal) {
            modal.style.display = 'none';
            this.activeChat = null;
            
            // Remove event handlers
            document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
            modal.removeEventListener('click', this.handleModalBackdropClick.bind(this));
        }
    }

    /**
     * ⌨️ Handle escape key
     */
    handleEscapeKey(event) {
        if (event.key === 'Escape') {
            this.hideChatModal();
        }
    }

    /**
     * 🖱️ Handle modal backdrop click
     */
    handleModalBackdropClick(event) {
        if (event.target.id === 'chat-modal') {
            this.hideChatModal();
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

        // Show/hide close conversation button based on session status
        const closeBtn = document.getElementById('close-conversation-btn');
        if (closeBtn) {
            // Show button only if chat is WITH_OPERATOR
            if (session.status === 'WITH_OPERATOR') {
                closeBtn.style.display = 'block';
            } else {
                closeBtn.style.display = 'none';
            }
        }
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

        // Close conversation button
        const closeConvBtn = document.getElementById('close-conversation-btn');
        if (closeConvBtn) {
            closeConvBtn.addEventListener('click', () => this.initiateConversationClosure());
        }
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
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
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
     * 🔚 Inizia chiusura conversazione
     */
    async initiateConversationClosure() {
        if (!this.activeChat) {
            this.showToast('Nessuna chat attiva', 'error');
            return;
        }

        try {
            console.log('🔚 Initiating conversation closure for:', this.activeChat.sessionId);

            const response = await fetch(`${this.apiBase}/operators/close-conversation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    sessionId: this.activeChat.sessionId,
                    operatorId: this.currentOperator.id
                })
            });

            const data = await response.json();

            if (response.ok) {
                console.log('✅ Conversation closure initiated');
                this.showToast('Richiesta di chiusura inviata all\'utente', 'success');

                // Disable close button (already sent)
                const closeBtn = document.getElementById('close-conversation-btn');
                if (closeBtn) {
                    closeBtn.disabled = true;
                    closeBtn.innerHTML = '<i class="fas fa-check"></i> Richiesta inviata';
                }
            } else {
                throw new Error(data.error || 'Failed to initiate closure');
            }

        } catch (error) {
            console.error('❌ Failed to initiate conversation closure:', error);
            this.showToast('Errore nella richiesta di chiusura', 'error');
        }
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
        const container = document.getElementById('analytics-content');
        if (!container) return;

        // Extract data with fallback
        const actualData = data.data || data;
        const summary = actualData.summary || {};
        const recentActivity = actualData.recentActivity || [];
        const operators = actualData.operators || {};

        // Calculate additional metrics
        const totalChats = summary.activeChats || 0;
        const operatorChats = summary.operatorChats || 0;
        const totalMessages = summary.totalMessages || 0;
        const openTickets = summary.openTickets || 0;
        const avgSessionDuration = summary.avgSessionDuration || 0;

        // Operator metrics
        const totalOperators = operators.total || 0;
        const onlineOperators = operators.online || 0;
        const offlineOperators = operators.offline || 0;
        const topPerformers = operators.topPerformers || [];

        // Calculate percentages
        const operatorChatPercent = totalChats > 0 ? Math.round((operatorChats / totalChats) * 100) : 0;

        container.innerHTML = `
            <div class="analytics-grid">
                <!-- Main Stats Cards -->
                <div class="analytics-card">
                    <div class="analytics-icon primary">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${totalChats}</h3>
                        <p class="analytics-label">Sessioni Chat</p>
                        <span class="analytics-change positive">
                            <i class="fas fa-arrow-up"></i> Totali attive
                        </span>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="analytics-icon success">
                        <i class="fas fa-headset"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${operatorChats}</h3>
                        <p class="analytics-label">Con Operatore</p>
                        <span class="analytics-change">
                            <i class="fas fa-percentage"></i> ${operatorChatPercent}% del totale
                        </span>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="analytics-icon info">
                        <i class="fas fa-envelope"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${totalMessages}</h3>
                        <p class="analytics-label">Messaggi Oggi</p>
                        <span class="analytics-change">
                            <i class="fas fa-chart-line"></i> Totale scambiati
                        </span>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="analytics-icon warning">
                        <i class="fas fa-ticket-alt"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${openTickets}</h3>
                        <p class="analytics-label">Ticket Aperti</p>
                        <span class="analytics-change">
                            <i class="fas fa-exclamation-circle"></i> In attesa
                        </span>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="analytics-icon secondary">
                        <i class="fas fa-stopwatch"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${avgSessionDuration || 0} min</h3>
                        <p class="analytics-label">Durata Media</p>
                        <span class="analytics-change">
                            <i class="fas fa-clock"></i> Per sessione
                        </span>
                    </div>
                </div>

                <div class="analytics-card">
                    <div class="analytics-icon success">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                    <div class="analytics-info">
                        <h3 class="analytics-value">${summary.satisfaction || '--'}</h3>
                        <p class="analytics-label">Soddisfazione</p>
                        <span class="analytics-change positive">
                            <i class="fas fa-star"></i> Media rating
                        </span>
                    </div>
                </div>
            </div>

            <!-- Operator Statistics -->
            <div class="analytics-section">
                <h3 class="section-title">👥 Statistiche Operatori</h3>
                <div class="operator-stats-grid">
                    <div class="operator-stat-card online">
                        <i class="fas fa-user-check"></i>
                        <div class="stat-info">
                            <h4>${onlineOperators}</h4>
                            <p>Online Ora</p>
                        </div>
                    </div>
                    <div class="operator-stat-card offline">
                        <i class="fas fa-user-times"></i>
                        <div class="stat-info">
                            <h4>${offlineOperators}</h4>
                            <p>Offline</p>
                        </div>
                    </div>
                    <div class="operator-stat-card total">
                        <i class="fas fa-users"></i>
                        <div class="stat-info">
                            <h4>${totalOperators}</h4>
                            <p>Totale Attivi</p>
                        </div>
                    </div>
                </div>

                <!-- Top Performers -->
                ${topPerformers.length > 0 ? `
                <div class="top-performers">
                    <h4 class="subsection-title">🏆 Top Operatori per Chat Gestite</h4>
                    <div class="performers-list">
                        ${topPerformers.map((op, index) => `
                            <div class="performer-item">
                                <div class="performer-rank">#${index + 1}</div>
                                <div class="performer-info">
                                    <div class="performer-name">
                                        ${op.name}
                                        ${op.isOnline ? '<span class="status-dot online"></span>' : '<span class="status-dot offline"></span>'}
                                    </div>
                                    <div class="performer-stats">
                                        <span><i class="fas fa-comments"></i> ${op.totalChats} chat totali</span>
                                        ${op.activeChats > 0 ? `<span class="active-badge"><i class="fas fa-circle"></i> ${op.activeChats} attive</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Performance Metrics -->
            <div class="analytics-section">
                <h3 class="section-title">📊 Metriche di Performance</h3>
                <div class="activity-summary">
                    <div class="summary-item">
                        <span class="summary-label">Conversazioni totali:</span>
                        <span class="summary-value">${totalChats}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Tasso escalation operatore:</span>
                        <span class="summary-value">${operatorChatPercent}%</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Messaggi scambiati:</span>
                        <span class="summary-value">${totalMessages}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Ticket aperti:</span>
                        <span class="summary-value">${openTickets}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Ultimo aggiornamento:</span>
                        <span class="summary-value">${new Date().toLocaleTimeString('it-IT')}</span>
                    </div>
                </div>
            </div>
        `;
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
                console.log('🔐 Authenticating WebSocket with operator ID:', this.currentOperator.id);
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
     * 🔔 Gestione notifiche WebSocket
     */
    handleNotification(notification) {
        console.log('🔔 WebSocket notification received:', notification);

        // Backend sends: { type: 'notification', event: 'new_operator_request', ... }
        const eventType = notification.event || notification.notificationType || notification.type;

        switch (eventType) {
            case 'new_operator_request':
                this.handleNewOperatorRequest(notification);
                break;
            case 'new_chat_assigned':
            case 'chat_assigned':
                this.handleChatAssigned(notification);
                break;
            case 'new_message':
                this.handleNewMessage(notification);
                break;
            default:
                console.log('⚠️ Unknown notification event:', eventType);
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

        // Play notification sound (2 volte per urgenza)
        this.playNotificationSound();
        setTimeout(() => this.playNotificationSound(), 500);

        // Add pulse animation to badge
        const badge = document.getElementById('pending-chats');
        if (badge) {
            badge.classList.add('has-pending');
        }

        // Update all badges and reload chats
        this.updateAllBadges();
        this.loadChatsData();

        // If on overview, refresh data
        if (this.currentSection === 'overview') {
            this.loadOverviewData();
        }

        // Browser notification NATIVA (if permission granted)
        if ('Notification' in window && Notification.permission === 'granted') {
            console.log('📢 Creating NATIVE browser notification...');
            try {
                const sessionShort = notification.sessionId?.substring(0, 8) || 'cliente';
                const notif = new Notification('🚨 NUOVA RICHIESTA SUPPORTO', {
                    body: `Un cliente richiede assistenza urgente\n\nSessione: ${sessionShort}\nMessaggio: ${notification.message || 'Richiesta operatore'}`,
                    icon: '/dashboard/images/notification-icon.png',
                    badge: '/dashboard/images/badge-icon.png',
                    requireInteraction: true, // Rimane fino a click
                    tag: `operator-request-${notification.sessionId}`,
                    vibrate: [200, 100, 200], // Vibrazione su mobile
                    silent: false
                });

                // Click notification → vai a Chat Live
                notif.onclick = () => {
                    window.focus();
                    this.switchSection('chats');
                    notif.close();
                };

                console.log('✅ NATIVE notification created:', notif);
            } catch (error) {
                console.error('❌ Failed to create notification:', error);
            }
        } else {
            console.warn('⚠️ Notifiche NATIVE non disponibili - permission:', Notification?.permission);
            alert('🚨 NUOVA RICHIESTA SUPPORTO!\n\nUn cliente richiede assistenza.\n\nVai a Chat Live per rispondere.');
        }
    }

    /**
     * 💬 Gestione nuovo messaggio in chat attiva
     */
    handleNewMessage(notification) {
        console.log('💬 New message notification:', notification);

        // Se la chat è aperta, ricarica i messaggi automaticamente
        if (this.activeChat && this.activeChat.sessionId === notification.sessionId) {
            console.log('🔄 Reloading active chat messages...');

            // Ricarica la conversazione per mostrare il nuovo messaggio
            this.loadChatMessages(notification.sessionId);

            // Play subtle notification sound
            this.playSystemBeep();
        } else {
            // Chat non aperta - mostra badge "nuovo messaggio"
            this.updateChatBadge(notification.sessionId, 'new');

            // Play notification sound
            this.playNotificationSound();

            // Toast notification
            const shortSessionId = notification.sessionId.substring(0, 8) + '...';
            this.showToast(`💬 Nuovo messaggio da ${shortSessionId}`, 'info');
        }

        // Ricarica lista chat per aggiornare preview ultimo messaggio
        this.loadChatsData();
    }

    /**
     * 🔔 Update chat badge (nuovo messaggio)
     */
    updateChatBadge(sessionId, badgeType = 'new') {
        // Find chat in DOM and add badge indicator
        const chatElements = document.querySelectorAll(`[data-session-id="${sessionId}"]`);
        chatElements.forEach(el => {
            // Add or update badge
            let badge = el.querySelector('.chat-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge badge bg-danger ms-2';
                badge.textContent = '1';
                el.appendChild(badge);
            } else {
                // Increment count
                const count = parseInt(badge.textContent) || 0;
                badge.textContent = count + 1;
            }
        });
    }

    /**
     * 📋 Gestione chat assegnata
     */
    handleChatAssigned(notification) {
        this.showToast(`📋 Chat assegnata: ${notification.sessionId}`, 'success');
        this.loadChatsData();
    }

    /**
     * 🔔 Request notification permission
     */
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('❌ Browser does not support notifications');
            return;
        }

        if (Notification.permission === 'granted') {
            console.log('✅ Notification permission already granted');
            return;
        }

        if (Notification.permission !== 'denied') {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('✅ Notification permission granted');
                    this.showToast('🔔 Notifiche attivate! Riceverai avvisi per nuove richieste', 'success');

                    // Test notification
                    new Notification('✅ Notifiche Attive', {
                        body: 'Riceverai notifiche per nuove richieste di supporto',
                        tag: 'permission-granted'
                    });
                } else {
                    console.log('❌ Notification permission denied');
                    this.showToast('⚠️ Notifiche disabilitate. Attivale nelle impostazioni del browser.', 'warning');
                }
            } catch (error) {
                console.error('❌ Error requesting notification permission:', error);
            }
        }
    }

    /**
     * 🔊 Play notification sound
     */
    playNotificationSound() {
        console.log('🔊 Playing notification beep...');
        // Directly use system beep (no missing mp3 file)
        this.playSystemBeep();
    }

    /**
     * 🔔 Play system beep using Web Audio API
     */
    playSystemBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800; // 800 Hz beep
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.log('🔊 Beep sound not available');
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
    formatWaitingTime(milliseconds) {
        if (!milliseconds) return '0 min';
        
        const minutes = Math.floor(milliseconds / 60000);
        
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            return `${hours}h ${minutes % 60}m`;
        }
    }

    /**
     * 📅 Formatta tempo relativo (es. "2 minuti fa")
     */
    formatTimeAgo(date) {
        if (!date) return 'mai';
        
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'ora';
        if (minutes < 60) return `${minutes} min fa`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h fa`;

        const days = Math.floor(hours / 24);
        return `${days}g fa`;
    }

    // 👑 User Management Functions
    async loadUsers() {
        try {
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.status === 403 || response.status === 401) {
                console.warn('⚠️ Token expired or invalid - logging out');
                alert('Sessione scaduta. Effettua nuovamente il login.');
                this.handleLogout();
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load users');
            }

            const users = await response.json();
            this.renderUsers(users);
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('Errore nel caricamento degli utenti', 'error');
        }
    }

    renderUsers(users) {
        const usersGrid = document.getElementById('users-grid');

        if (!users || users.length === 0) {
            usersGrid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> Nessun operatore trovato
                    </div>
                </div>
            `;
            return;
        }

        usersGrid.innerHTML = users.map(user => `
            <div class="col-md-6 col-lg-4">
                <div class="card user-card">
                    <div class="card-body">
                        <div class="d-flex align-items-start mb-3">
                            <div class="avatar-circle me-3" style="width: 50px; height: 50px; font-size: 24px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; color: white;">
                                ${user.avatar && user.avatar.length <= 2 ? user.avatar : '👤'}
                            </div>
                            <div class="flex-grow-1">
                                <h5 class="mb-1">${user.displayName || user.name}</h5>
                                <small class="text-muted">@${user.username}</small>
                                <div>
                                    <span class="badge ${user.role === 'ADMIN' ? 'bg-danger' : 'bg-primary'}">${user.role}</span>
                                    <span class="badge ${user.isActive ? 'bg-success' : 'bg-secondary'}">${user.isActive ? 'Attivo' : 'Disattivato'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="mb-2">
                            <small class="text-muted d-block"><i class="fas fa-envelope"></i> ${user.email}</small>
                            ${user.specialization ? `<small class="text-muted d-block"><i class="fas fa-tag"></i> ${user.specialization}</small>` : ''}
                        </div>

                        <div class="d-flex gap-2 mt-3">
                            <button class="btn btn-sm btn-outline-primary flex-grow-1" onclick="window.dashboardApp.editUser('${user.id}')">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                            ${user.isActive ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="window.dashboardApp.deactivateUser('${user.id}', '${user.username}')">
                                    <i class="fas fa-ban"></i> Disattiva
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    showCreateUserModal() {
        // Reset form
        const form = document.getElementById('user-form');
        form.reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-modal-title').textContent = 'Nuovo Operatore';

        // Make password required for create mode
        const passwordRequired = document.getElementById('password-required');
        if (passwordRequired) passwordRequired.style.display = 'inline';

        // Show modal (without bootstrap, use display)
        const modal = document.getElementById('user-modal');
        modal.style.display = 'block';
        modal.classList.add('show');
    }

    async editUser(userId) {
        try {
            const response = await fetch(`/api/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load user');
            }

            const user = await response.json();

            // Populate form
            document.getElementById('user-id').value = user.id;
            document.getElementById('user-username').value = user.displayName || user.username;
            document.getElementById('user-email').value = user.email;
            document.getElementById('user-avatar').value = user.avatar || '';
            document.getElementById('user-password').value = ''; // Don't populate password

            document.getElementById('user-modal-title').textContent = 'Modifica Operatore';

            // Make password optional for edit mode
            const passwordRequired = document.getElementById('password-required');
            if (passwordRequired) passwordRequired.style.display = 'none';

            // Show modal
            const modal = document.getElementById('user-modal');
            modal.style.display = 'block';
            modal.classList.add('show');
        } catch (error) {
            console.error('Error loading user:', error);
            this.showToast('Errore nel caricamento dell\'operatore', 'error');
        }
    }

    async saveUser() {
        const userId = document.getElementById('user-id').value;
        const username = document.getElementById('user-username').value;
        const userData = {
            username: username.toLowerCase().replace(/\s+/g, ''), // username senza spazi
            email: document.getElementById('user-email').value,
            name: username, // nome = username
            displayName: username, // displayName = username
            avatar: document.getElementById('user-avatar').value || null,
            password: document.getElementById('user-password').value || undefined
        };

        // Validate required fields
        if (!username || !userData.email) {
            this.showToast('Compila tutti i campi obbligatori', 'error');
            return;
        }

        // Password required for new users
        if (!userId && !userData.password) {
            this.showToast('La password è obbligatoria per nuovi operatori', 'error');
            return;
        }

        // Remove password if not provided (for updates)
        if (!userData.password) {
            delete userData.password;
        }

        try {
            const url = userId ? `/api/users/${userId}` : '/api/users';
            const method = userId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(userData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save user');
            }

            // Close modal
            const modal = document.getElementById('user-modal');
            modal.style.display = 'none';
            modal.classList.remove('show');

            // Reload users
            await this.loadUsers();

            this.showToast(userId ? 'Operatore aggiornato' : 'Operatore creato', 'success');
        } catch (error) {
            console.error('Error saving user:', error);
            this.showToast(error.message || 'Errore nel salvataggio', 'error');
        }
    }

    async deactivateUser(userId, username) {
        if (!confirm(`Sei sicuro di voler disattivare l'operatore ${username}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to deactivate user');
            }

            await this.loadUsers();
            this.showToast('Operatore disattivato', 'success');
        } catch (error) {
            console.error('Error deactivating user:', error);
            this.showToast('Errore nella disattivazione', 'error');
        }
    }

}

// 🚀 Inizializza app quando DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new DashboardApp();
});

// Debug helpers removed for production