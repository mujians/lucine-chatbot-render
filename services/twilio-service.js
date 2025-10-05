/**
 * 📱 Twilio Notification Service - Lucine di Natale
 * Gestisce invio SMS, WhatsApp e chiamate vocali
 */

import twilio from 'twilio';
import container from '../config/container.js';

class TwilioService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
        
        // Verifica che le credenziali siano valide
        if (this.accountSid && this.authToken && 
            this.accountSid.startsWith('AC') && 
            this.accountSid !== 'your-twilio-account-sid') {
            try {
                this.client = twilio(this.accountSid, this.authToken);
                this.enabled = true;
                console.log('✅ Twilio service initialized');
            } catch (error) {
                this.enabled = false;
                console.warn('⚠️ Twilio initialization failed:', error.message);
            }
        } else {
            this.enabled = false;
            console.warn('⚠️ Twilio credentials missing or invalid - notifications disabled');
        }
    }

    /**
     * 📱 Invia notifica SMS
     */
    async sendSMS(to, message, options = {}) {
        if (!this.enabled) {
            console.log('📱 SMS simulation (Twilio disabled):', { to, message });
            return { success: true, simulation: true };
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                from: this.phoneNumber,
                to: this.formatPhoneNumber(to),
                ...options
            });

            await this.logNotification('SMS', to, message, result.sid, true);
            
            console.log('✅ SMS sent successfully:', result.sid);
            return { success: true, sid: result.sid };

        } catch (error) {
            console.error('❌ SMS send failed:', error);
            await this.logNotification('SMS', to, message, null, false, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 💬 Invia messaggio WhatsApp
     */
    async sendWhatsApp(to, message, options = {}) {
        if (!this.enabled) {
            console.log('💬 WhatsApp simulation (Twilio disabled):', { to, message });
            return { success: true, simulation: true };
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                from: `whatsapp:${this.whatsappNumber}`,
                to: `whatsapp:${this.formatPhoneNumber(to)}`,
                ...options
            });

            await this.logNotification('WHATSAPP', to, message, result.sid, true);
            
            console.log('✅ WhatsApp sent successfully:', result.sid);
            return { success: true, sid: result.sid };

        } catch (error) {
            console.error('❌ WhatsApp send failed:', error);
            await this.logNotification('WHATSAPP', to, message, null, false, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 📧 Invia notifica email (tramite SendGrid)
     */
    async sendEmail(to, subject, message, options = {}) {
        // Implementazione placeholder - in produzione usare SendGrid
        console.log('📧 Email notification:', { to, subject, message });
        
        await this.logNotification('EMAIL', to, `${subject}: ${message}`, 'email-sim', true);
        
        return { success: true, simulation: true };
    }

    /**
     * 🔔 Notifica operatore su nuovo ticket
     */
    async notifyOperatorNewTicket(operatorPhone, ticketNumber, customerContact, priority = 'NORMAL') {
        const urgencyEmoji = priority === 'HIGH' ? '🚨' : priority === 'MEDIUM' ? '⚠️' : 'ℹ️';
        
        const message = `${urgencyEmoji} Nuovo ticket #${ticketNumber}

Cliente: ${customerContact}
Priorità: ${priority}
Ora: ${new Date().toLocaleTimeString('it-IT')}

Rispondi dal dashboard: https://lucine-chatbot.onrender.com/dashboard

- Team Lucine di Natale`;

        return await this.sendWhatsApp(operatorPhone, message);
    }

    /**
     * ⏰ Notifica SLA in scadenza
     */
    async notifySLAWarning(operatorPhone, ticketNumber, timeRemaining) {
        const message = `⏰ ALERT SLA Ticket #${ticketNumber}

Tempo rimanente: ${timeRemaining} minuti
Cliente in attesa di risposta

Gestisci ora: https://lucine-chatbot.onrender.com/dashboard

- Sistema Automatico Lucine`;

        return await this.sendSMS(operatorPhone, message);
    }

    /**
     * 📞 Notifica chiamata urgente
     */
    async notifyUrgentCall(operatorPhone, customerPhone, reason) {
        const message = `📞 CLIENTE URGENTE

Numero: ${customerPhone}
Motivo: ${reason}
Ora: ${new Date().toLocaleTimeString('it-IT')}

Chiamare immediatamente!

- Team Lucine di Natale`;

        return await this.sendSMS(operatorPhone, message);
    }

    /**
     * 🎫 Invia link ripresa chat via WhatsApp (ticket creato)
     */
    async sendTicketResumeLink(customerPhone, ticketNumber, resumeUrl, customerName = 'Cliente') {
        const message = `Ciao ${customerName}! 🎄

Il tuo ticket #${ticketNumber} è stato creato con successo.

📝 Per riprendere la conversazione in qualsiasi momento, clicca qui:
${resumeUrl}

Il link resterà valido e potrai usarlo anche tra giorni.

Grazie per aver scelto Lucine di Natale! ✨

- Team Lucine di Natale`;

        return await this.sendWhatsApp(customerPhone, message);
    }

    /**
     * 🎄 Notifica follow-up cliente
     */
    async sendCustomerFollowUp(customerPhone, customerName, ticketNumber, resolutionType) {
        let message;
        
        if (resolutionType === 'RESOLVED') {
            message = `Ciao ${customerName}! 🎄

Il tuo ticket #${ticketNumber} è stato risolto. 

Tutto ok? Se hai ancora bisogno di aiuto, rispondi a questo messaggio.

Grazie per aver scelto Lucine di Natale! ✨`;
        } else {
            message = `Ciao ${customerName}! 🎄

Riguardo al tuo ticket #${ticketNumber}, il nostro team sta lavorando per risolverlo.

Ti aggiorneremo presto. Per urgenze: chiama 800-LUCINE

- Team Lucine di Natale`;
        }

        return await this.sendWhatsApp(customerPhone, message);
    }

    /**
     * 📊 Invio report giornaliero a manager
     */
    async sendDailyReport(managerPhone, reportData) {
        const message = `📊 Report Giornaliero Lucine

🎫 Ticket: ${reportData.totalTickets} (${reportData.resolvedTickets} risolti)
💬 Chat: ${reportData.totalChats}
⭐ Soddisfazione: ${reportData.avgSatisfaction}/5
⏱️ Tempo medio risposta: ${reportData.avgResponseTime}min

Top Issues:
${reportData.topIssues.map(issue => `• ${issue}`).join('\n')}

Dashboard: https://lucine-chatbot.onrender.com/dashboard`;

        return await this.sendWhatsApp(managerPhone, message);
    }

    /**
     * 📱 Invio di notifiche massive per comunicazioni importanti
     */
    async sendBroadcast(recipients, message, type = 'WHATSAPP') {
        console.log(`📢 Sending broadcast to ${recipients.length} recipients via ${type}`);
        
        const results = [];
        
        for (const recipient of recipients) {
            let result;
            
            if (type === 'WHATSAPP') {
                result = await this.sendWhatsApp(recipient, message);
            } else if (type === 'SMS') {
                result = await this.sendSMS(recipient, message);
            } else {
                result = { success: false, error: 'Invalid type' };
            }
            
            results.push({ recipient, ...result });
            
            // Rate limiting - pausa tra messaggi
            await this.sleep(1000);
        }
        
        console.log(`📢 Broadcast completed: ${results.filter(r => r.success).length}/${recipients.length} sent`);
        return results;
    }

    /**
     * 🔧 Helper: Formatta numero di telefono per Twilio
     */
    formatPhoneNumber(phone) {
        // Rimuovi spazi e caratteri speciali
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');
        
        // Aggiungi prefisso Italia se manca
        if (cleaned.startsWith('3') && cleaned.length === 10) {
            cleaned = '+39' + cleaned;
        } else if (!cleaned.startsWith('+')) {
            cleaned = '+39' + cleaned;
        }
        
        return cleaned;
    }

    /**
     * 📝 Log notifiche per analytics
     */
    async logNotification(type, recipient, message, externalId, success, error = null) {
        const prisma = container.get('prisma');
        try {
            await prisma.analytics.create({
                data: {
                    eventType: 'notification_sent',
                    eventData: {
                        type,
                        recipient: this.maskPhoneNumber(recipient),
                        messageLength: message.length,
                        externalId,
                        success,
                        error
                    },
                    successful: success
                }
            });
        } catch (logError) {
            console.error('Failed to log notification:', logError);
        }
    }

    /**
     * 🔒 Maschera numero per privacy
     */
    maskPhoneNumber(phone) {
        if (!phone || phone.length < 4) return '****';
        return phone.slice(0, 3) + '****' + phone.slice(-2);
    }

    /**
     * ⏱️ Helper: Sleep per rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 📊 Ottieni statistiche notifiche
     */
    async getNotificationStats(days = 7) {
        const prisma = container.get('prisma');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const notifications = await prisma.analytics.findMany({
            where: {
                eventType: 'notification_sent',
                timestamp: { gte: startDate }
            }
        });

        const stats = {
            total: notifications.length,
            successful: notifications.filter(n => n.successful).length,
            byType: {},
            failureRate: 0
        };

        notifications.forEach(notification => {
            const type = notification.eventData.type;
            if (!stats.byType[type]) {
                stats.byType[type] = { total: 0, successful: 0 };
            }
            stats.byType[type].total++;
            if (notification.successful) {
                stats.byType[type].successful++;
            }
        });

        stats.failureRate = ((stats.total - stats.successful) / stats.total * 100).toFixed(2);

        return stats;
    }

    /**
     * 🧪 Test connessione Twilio
     */
    async testConnection() {
        if (!this.enabled) {
            return { success: false, error: 'Twilio not configured' };
        }

        try {
            // Test basic account info
            const account = await this.client.api.accounts(this.accountSid).fetch();
            
            return {
                success: true,
                accountStatus: account.status,
                balance: account.balance || 'N/A',
                name: account.friendlyName
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
export const twilioService = new TwilioService();

// Named exports for individual methods
export const {
    sendSMS,
    sendWhatsApp,
    sendEmail,
    notifyOperatorNewTicket,
    notifySLAWarning,
    sendCustomerFollowUp,
    sendDailyReport,
    testConnection
} = twilioService;