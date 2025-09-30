/**
 * 🎯 Business Logic Engine - Lucine di Natale
 * Implementazione completa del flusso ottimale a 12 step
 */

import { prisma } from '../server.js';
import { notifyOperators } from '../server.js';

/**
 * 📊 Business Logic Flow Manager
 * Gestisce il flusso completo del customer journey
 */
export class BusinessLogicEngine {
    constructor() {
        this.flowSteps = {
            WELCOME: 1,
            INFO_GATHERING: 2,
            INTENT_ANALYSIS: 3,
            AUTO_RESPONSE: 4,
            ESCALATION_CHECK: 5,
            OPERATOR_ASSIGNMENT: 6,
            QUEUE_MANAGEMENT: 7,
            LIVE_CHAT: 8,
            FOLLOW_UP: 9,
            FEEDBACK: 10,
            ANALYTICS: 11,
            IMPROVEMENT: 12
        };
        
        this.sessionFlowState = new Map();
    }

    /**
     * STEP 1: 🎄 Accoglienza Cliente
     * Messaggio di benvenuto personalizzato basato su orario e contesto
     */
    async welcomeCustomer(sessionId, metadata = {}) {
        console.log(`🎄 STEP 1: Welcome customer for session ${sessionId}`);
        
        const hour = new Date().getHours();
        let greeting;
        
        // Saluto basato sull'orario
        if (hour >= 5 && hour < 12) {
            greeting = "Buongiorno! ☀️";
        } else if (hour >= 12 && hour < 18) {
            greeting = "Buon pomeriggio! 🌤️";
        } else {
            greeting = "Buonasera! 🌙";
        }
        
        const welcomeMessage = `${greeting} Benvenuto nel servizio assistenza Lucine di Natale! 🎄✨

Sono Lucy, il tuo assistente virtuale specializzato in illuminazione natalizia. 

Come posso aiutarti oggi?
• 🛍️ Informazioni prodotti
• 📦 Stato ordine
• 🔧 Assistenza tecnica
• 💡 Consigli per installazione
• 🎨 Idee decorative

Scrivi la tua domanda o scegli un'opzione!`;

        // Salva stato del flusso
        this.sessionFlowState.set(sessionId, {
            currentStep: this.flowSteps.WELCOME,
            startTime: new Date(),
            metadata
        });

        // Registra analytics
        await this.recordAnalytics(sessionId, 'welcome_shown', { hour, greeting });

        return {
            message: welcomeMessage,
            quickReplies: [
                'Info prodotti',
                'Stato ordine', 
                'Problema tecnico',
                'Consigli installazione'
            ],
            nextStep: this.flowSteps.INFO_GATHERING
        };
    }

    /**
     * STEP 2: 📋 Raccolta Informazioni
     * Raccoglie info contestuali dal cliente
     */
    async gatherInfo(sessionId, userInput, existingInfo = {}) {
        console.log(`📋 STEP 2: Gathering info for session ${sessionId}`);
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        const collectedInfo = { ...existingInfo };
        
        // Estrai informazioni dal messaggio
        const infoPatterns = {
            orderNumber: /\b([A-Z0-9]{6,12})\b/,
            email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
            phone: /(\+?39)?[\s.-]?([0-9]{3})[\s.-]?([0-9]{3,4})[\s.-]?([0-9]{4})/,
            productModel: /(lucine|serie|modello|catena|tenda|rete|cascata)\s+([A-Z0-9-]+)/i,
            problem: /(non funziona|rotto|guasto|difetto|problema|aiuto)/i
        };
        
        for (const [key, pattern] of Object.entries(infoPatterns)) {
            const match = userInput.match(pattern);
            if (match) {
                collectedInfo[key] = match[0];
            }
        }
        
        // Determina quali info mancano
        const requiredInfo = this.determineRequiredInfo(userInput, collectedInfo);
        
        if (requiredInfo.length > 0) {
            // Richiedi info mancanti
            const question = this.generateInfoQuestion(requiredInfo[0]);
            
            this.sessionFlowState.set(sessionId, {
                ...flowState,
                currentStep: this.flowSteps.INFO_GATHERING,
                collectedInfo,
                pendingInfo: requiredInfo
            });
            
            return {
                message: question,
                requiresInput: true,
                nextStep: this.flowSteps.INFO_GATHERING
            };
        }
        
        // Info complete, procedi all'analisi
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.INTENT_ANALYSIS,
            collectedInfo
        });
        
        return {
            collectedInfo,
            nextStep: this.flowSteps.INTENT_ANALYSIS
        };
    }

    /**
     * STEP 3: 🔍 Analisi Intent
     * Comprende l'intenzione del cliente usando AI/pattern matching
     */
    async analyzeIntent(sessionId, userInput, collectedInfo) {
        console.log(`🔍 STEP 3: Analyzing intent for session ${sessionId}`);
        
        // Pattern per riconoscere gli intent
        const intentPatterns = {
            ORDER_STATUS: {
                patterns: [/stato ordine/i, /dove.*pacco/i, /quando arriv/i, /tracking/i, /spedizione/i],
                confidence: 0
            },
            TECHNICAL_SUPPORT: {
                patterns: [/non funziona/i, /rott[oi]/i, /guast[oi]/i, /problema/i, /aiuto tecnico/i],
                confidence: 0
            },
            PRODUCT_INFO: {
                patterns: [/informazioni/i, /caratteristiche/i, /prezzo/i, /disponibil/i, /modell[oi]/i],
                confidence: 0
            },
            INSTALLATION: {
                patterns: [/install/i, /montaggio/i, /come si monta/i, /istruzioni/i, /manuale/i],
                confidence: 0
            },
            RETURN_REFUND: {
                patterns: [/reso/i, /rimborso/i, /restitu/i, /garanzia/i, /cambio/i],
                confidence: 0
            },
            DECORATING_IDEAS: {
                patterns: [/idee/i, /consigl/i, /decorare/i, /ispirazione/i, /esempi/i],
                confidence: 0
            }
        };
        
        // Calcola confidence per ogni intent
        const input = userInput.toLowerCase();
        for (const [intent, data] of Object.entries(intentPatterns)) {
            for (const pattern of data.patterns) {
                if (pattern.test(input)) {
                    data.confidence += 1;
                }
            }
        }
        
        // Trova intent con confidence più alta
        let detectedIntent = 'GENERAL_INQUIRY';
        let maxConfidence = 0;
        
        for (const [intent, data] of Object.entries(intentPatterns)) {
            if (data.confidence > maxConfidence) {
                maxConfidence = data.confidence;
                detectedIntent = intent;
            }
        }
        
        // Determina urgenza
        const urgency = this.calculateUrgency(userInput, detectedIntent);
        
        // Salva analisi
        const analysis = {
            intent: detectedIntent,
            confidence: maxConfidence,
            urgency,
            keywords: this.extractKeywords(userInput),
            sentiment: this.analyzeSentiment(userInput),
            requiresHuman: maxConfidence === 0 || urgency === 'HIGH'
        };
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.AUTO_RESPONSE,
            intentAnalysis: analysis
        });
        
        await this.recordAnalytics(sessionId, 'intent_detected', analysis);
        
        return {
            ...analysis,
            nextStep: this.flowSteps.AUTO_RESPONSE
        };
    }

    /**
     * STEP 4: 🤖 Risposta Automatica
     * Fornisce risposta automatica se possibile
     */
    async generateAutoResponse(sessionId, intent, collectedInfo) {
        console.log(`🤖 STEP 4: Generating auto response for session ${sessionId}`);
        
        const responses = {
            ORDER_STATUS: async () => {
                if (!collectedInfo.orderNumber) {
                    return {
                        message: "Per verificare lo stato del tuo ordine, ho bisogno del numero d'ordine. Puoi trovarlo nell'email di conferma. Qual è il tuo numero d'ordine?",
                        requiresInput: true
                    };
                }
                
                // Simula ricerca ordine
                return {
                    message: `📦 Ho trovato il tuo ordine ${collectedInfo.orderNumber}!

Stato: In spedizione 🚚
Corriere: BRT
Tracking: BR123456789IT
Consegna prevista: Domani entro le 18:00

Puoi tracciare il pacco su: www.brt.it/tracking

Posso aiutarti con altro?`,
                    resolved: true
                };
            },
            
            TECHNICAL_SUPPORT: async () => {
                return {
                    message: `🔧 Capisco che stai riscontrando un problema tecnico. Proviamo a risolverlo insieme!

Prima di tutto, verifica questi punti comuni:

1. ✅ Controlla che la spina sia ben inserita
2. ✅ Verifica che l'interruttore sia su ON
3. ✅ Controlla il fusibile nel trasformatore
4. ✅ Assicurati che non ci siano fili danneggiati

Se il problema persiste, posso metterti in contatto con un tecnico specializzato. Vuoi procedere?`,
                    quickReplies: ['Ho risolto!', 'Problema persiste', 'Parla con tecnico'],
                    requiresFollowUp: true
                };
            },
            
            PRODUCT_INFO: async () => {
                return {
                    message: `💡 Ecco le nostre categorie di prodotti più popolari:

🎄 **Catene Luminose**
- Serie Classic: 100-1000 LED (€15-60)
- Serie Smart: Controllo WiFi (€35-120)
- Serie Solar: Energia solare (€25-80)

🏠 **Decorazioni Casa**
- Tende luminose: 2x2m, 3x3m (€30-90)
- Reti: Varie dimensioni (€40-150)
- Cascate: Effetto neve (€50-120)

🎨 **Effetti Speciali**
- Multicolor RGB con telecomando
- Musica sincronizzata
- Effetti programmabili

Quale categoria ti interessa approfondire?`,
                    quickReplies: ['Catene', 'Tende', 'Reti', 'Effetti speciali'],
                    resolved: false
                };
            },
            
            INSTALLATION: async () => {
                return {
                    message: `🔨 Ecco alcuni consigli per l'installazione:

**Preparazione:**
1. Pianifica il design prima di iniziare
2. Misura gli spazi da decorare
3. Calcola la lunghezza necessaria

**Installazione sicura:**
• Usa ganci appositi, non chiodi
• Non tirare troppo i cavi
• Proteggi le connessioni dalla pioggia
• Usa prolunghe certificate per esterni

**Tips PRO:**
✨ Inizia dall'alto verso il basso
✨ Testa le luci prima di installarle
✨ Usa un timer per automazione
✨ Mantieni 10cm di distanza tra le file

Vuoi ricevere il manuale PDF completo via email?`,
                    quickReplies: ['Sì, invia manuale', 'No grazie', 'Ho altre domande'],
                    resolved: false
                };
            },
            
            RETURN_REFUND: async () => {
                return {
                    message: `📦 Politica resi e rimborsi:

**Diritto di recesso:**
• 30 giorni per il reso (invece dei 14 standard!)
• Prodotto integro con imballo originale
• Rimborso completo entro 14 giorni

**Come fare il reso:**
1. Compila il modulo su lucinedinatale.it/resi
2. Ricevi etichetta prepagata via email
3. Spedisci gratuitamente con nostro corriere
4. Rimborso automatico appena riceviamo il pacco

**Garanzia:**
• 2 anni su tutti i prodotti
• Sostituzione immediata per difetti

Vuoi iniziare una procedura di reso?`,
                    quickReplies: ['Inizia reso', 'Info garanzia', 'Contatta supporto'],
                    requiresFollowUp: true
                };
            },
            
            DECORATING_IDEAS: async () => {
                return {
                    message: `🎨 Idee creative per le tue decorazioni:

**Stile Classico Elegante:**
• Luci bianche calde su albero e finestre
• Cascate luminose per effetto neve
• Ghirlande luminose su porte e scale

**Stile Moderno Colorato:**
• RGB programmabili con app
• Sincronizzazione musicale
• Effetti dinamici e pattern

**Stile Minimal Chic:**
• Micro LED quasi invisibili
• Forme geometriche luminose
• Toni monocromatici

**Trend 2024:**
🌟 Proiezioni olografiche
🌟 Luci solari eco-friendly
🌟 Integrazione smart home

Vuoi ricevere la nostra guida "50 idee luminose per Natale"?`,
                    quickReplies: ['Sì, invia guida', 'Altri stili', 'Prodotti consigliati'],
                    resolved: false
                };
            }
        };
        
        const responseGenerator = responses[intent] || responses.GENERAL_INQUIRY;
        const response = await responseGenerator();
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        
        if (response.resolved) {
            // Caso risolto automaticamente
            this.sessionFlowState.set(sessionId, {
                ...flowState,
                currentStep: this.flowSteps.FEEDBACK
            });
            response.nextStep = this.flowSteps.FEEDBACK;
        } else if (response.requiresFollowUp) {
            // Necessita follow-up
            this.sessionFlowState.set(sessionId, {
                ...flowState,
                currentStep: this.flowSteps.ESCALATION_CHECK
            });
            response.nextStep = this.flowSteps.ESCALATION_CHECK;
        }
        
        await this.recordAnalytics(sessionId, 'auto_response_sent', { intent, resolved: response.resolved });
        
        return response;
    }

    /**
     * STEP 5: 📈 Escalation Intelligente
     * Valuta se escalare a operatore umano
     */
    async checkEscalation(sessionId, context) {
        console.log(`📈 STEP 5: Checking escalation for session ${sessionId}`);
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        const { intentAnalysis = {}, collectedInfo = {} } = flowState;
        
        // Criteri di escalation
        const escalationCriteria = {
            highUrgency: intentAnalysis.urgency === 'HIGH',
            lowConfidence: intentAnalysis.confidence < 0.3,
            negativeS sentiment: intentAnalysis.sentiment === 'NEGATIVE',
            complexQuery: context.messageCount > 3 && !context.resolved,
            explicitRequest: /operator|umano|persona|aiuto/i.test(context.lastMessage),
            technicalIssue: intentAnalysis.intent === 'TECHNICAL_SUPPORT' && context.triedTroubleshooting
        };
        
        // Calcola escalation score
        let escalationScore = 0;
        const reasons = [];
        
        for (const [criterion, triggered] of Object.entries(escalationCriteria)) {
            if (triggered) {
                escalationScore++;
                reasons.push(criterion);
            }
        }
        
        const shouldEscalate = escalationScore >= 2 || escalationCriteria.explicitRequest;
        
        if (shouldEscalate) {
            console.log(`✅ Escalation triggered for session ${sessionId}. Reasons:`, reasons);
            
            this.sessionFlowState.set(sessionId, {
                ...flowState,
                currentStep: this.flowSteps.OPERATOR_ASSIGNMENT,
                escalationReasons: reasons
            });
            
            await this.recordAnalytics(sessionId, 'escalation_triggered', { reasons, score: escalationScore });
            
            return {
                escalate: true,
                reasons,
                priority: escalationScore >= 3 ? 'HIGH' : 'NORMAL',
                nextStep: this.flowSteps.OPERATOR_ASSIGNMENT
            };
        }
        
        return {
            escalate: false,
            nextStep: this.flowSteps.FOLLOW_UP
        };
    }

    /**
     * STEP 6: 👤 Assegnazione Operatore
     * Assegna l'operatore più adatto
     */
    async assignOperator(sessionId, priority = 'NORMAL', specialization = null) {
        console.log(`👤 STEP 6: Assigning operator for session ${sessionId}`);
        
        // Trova operatori disponibili
        const operators = await prisma.operator.findMany({
            where: {
                isOnline: true,
                isActive: true,
                ...(specialization && { specialization })
            },
            include: {
                chats: {
                    where: { endedAt: null }
                }
            }
        });
        
        if (operators.length === 0) {
            // Nessun operatore disponibile
            return {
                assigned: false,
                message: "Al momento tutti i nostri operatori sono occupati. Riceverai assistenza appena possibile. Nel frattempo, posso continuare ad aiutarti io!",
                fallback: 'QUEUE',
                nextStep: this.flowSteps.QUEUE_MANAGEMENT
            };
        }
        
        // Ordina per carico di lavoro
        operators.sort((a, b) => a.chats.length - b.chats.length);
        
        // Assegna al meno carico
        const selectedOperator = operators[0];
        
        // Crea chat operatore
        const operatorChat = await prisma.operatorChat.create({
            data: {
                sessionId,
                operatorId: selectedOperator.id
            }
        });
        
        // Aggiorna stato sessione
        await prisma.chatSession.update({
            where: { sessionId },
            data: { status: 'WITH_OPERATOR' }
        });
        
        // Notifica operatore
        await notifyOperators({
            type: 'new_chat_assigned',
            sessionId,
            priority,
            operatorId: selectedOperator.id,
            title: 'Nuova chat assegnata',
            message: `Chat ${sessionId} assegnata a te con priorità ${priority}`
        }, selectedOperator.id);
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.LIVE_CHAT,
            assignedOperator: selectedOperator.id
        });
        
        await this.recordAnalytics(sessionId, 'operator_assigned', {
            operatorId: selectedOperator.id,
            priority,
            queueTime: 0
        });
        
        return {
            assigned: true,
            operator: {
                id: selectedOperator.id,
                name: selectedOperator.name
            },
            message: `🎉 Ottima notizia! Ti ho assegnato ${selectedOperator.name}, uno dei nostri migliori esperti. Ti risponderà tra pochissimo!`,
            nextStep: this.flowSteps.LIVE_CHAT
        };
    }

    /**
     * STEP 7: 📊 Gestione Coda
     * Gestisce la coda di attesa intelligente
     */
    async manageQueue(sessionId, context) {
        console.log(`📊 STEP 7: Managing queue for session ${sessionId}`);
        
        // Aggiungi alla coda
        const queuePosition = await this.addToQueue(sessionId, context.priority);
        
        // Stima tempo di attesa
        const estimatedWait = await this.estimateWaitTime(queuePosition);
        
        // Messaggio di attesa personalizzato
        let queueMessage;
        if (queuePosition === 1) {
            queueMessage = "Sei il prossimo! Un operatore ti assisterà a brevissimo 🎯";
        } else if (queuePosition <= 3) {
            queueMessage = `Sei ${queuePosition}° in coda. Attesa stimata: ${estimatedWait} minuti ⏱️`;
        } else {
            queueMessage = `Posizione in coda: ${queuePosition}. Attesa stimata: ${estimatedWait} minuti ⏳

Nel frattempo, posso continuare ad aiutarti con informazioni automatiche!`;
        }
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.QUEUE_MANAGEMENT,
            queuePosition,
            estimatedWait
        });
        
        // Monitora la coda e notifica quando è il turno
        this.monitorQueuePosition(sessionId);
        
        await this.recordAnalytics(sessionId, 'added_to_queue', {
            position: queuePosition,
            estimatedWait
        });
        
        return {
            queuePosition,
            estimatedWait,
            message: queueMessage,
            offerAlternatives: queuePosition > 5,
            nextStep: this.flowSteps.QUEUE_MANAGEMENT
        };
    }

    /**
     * STEP 8: 💬 Chat Live
     * Gestisce la conversazione con operatore
     */
    async manageLiveChat(sessionId, operatorId) {
        console.log(`💬 STEP 8: Managing live chat for session ${sessionId}`);
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        
        // Prepara contesto per operatore
        const context = {
            sessionId,
            customerInfo: flowState.collectedInfo || {},
            intent: flowState.intentAnalysis?.intent,
            previousMessages: await this.getSessionMessages(sessionId),
            escalationReasons: flowState.escalationReasons
        };
        
        // Invia contesto all'operatore
        await this.sendContextToOperator(operatorId, context);
        
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.LIVE_CHAT,
            liveChatActive: true,
            operatorId
        });
        
        await this.recordAnalytics(sessionId, 'live_chat_started', {
            operatorId,
            contextProvided: true
        });
        
        return {
            status: 'LIVE_CHAT_ACTIVE',
            operator: operatorId,
            message: "Connesso con l'operatore. Ora puoi chattare direttamente! 💬"
        };
    }

    /**
     * STEP 9: 📮 Follow-up
     * Gestisce il follow-up post conversazione
     */
    async scheduleFollowUp(sessionId, resolution) {
        console.log(`📮 STEP 9: Scheduling follow-up for session ${sessionId}`);
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        const followUpData = {
            sessionId,
            scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
            type: resolution.resolved ? 'SATISFACTION_CHECK' : 'RESOLUTION_CHECK',
            message: resolution.resolved 
                ? "Ciao! Volevo assicurarmi che tutto sia andato bene con il tuo problema di ieri. È tutto risolto?"
                : "Ciao! Ieri avevi un problema che non siamo riusciti a risolvere completamente. Posso aiutarti ulteriormente?"
        };
        
        // Schedula follow-up
        await this.scheduleFollowUpTask(followUpData);
        
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.FEEDBACK,
            followUpScheduled: true
        });
        
        await this.recordAnalytics(sessionId, 'follow_up_scheduled', followUpData);
        
        return {
            scheduled: true,
            when: '24 ore',
            nextStep: this.flowSteps.FEEDBACK
        };
    }

    /**
     * STEP 10: ⭐ Feedback
     * Raccoglie feedback sulla conversazione
     */
    async collectFeedback(sessionId) {
        console.log(`⭐ STEP 10: Collecting feedback for session ${sessionId}`);
        
        const feedbackMessage = `Grazie per aver utilizzato il nostro servizio! 🙏

Come valuteresti la tua esperienza?
⭐⭐⭐⭐⭐ Eccellente
⭐⭐⭐⭐ Buona
⭐⭐⭐ Sufficiente
⭐⭐ Scarsa
⭐ Pessima

Il tuo feedback è importante per migliorare il nostro servizio!`;
        
        const flowState = this.sessionFlowState.get(sessionId) || {};
        this.sessionFlowState.set(sessionId, {
            ...flowState,
            currentStep: this.flowSteps.FEEDBACK,
            awaitingFeedback: true
        });
        
        return {
            message: feedbackMessage,
            quickReplies: ['⭐⭐⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐', '⭐⭐', '⭐'],
            optional: true,
            nextStep: this.flowSteps.ANALYTICS
        };
    }

    /**
     * STEP 11: 📈 Analytics
     * Registra metriche per analisi
     */
    async recordAnalytics(sessionId, eventType, eventData) {
        console.log(`📈 STEP 11: Recording analytics for session ${sessionId}`);
        
        try {
            await prisma.analytics.create({
                data: {
                    sessionId,
                    eventType,
                    eventData: eventData || {},
                    timestamp: new Date(),
                    successful: eventData.resolved || false
                }
            });
            
            // Real-time analytics processing
            if (eventType === 'session_completed') {
                await this.processSessionMetrics(sessionId);
            }
        } catch (error) {
            console.error('Analytics recording error:', error);
        }
    }

    /**
     * STEP 12: 🔄 Miglioramento Continuo
     * Analizza pattern per migliorare il sistema
     */
    async continuousImprovement() {
        console.log(`🔄 STEP 12: Running continuous improvement analysis`);
        
        // Analizza ultimi 7 giorni
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const analytics = await prisma.analytics.findMany({
            where: {
                timestamp: { gte: sevenDaysAgo }
            }
        });
        
        // Analizza pattern
        const patterns = {
            commonIntents: {},
            resolutionRates: {},
            averageResponseTimes: {},
            customerSatisfaction: [],
            escalationReasons: {}
        };
        
        for (const event of analytics) {
            if (event.eventType === 'intent_detected') {
                patterns.commonIntents[event.eventData.intent] = 
                    (patterns.commonIntents[event.eventData.intent] || 0) + 1;
            }
            
            if (event.eventType === 'feedback_received') {
                patterns.customerSatisfaction.push(event.eventData.rating);
            }
            
            if (event.eventType === 'escalation_triggered') {
                for (const reason of event.eventData.reasons || []) {
                    patterns.escalationReasons[reason] = 
                        (patterns.escalationReasons[reason] || 0) + 1;
                }
            }
        }
        
        // Genera insights
        const insights = {
            topIntent: Object.entries(patterns.commonIntents)
                .sort(([,a], [,b]) => b - a)[0],
            avgSatisfaction: patterns.customerSatisfaction.length > 0 
                ? patterns.customerSatisfaction.reduce((a,b) => a+b, 0) / patterns.customerSatisfaction.length 
                : 0,
            topEscalationReason: Object.entries(patterns.escalationReasons)
                .sort(([,a], [,b]) => b - a)[0],
            improvements: []
        };
        
        // Suggerimenti di miglioramento
        if (insights.avgSatisfaction < 3.5) {
            insights.improvements.push('Migliorare training risposte automatiche');
        }
        
        if (insights.topEscalationReason?.[0] === 'lowConfidence') {
            insights.improvements.push('Aggiungere più pattern di intent recognition');
        }
        
        console.log('📊 Continuous Improvement Insights:', insights);
        
        return insights;
    }

    // === HELPER METHODS ===

    determineRequiredInfo(userInput, collectedInfo) {
        const required = [];
        
        if (userInput.includes('ordine') && !collectedInfo.orderNumber) {
            required.push('orderNumber');
        }
        
        if (userInput.includes('contatt') && !collectedInfo.email && !collectedInfo.phone) {
            required.push('contact');
        }
        
        if (userInput.includes('prodotto') && !collectedInfo.productModel) {
            required.push('productModel');
        }
        
        return required;
    }

    generateInfoQuestion(infoType) {
        const questions = {
            orderNumber: "Per poterti aiutare meglio, mi servirebbe il numero del tuo ordine. Lo trovi nell'email di conferma 📧",
            contact: "Per procedere, ho bisogno di un tuo contatto. Puoi darmi email o numero di telefono? 📞",
            productModel: "Di quale modello di lucine si tratta? (es: Serie Classic 500 LED) 💡"
        };
        
        return questions[infoType] || "Potresti fornirmi qualche dettaglio in più?";
    }

    calculateUrgency(userInput, intent) {
        const urgentKeywords = ['urgente', 'subito', 'emergenza', 'oggi', 'adesso'];
        const hasUrgentKeyword = urgentKeywords.some(keyword => 
            userInput.toLowerCase().includes(keyword)
        );
        
        if (hasUrgentKeyword || intent === 'TECHNICAL_SUPPORT') {
            return 'HIGH';
        }
        
        if (intent === 'ORDER_STATUS' || intent === 'RETURN_REFUND') {
            return 'MEDIUM';
        }
        
        return 'LOW';
    }

    extractKeywords(text) {
        // Estrai parole chiave rilevanti
        const stopWords = ['il', 'la', 'di', 'da', 'un', 'una', 'e', 'o', 'ma', 'per'];
        const words = text.toLowerCase().split(/\s+/);
        return words.filter(word => 
            word.length > 3 && !stopWords.includes(word)
        );
    }

    analyzeSentiment(text) {
        const negative = ['problema', 'rotto', 'male', 'pessimo', 'terribile', 'arrabbiato'];
        const positive = ['grazie', 'ottimo', 'perfetto', 'bene', 'felice', 'fantastico'];
        
        const textLower = text.toLowerCase();
        const negCount = negative.filter(word => textLower.includes(word)).length;
        const posCount = positive.filter(word => textLower.includes(word)).length;
        
        if (negCount > posCount) return 'NEGATIVE';
        if (posCount > negCount) return 'POSITIVE';
        return 'NEUTRAL';
    }

    async addToQueue(sessionId, priority) {
        // Implementazione semplificata della coda
        const queuedSessions = await prisma.chatSession.count({
            where: {
                status: 'WITH_OPERATOR',
                operatorChats: {
                    none: {}
                }
            }
        });
        
        return queuedSessions + 1;
    }

    async estimateWaitTime(queuePosition) {
        // Stima 3 minuti per posizione in coda
        return queuePosition * 3;
    }

    monitorQueuePosition(sessionId) {
        // Monitora posizione in coda e notifica quando è il turno
        setInterval(async () => {
            const position = await this.addToQueue(sessionId);
            if (position === 1) {
                // È il turno!
                await this.assignOperator(sessionId);
            }
        }, 30000); // Check ogni 30 secondi
    }

    async getSessionMessages(sessionId) {
        return await prisma.message.findMany({
            where: { sessionId },
            orderBy: { timestamp: 'asc' },
            take: 20
        });
    }

    async sendContextToOperator(operatorId, context) {
        // Invia contesto all'operatore via WebSocket
        await notifyOperators({
            type: 'chat_context',
            ...context
        }, operatorId);
    }

    async scheduleFollowUpTask(followUpData) {
        // Implementazione follow-up (potrebbe usare un job queue come Bull)
        setTimeout(async () => {
            await this.sendFollowUpMessage(followUpData);
        }, followUpData.scheduledFor - Date.now());
    }

    async sendFollowUpMessage(followUpData) {
        // Invia messaggio di follow-up
        await prisma.message.create({
            data: {
                sessionId: followUpData.sessionId,
                sender: 'SYSTEM',
                message: followUpData.message
            }
        });
    }

    async processSessionMetrics(sessionId) {
        const session = await prisma.chatSession.findUnique({
            where: { sessionId },
            include: {
                messages: true,
                operatorChats: true
            }
        });
        
        if (!session) return;
        
        const metrics = {
            duration: new Date() - session.startedAt,
            messageCount: session.messages.length,
            hadOperator: session.operatorChats.length > 0,
            resolved: session.status === 'ENDED'
        };
        
        await this.recordAnalytics(sessionId, 'session_metrics', metrics);
    }
}

// Export singleton instance
export const businessLogic = new BusinessLogicEngine();