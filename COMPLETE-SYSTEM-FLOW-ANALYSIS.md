# 🔍 ANALISI COMPLETA SISTEMA - Tutti i Flussi

## 📋 STATO REALE DEL SISTEMA (da logs utente)

### **Sequenza Reale Osservata**
```
1. Lucy AI: "Ciao! Sono Lucy..." (BOT - greeting iniziale)
2. User: "test"
3. AI: "Non ho informazioni. Vuoi operatore?" (BOT)
4. AI: "Operatori occupati, attendi ~30min" (BOT) + pulsanti [Attendi|Ticket|AI]
5. "🎉 Sei salito in coda! 9° posto" (SYSTEM - bug: dovrebbe essere 1°)
6. **[OPERATOR TAKES CHAT]**
7. "Ciao! Un attimo che controllo..." (OPERATOR - greeting automatico #1) ✅
8. User: "test"
9. Operator: "test" (risposta manuale)
10. User: "test"
11. "👤 Amministratore si è unito" (SYSTEM - arriva TARDI) ❌
12. "Ciao! Un attimo che controllo..." (OPERATOR - greeting DUPLICATO #2) ❌
13. "Posso aiutarti con qualcos'altro?" (OPERATOR - closure request #1)
14. "Posso aiutarti con qualcos'altro?" (OPERATOR - closure DUPLICATO #2) ❌
15. "continue_chat" (visibile all'user - BUG) ❌
```

### **Problemi Identificati**
1. **Greeting duplicato** (#7 e #12)
2. **System message tardivo** (#11 dopo #7-10)
3. **Closure request duplicato** (#13 e #14)
4. **"continue_chat" visibile** (#15)
5. **Posizione coda #9 con 0 chat attive**

---

## 🎯 FLUSSO COMPLETO: User → AI → Queue → Operator

### **FASE 1: User Chiede Operatore**

#### Frontend (chatbot-popup.liquid)
```javascript
// User clicca "Voglio operatore" o AI rileva escalation
sendMessage('request_operator')  // Comando interno (nascosto)
  ↓
POST /api/chat
Body: { message: 'request_operator', sessionId }
```

#### Backend (routes/chat/index.js)
```javascript
// Linea 86: SALVA MESSAGGIO (BUG: salva anche comandi interni!)
await saveUserMessage(session.sessionId, sanitizedMessage);
  ↓
// Linea 100-125: Check se con operatore
if (isWithOperator(session)) {
  // Già con operatore, notifica e basta
  notifyOperators(...)
  return { reply: null, status: 'with_operator' }
}
  ↓
// NON è con operatore, continua al flow escalation
```

#### Escalation Handler (routes/chat/escalation-handler.js)
```javascript
// Linea 50+: handleEscalation()
const availableOperators = await prisma.operator.count({
  where: { isOnline: true, isActive: true }
});

if (availableOperators === 0) {
  // NO OPERATORI DISPONIBILI
  // Linea 182: Aggiungi a coda
  queueInfo = await queueService.addToQueue(
    session.sessionId,
    priority,  // Calcolato dinamicamente
    []
  );

  // Linea 263: Invia messaggio "Operatori occupati"
  reply = "⏰ Operatori occupati. Attesa ~X min"
  smartActions = [
    {action: 'wait_in_queue'},
    {action: 'request_ticket'},
    {action: 'continue_ai'}
  ]

  return { reply, smartActions, queuePosition }
}

// SE OPERATORI DISPONIBILI
// Assegna automaticamente
```

#### Queue Service (services/queue-service.js)
```javascript
// Linea 34: addToQueue()
async addToQueue(sessionId, priority) {
  // ❌ BUG: NON controlla se esiste già entry!
  const queueEntry = await prisma.queueEntry.create({
    data: {
      sessionId,
      priority,
      status: 'WAITING',  // ← Entry creata
      enteredAt: new Date(),
      estimatedWaitTime: await calculateEstimatedWait(priority)
    }
  });

  // Linea 159: getQueuePosition()
  const allWaiting = await prisma.queueEntry.findMany({
    where: { status: 'WAITING' }  // ← CONTA TUTTE LE WAITING
  });

  // ❌ BUG: Se ci sono 9 vecchie entry WAITING non pulite → position = 10!
  return position + 1;
}
```

---

### **FASE 2: Operator Prende Chat**

#### Dashboard (public/dashboard/js/dashboard.js)
```javascript
// Linea 1675: Operator clicca "Prendi chat"
async takeChat(sessionId) {
  // POST /operators/take-chat
  const response = await fetch(`${apiBase}/operators/take-chat`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, operatorId })
  });

  if (response.ok) {
    // Linea 1702: Apri chat window
    this.openChatWindow(sessionId);
  }
}

// Linea 1717: openChatWindow (DOPO take-chat)
async openChatWindow(sessionId) {
  // ✅ CORRETTO: NON chiama take-chat di nuovo (fix commit 595b437)
  // GET /operators/chat/:sessionId (solo legge dati)
  const response = await fetch(`${apiBase}/operators/chat/${sessionId}`);
  // Mostra finestra chat
}
```

#### Backend (routes/operators.js - take-chat)
```javascript
// Linea 422: POST /operators/take-chat
router.post('/take-chat', authenticateToken, validateSession, async (req, res) => {

  // Linea 437-448: Check se già presa
  const existing = await prisma.operatorChat.findFirst({
    where: { sessionId, endedAt: null }
  });

  // Linea 451-461: IDEMPOTENZA
  if (existing && existing.operatorId === operatorId) {
    // ✅ Stesso operatore, ritorna subito (NO greeting duplicato)
    return res.json({ success: true, alreadyTaken: true });
  }

  // Linea 470-476: Crea OperatorChat
  operatorChat = await prisma.operatorChat.create({
    data: { sessionId, operatorId }
  });

  // Linea 478-482: Aggiorna sessione
  await prisma.chatSession.update({
    where: { sessionId },
    data: { status: 'WITH_OPERATOR' }
  });

  // Linea 484-511: ✅ Rimuove da coda (marca ASSIGNED)
  const queueEntry = await prisma.queueEntry.findFirst({
    where: { sessionId, status: 'WAITING' }
  });

  if (queueEntry) {
    await prisma.queueEntry.update({
      where: { id: queueEntry.id },
      data: {
        status: 'ASSIGNED',  // ← Cambia da WAITING a ASSIGNED
        assignedTo: operatorId,
        assignedAt: new Date()
      }
    });

    await queueService.updateQueuePositions();
  }

  // Linea 552-563: Check se greeting già inviato
  const existingOperatorMessages = await prisma.message.findFirst({
    where: { sessionId, sender: 'OPERATOR' },
    orderBy: { timestamp: 'asc' }
  });

  // Linea 564-601: Invia greeting SOLO se non esiste
  if (!existingOperatorMessages) {
    const greetingText = await getAutomatedText('operator_greeting');

    const greetingMessage = await prisma.message.create({
      data: {
        sessionId,
        sender: 'OPERATOR',
        message: greetingText,
        metadata: { operatorId, isAutomatic: true }
      }
    });

    // Linea 582-598: Invia via WebSocket
    notifyWidget(sessionId, {
      event: 'new_operator_message',
      message: {
        id: greetingMessage.id,
        sender: 'OPERATOR',
        message: greetingMessage.message,
        timestamp: greetingMessage.timestamp,
        operatorId,
        isAutomatic: true
      }
    });
  }

  // Linea 603-629: Invia system message DOPO greeting
  if (!existing) {
    const systemMessage = await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: `👤 ${operator.name} si è unito alla chat`
      }
    });

    // Invia via WebSocket
    notifyWidget(sessionId, {
      event: 'system_message',
      message: {
        id: systemMessage.id,
        sender: 'SYSTEM',
        message: systemMessage.message,
        timestamp: systemMessage.timestamp
      }
    });
  }
});
```

---

### **FASE 3: Widget Riceve Messaggi**

#### WebSocket Handler (chatbot-popup.liquid)
```javascript
// Linea 1405-1470: handleNotification()
function handleNotification(notification) {
  switch (notification.event) {

    case 'new_operator_message':
      const msg = notification.message;
      // ❌ BUG: NON controlla displayedMessageIds!
      addMessage(msg.message, 'operator');  // Mostra subito
      lastMessageTime = msg.timestamp;
      break;

    case 'system_message':
      const msg = notification.message;
      // ❌ BUG: NON controlla displayedMessageIds!
      addMessage(msg.message, 'system');  // Mostra subito
      break;

    case 'closure_request':
      const msg = notification.message;
      // ❌ BUG: NON controlla displayedMessageIds!
      addMessage(msg.message, 'bot');  // Mostra subito
      if (msg.smartActions) {
        showSmartActions(msg.smartActions);
      }
      break;
  }
}
```

#### Polling Handler (chatbot-popup.liquid)
```javascript
// Linea 1094-1136: startOperatorPolling()
pollInterval = setInterval(async () => {
  const pollUrl = `/api/chat/poll/${sessionId}`;
  const response = await fetch(pollUrl);
  const data = await response.json();

  if (data.messages && data.messages.length > 0) {
    data.messages.forEach(msg => {
      // ✅ CORRETTO: Controlla displayedMessageIds
      if ((msg.sender === 'OPERATOR' || msg.sender === 'SYSTEM')
          && !displayedMessageIds.has(msg.id)) {

        displayedMessageIds.add(msg.id);  // Registra ID

        const senderType = msg.sender === 'OPERATOR' ? 'operator' :
                          msg.sender === 'SYSTEM' ? 'system' : 'bot';
        addMessage(msg.message, senderType);

        if (msg.smartActions) {
          showSmartActions(msg.smartActions);
        }
      }
    });
  }
}, 3000);
```

**PROBLEMA**:
- WebSocket invia messaggio → addMessage() diretto (NO check ID)
- Polling invia stesso messaggio → check ID, ma ID non è in displayedMessageIds perché WebSocket non l'ha registrato!
- **Risultato**: DUPLICATO

---

### **FASE 4: Operator Chiude Chat**

#### Dashboard
```javascript
// Operator clicca "Chiudi conversazione"
POST /operators/close-conversation
Body: { sessionId, operatorId }
```

#### Backend (routes/operators.js)
```javascript
// Linea 1018: POST /operators/close-conversation
router.post('/close-conversation', authenticateToken, async (req, res) => {

  // Linea 1060: Invia closure request
  const closureText = await getAutomatedText('closure_request');
  // "Posso aiutarti con qualcos'altro?"

  const smartActions = [
    {action: 'continue_chat', text: 'Sì, ho ancora bisogno'},
    {action: 'end_chat', text: 'No, grazie'}
  ];

  // Linea 1080-1090: Salva nel DB
  const closureMessage = await prisma.message.create({
    data: {
      sessionId,
      sender: 'SYSTEM',
      message: closureText,
      metadata: { smartActions, isClosureRequest: true }
    }
  });

  // Linea 1092-1109: Invia via WebSocket
  notifyWidget(sessionId, {
    event: 'closure_request',
    message: {
      id: closureMessage.id,
      sender: 'SYSTEM',
      message: closureText,
      timestamp: closureMessage.timestamp,
      smartActions
    }
  });
});
```

**PROBLEMA**: WebSocket invia → polling invia → DUPLICATO "Posso aiutarti?"

---

### **FASE 5: User Risponde a Closure**

#### Widget
```javascript
// User clicca "Sì, ho ancora bisogno"
// Linea 1042-1044: Button handler
if (action.action === 'continue_chat') {
  sendMessage('continue_chat');  // Invia comando
}
```

#### Backend (routes/chat/index.js)
```javascript
// Linea 86: ❌ SALVA "continue_chat" come messaggio user!
await saveUserMessage(session.sessionId, sanitizedMessage);
// → Polling lo recupera e mostra all'user

// Linea 128-138: Processamento
if (sanitizedMessage === 'continue_chat') {
  const continueText = await getAutomatedText('chat_continue');

  return res.json({
    reply: continueText,
    sessionId: session.sessionId,
    status: 'with_operator',
    operatorConnected: true
  });
}
```

**PROBLEMA**: "continue_chat" salvato nel DB → polling lo mostra

---

## 🐛 TUTTI I BUGS MAPPATI

### **BUG #1: Messaggi Duplicati (WebSocket + Polling)**
**File**: `chatbot-popup.liquid` linee 1410-1470
**Causa**: WebSocket handlers NON controllano `displayedMessageIds`
**Fix**: Aggiungere check ID prima di addMessage()

### **BUG #2: Comandi Interni Visibili**
**File**: `routes/chat/index.js` linea 86
**Causa**: `saveUserMessage()` salva TUTTO, anche "continue_chat" e "end_chat"
**Fix**: NON salvare comandi interni

### **BUG #3: Posizione Coda Errata**
**File**: `services/queue-service.js` linea 34 + cleanup mancante
**Causa**:
- Entry vecchie `WAITING` non pulite quando chat finisce
- `addToQueue` non controlla duplicati
**Fix**:
- Pulire entry quando chat termina (marcare CANCELLED)
- Check duplicati in addToQueue

### **BUG #4: System Message Tardivo**
**File**: `chatbot-popup.liquid` + `routes/operators.js`
**Causa**: WebSocket fallisce o ritarda, polling recupera in ordine DB
**Fix**: Garantire ordine corretto anche con polling fallback

---

## ✅ STRATEGIA DI FIX

### **Priorità 1: Messaggi Duplicati**
1. Widget: Aggiungere `displayedMessageIds.has()/add()` in TUTTI gli handlers WebSocket
2. Backend: Includere `id` in TUTTE le notifiche WebSocket

### **Priorità 2: Comandi Interni**
1. Backend: NON salvare "continue_chat", "end_chat" come messaggi user
2. Check PRIMA di saveUserMessage()

### **Priorità 3: Queue Cleanup**
1. Backend: Quando chat finisce (end_chat), marcare queueEntry come CANCELLED
2. Queue Service: Check duplicati in addToQueue()

### **Priorità 4: Ordine Messaggi**
1. Widget: Garantire ordine timestamp anche con WebSocket
2. Backend: Timestamp consistenti

