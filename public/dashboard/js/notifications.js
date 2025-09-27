/**
 * 🔔 Browser Push Notifications - Lucine di Natale
 * Comprehensive notification system with sound and visual alerts
 */

class NotificationManager {
    constructor() {
        this.permission = 'default';
        this.sounds = {
            newChat: '/dashboard/sounds/new-chat.mp3',
            newMessage: '/dashboard/sounds/new-message.mp3',
            urgent: '/dashboard/sounds/urgent.mp3',
            success: '/dashboard/sounds/success.mp3'
        };
        this.settings = {
            enabled: true,
            sound: true,
            vibration: true,
            persistent: true,
            volume: 0.7
        };
        
        this.init();
    }

    /**
     * 🚀 Initialize notification system
     */
    async init() {
        console.log('🔔 Initializing notification system...');
        
        // Load settings from localStorage
        this.loadSettings();
        
        // Check browser support
        if (!('Notification' in window)) {
            console.warn('❌ Browser does not support notifications');
            return false;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.warn('❌ Browser does not support service workers');
            return false;
        }
        
        // Get current permission status
        this.permission = Notification.permission;
        console.log('🔐 Current notification permission:', this.permission);
        
        // Register service worker for persistent notifications
        await this.registerServiceWorker();
        
        // Preload notification sounds
        this.preloadSounds();
        
        return true;
    }

    /**
     * 📋 Load settings from localStorage
     */
    loadSettings() {
        const saved = localStorage.getItem('notification_settings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
                console.log('📋 Loaded notification settings:', this.settings);
            } catch (error) {
                console.error('❌ Error loading notification settings:', error);
            }
        }
    }

    /**
     * 💾 Save settings to localStorage
     */
    saveSettings() {
        localStorage.setItem('notification_settings', JSON.stringify(this.settings));
        console.log('💾 Notification settings saved');
    }

    /**
     * 🔧 Register service worker
     */
    async registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/dashboard/sw.js');
            console.log('✅ Service Worker registered:', registration);
            this.swRegistration = registration;
            return registration;
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            return null;
        }
    }

    /**
     * 🔊 Preload notification sounds
     */
    preloadSounds() {
        Object.entries(this.sounds).forEach(([key, url]) => {
            const audio = new Audio(url);
            audio.preload = 'auto';
            audio.volume = this.settings.volume;
            this.sounds[key] = audio;
        });
        console.log('🔊 Notification sounds preloaded');
    }

    /**
     * 🙋 Request notification permission
     */
    async requestPermission() {
        if (this.permission === 'granted') {
            return true;
        }

        if (this.permission === 'denied') {
            this.showPermissionDeniedMessage();
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            console.log('🔐 Notification permission result:', permission);
            
            if (permission === 'granted') {
                this.showPermissionGrantedMessage();
                // Test notification
                this.show({
                    title: '🎄 Notifiche Attivate',
                    body: 'Riceverai avvisi per nuove chat e messaggi',
                    type: 'success'
                });
                return true;
            } else {
                this.showPermissionDeniedMessage();
                return false;
            }
        } catch (error) {
            console.error('❌ Error requesting notification permission:', error);
            return false;
        }
    }

    /**
     * 🔔 Show notification
     */
    async show(options = {}) {
        if (!this.settings.enabled) {
            console.log('🔕 Notifications disabled in settings');
            return null;
        }

        const {
            title = 'Lucine di Natale',
            body = '',
            icon = '/dashboard/icons/notification-icon.png',
            badge = '/dashboard/icons/badge-icon.png',
            tag = 'default',
            type = 'info',
            data = {},
            actions = [],
            requireInteraction = false,
            silent = false
        } = options;

        // Play sound if enabled
        if (this.settings.sound && !silent) {
            this.playSound(type);
        }

        // Vibrate if enabled and supported
        if (this.settings.vibration && 'vibrate' in navigator) {
            navigator.vibrate(this.getVibrationPattern(type));
        }

        // Check permission
        if (this.permission !== 'granted') {
            console.log('🔒 Notification permission not granted');
            // Fallback to in-app notification
            this.showInAppNotification({ title, body, type });
            return null;
        }

        try {
            // Create notification
            const notification = new Notification(title, {
                body,
                icon,
                badge,
                tag,
                data: {
                    ...data,
                    timestamp: Date.now(),
                    type
                },
                actions,
                requireInteraction: requireInteraction || this.settings.persistent,
                silent
            });

            // Handle notification events
            notification.onclick = (event) => {
                console.log('🔔 Notification clicked:', event);
                this.handleNotificationClick(event);
            };

            notification.onclose = (event) => {
                console.log('🔔 Notification closed:', event);
            };

            notification.onerror = (event) => {
                console.error('❌ Notification error:', event);
            };

            // Auto-close after delay (unless persistent)
            if (!requireInteraction && !this.settings.persistent) {
                setTimeout(() => {
                    notification.close();
                }, 5000);
            }

            console.log('🔔 Notification shown:', { title, body, type });
            return notification;

        } catch (error) {
            console.error('❌ Error showing notification:', error);
            // Fallback to in-app notification
            this.showInAppNotification({ title, body, type });
            return null;
        }
    }

    /**
     * 🔊 Play notification sound
     */
    playSound(type) {
        try {
            const soundKey = this.getSoundForType(type);
            const audio = this.sounds[soundKey];
            
            if (audio && typeof audio.play === 'function') {
                audio.currentTime = 0;
                audio.volume = this.settings.volume;
                audio.play().catch(error => {
                    console.warn('🔊 Could not play notification sound:', error);
                });
            }
        } catch (error) {
            console.error('❌ Error playing notification sound:', error);
        }
    }

    /**
     * 📳 Get vibration pattern for type
     */
    getVibrationPattern(type) {
        const patterns = {
            newChat: [200, 100, 200],
            newMessage: [100],
            urgent: [300, 100, 300, 100, 300],
            success: [100, 50, 100],
            default: [150]
        };
        return patterns[type] || patterns.default;
    }

    /**
     * 🔊 Get sound for notification type
     */
    getSoundForType(type) {
        const mapping = {
            newChat: 'newChat',
            newMessage: 'newMessage',
            urgent: 'urgent',
            success: 'success',
            error: 'urgent',
            warning: 'newMessage'
        };
        return mapping[type] || 'newMessage';
    }

    /**
     * 🖱️ Handle notification click
     */
    handleNotificationClick(event) {
        event.preventDefault();
        
        const data = event.target.data || {};
        
        // Focus or open dashboard window
        if (window.focus) {
            window.focus();
        }
        
        // Handle specific notification types
        switch (data.type) {
            case 'newChat':
                if (data.sessionId && window.dashboardApp) {
                    window.dashboardApp.switchSection('chats');
                    // Try to open specific chat
                    setTimeout(() => {
                        window.dashboardApp.openChatWindow(data.sessionId);
                    }, 100);
                }
                break;
                
            case 'newMessage':
                if (data.sessionId && window.dashboardApp) {
                    window.dashboardApp.switchSection('chats');
                }
                break;
                
            case 'newTicket':
                if (window.dashboardApp) {
                    window.dashboardApp.switchSection('tickets');
                }
                break;
                
            default:
                console.log('🔔 Notification clicked - no specific action');
        }
        
        // Close notification
        event.target.close();
    }

    /**
     * 📱 Show in-app notification (fallback)
     */
    showInAppNotification({ title, body, type }) {
        if (window.dashboardApp && typeof window.dashboardApp.showToast === 'function') {
            window.dashboardApp.showToast(`${title}: ${body}`, type);
        } else {
            console.log('📱 In-app notification:', { title, body, type });
        }
    }

    /**
     * 🎯 Notification presets for common scenarios
     */
    async showNewChatNotification(data) {
        return this.show({
            title: '💬 Nuova Chat Assegnata',
            body: `Cliente: "${data.message || 'Nuova richiesta di supporto'}"`,
            type: 'newChat',
            icon: '/dashboard/icons/chat-icon.png',
            tag: `chat-${data.sessionId}`,
            data: {
                type: 'newChat',
                sessionId: data.sessionId,
                operatorId: data.operatorId
            },
            actions: [
                {
                    action: 'open',
                    title: 'Apri Chat',
                    icon: '/dashboard/icons/open-icon.png'
                },
                {
                    action: 'dismiss',
                    title: 'Ignora',
                    icon: '/dashboard/icons/dismiss-icon.png'
                }
            ],
            requireInteraction: true
        });
    }

    async showNewMessageNotification(data) {
        return this.show({
            title: '📝 Nuovo Messaggio',
            body: data.message || 'Hai ricevuto un nuovo messaggio',
            type: 'newMessage',
            tag: `message-${data.sessionId}`,
            data: {
                type: 'newMessage',
                sessionId: data.sessionId,
                messageId: data.messageId
            }
        });
    }

    async showUrgentNotification(data) {
        return this.show({
            title: '🚨 Richiesta Urgente',
            body: data.message || 'Attenzione richiesta urgente',
            type: 'urgent',
            requireInteraction: true,
            data: {
                type: 'urgent',
                ...data
            }
        });
    }

    async showTicketNotification(data) {
        return this.show({
            title: '🎫 Nuovo Ticket',
            body: `Ticket #${data.ticketId}: ${data.subject}`,
            type: 'newTicket',
            data: {
                type: 'newTicket',
                ticketId: data.ticketId
            }
        });
    }

    /**
     * ⚙️ Settings management
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
        
        // Update sound volumes
        if (newSettings.volume !== undefined) {
            Object.values(this.sounds).forEach(audio => {
                if (audio && typeof audio === 'object') {
                    audio.volume = this.settings.volume;
                }
            });
        }
        
        console.log('⚙️ Notification settings updated:', this.settings);
    }

    getSettings() {
        return { ...this.settings };
    }

    /**
     * 🔕 Enable/disable notifications
     */
    enable() {
        this.settings.enabled = true;
        this.saveSettings();
    }

    disable() {
        this.settings.enabled = false;
        this.saveSettings();
    }

    /**
     * 📊 Permission status messages
     */
    showPermissionGrantedMessage() {
        if (window.dashboardApp) {
            window.dashboardApp.showToast(
                'Notifiche browser attivate! Riceverai avvisi per nuove chat e messaggi',
                'success'
            );
        }
    }

    showPermissionDeniedMessage() {
        if (window.dashboardApp) {
            window.dashboardApp.showToast(
                'Notifiche browser disabilitate. Abilita dalle impostazioni del browser per ricevere avvisi',
                'warning'
            );
        }
    }

    /**
     * 🧪 Test notification
     */
    async test() {
        const testNotifications = [
            {
                title: '💬 Test Chat',
                body: 'Questa è una notifica di test per nuova chat',
                type: 'newChat'
            },
            {
                title: '📝 Test Messaggio',
                body: 'Questa è una notifica di test per nuovo messaggio',
                type: 'newMessage'
            },
            {
                title: '🚨 Test Urgente',
                body: 'Questa è una notifica di test urgente',
                type: 'urgent'
            }
        ];

        for (let i = 0; i < testNotifications.length; i++) {
            setTimeout(() => {
                this.show(testNotifications[i]);
            }, i * 2000);
        }
    }

    /**
     * 🔄 Reset to defaults
     */
    reset() {
        this.settings = {
            enabled: true,
            sound: true,
            vibration: true,
            persistent: true,
            volume: 0.7
        };
        this.saveSettings();
        console.log('🔄 Notification settings reset to defaults');
    }
}

// Initialize global notification manager
window.notificationManager = new NotificationManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}