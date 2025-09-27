/**
 * 🔔 Service Worker - Lucine di Natale Dashboard
 * Handles background notifications and offline functionality
 */

const CACHE_NAME = 'lucine-dashboard-v1';
const CACHE_URLS = [
    '/dashboard/',
    '/dashboard/index.html',
    '/dashboard/css/dashboard.css',
    '/dashboard/js/dashboard.js',
    '/dashboard/js/notifications.js',
    '/dashboard/icons/notification-icon.png',
    '/dashboard/icons/badge-icon.png'
];

/**
 * 📦 Service Worker Installation
 */
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching dashboard files...');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('✅ Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('❌ Service Worker installation failed:', error);
            })
    );
});

/**
 * 🔄 Service Worker Activation
 */
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * 🌐 Fetch Event Handler (Offline Support)
 */
self.addEventListener('fetch', (event) => {
    // Only handle dashboard requests
    if (!event.request.url.includes('/dashboard/')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if available
                if (response) {
                    return response;
                }
                
                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Cache successful responses
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return response;
                    })
                    .catch(() => {
                        // Return offline page if available
                        if (event.request.mode === 'navigate') {
                            return caches.match('/dashboard/offline.html');
                        }
                    });
            })
    );
});

/**
 * 🔔 Push Event Handler
 */
self.addEventListener('push', (event) => {
    console.log('🔔 Push notification received:', event);
    
    let notificationData = {
        title: 'Lucine di Natale',
        body: 'Hai ricevuto una nuova notifica',
        icon: '/dashboard/icons/notification-icon.png',
        badge: '/dashboard/icons/badge-icon.png',
        tag: 'default',
        data: {}
    };
    
    // Parse push data if available
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = { ...notificationData, ...pushData };
        } catch (error) {
            console.error('❌ Error parsing push data:', error);
            notificationData.body = event.data.text() || notificationData.body;
        }
    }
    
    // Enhanced notification options
    const notificationOptions = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: notificationData.data,
        requireInteraction: notificationData.requireInteraction || false,
        actions: notificationData.actions || [],
        vibrate: getVibrationPattern(notificationData.type),
        timestamp: Date.now()
    };
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationOptions)
            .then(() => {
                console.log('✅ Push notification shown successfully');
            })
            .catch((error) => {
                console.error('❌ Error showing push notification:', error);
            })
    );
});

/**
 * 🖱️ Notification Click Handler
 */
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    
    const notification = event.notification;
    const data = notification.data || {};
    
    // Close notification
    notification.close();
    
    // Handle notification actions
    if (event.action) {
        handleNotificationAction(event.action, data);
        return;
    }
    
    // Default click behavior - open dashboard
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if dashboard is already open
                for (const client of clientList) {
                    if (client.url.includes('/dashboard') && 'focus' in client) {
                        // Focus existing dashboard
                        return client.focus().then(() => {
                            // Send message to dashboard with notification data
                            return client.postMessage({
                                type: 'notification_clicked',
                                data: data
                            });
                        });
                    }
                }
                
                // Open new dashboard window
                if (clients.openWindow) {
                    return clients.openWindow('/dashboard/').then((client) => {
                        // Send notification data to new window
                        setTimeout(() => {
                            if (client) {
                                client.postMessage({
                                    type: 'notification_clicked',
                                    data: data
                                });
                            }
                        }, 1000);
                    });
                }
            })
            .catch((error) => {
                console.error('❌ Error handling notification click:', error);
            })
    );
});

/**
 * 🚫 Notification Close Handler
 */
self.addEventListener('notificationclose', (event) => {
    console.log('🔔 Notification closed:', event);
    
    // Track notification dismissal for analytics
    const data = event.notification.data || {};
    if (data.trackDismissal) {
        // Could send analytics event here
        console.log('📊 Notification dismissed:', data);
    }
});

/**
 * 💬 Message Handler (Communication with Dashboard)
 */
self.addEventListener('message', (event) => {
    console.log('💬 Service Worker message received:', event.data);
    
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0].postMessage({
                type: 'VERSION',
                version: CACHE_NAME
            });
            break;
            
        case 'CLEAR_CACHE':
            clearCache().then(() => {
                event.ports[0].postMessage({
                    type: 'CACHE_CLEARED',
                    success: true
                });
            });
            break;
            
        case 'SHOW_NOTIFICATION':
            showCustomNotification(data);
            break;
            
        default:
            console.log('🤷 Unknown message type:', type);
    }
});

/**
 * 🎯 Handle notification actions
 */
function handleNotificationAction(action, data) {
    console.log('🎯 Notification action:', action, data);
    
    switch (action) {
        case 'open':
            // Open specific page based on notification type
            if (data.sessionId) {
                clients.openWindow(`/dashboard/?chat=${data.sessionId}`);
            } else if (data.ticketId) {
                clients.openWindow(`/dashboard/?ticket=${data.ticketId}`);
            } else {
                clients.openWindow('/dashboard/');
            }
            break;
            
        case 'dismiss':
            // Just dismiss - no action needed
            console.log('🚫 Notification dismissed by user');
            break;
            
        case 'snooze':
            // Re-show notification after delay
            setTimeout(() => {
                self.registration.showNotification(data.title || 'Promemoria', {
                    body: data.body || 'Hai una richiesta in sospeso',
                    tag: data.tag || 'snooze',
                    data: data
                });
            }, 5 * 60 * 1000); // 5 minutes
            break;
            
        default:
            console.log('🤷 Unknown notification action:', action);
    }
}

/**
 * 📳 Get vibration pattern for notification type
 */
function getVibrationPattern(type) {
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
 * 🔔 Show custom notification from dashboard
 */
function showCustomNotification(notificationData) {
    const options = {
        body: notificationData.body || '',
        icon: notificationData.icon || '/dashboard/icons/notification-icon.png',
        badge: notificationData.badge || '/dashboard/icons/badge-icon.png',
        tag: notificationData.tag || 'custom',
        data: notificationData.data || {},
        requireInteraction: notificationData.requireInteraction || false,
        actions: notificationData.actions || [],
        vibrate: getVibrationPattern(notificationData.type)
    };
    
    self.registration.showNotification(
        notificationData.title || 'Lucine di Natale',
        options
    );
}

/**
 * 🗑️ Clear cache
 */
async function clearCache() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('🗑️ All caches cleared');
        return true;
    } catch (error) {
        console.error('❌ Error clearing cache:', error);
        return false;
    }
}

/**
 * 📊 Background sync (for future use)
 */
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    try {
        // Could sync offline actions here
        console.log('🔄 Performing background sync...');
        return Promise.resolve();
    } catch (error) {
        console.error('❌ Background sync failed:', error);
        throw error;
    }
}

console.log('🔔 Service Worker loaded successfully');