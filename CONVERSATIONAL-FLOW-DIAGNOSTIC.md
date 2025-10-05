# 🔍 CONVERSATIONAL FLOW DIAGNOSTIC

**Data Analisi**: 2025-10-05
**Branch**: main
**Commit**: a63b772

---

## 📋 INDICE

1. [Panoramica Architettura](#panoramica-architettura)
2. [Tutti i Flussi Conversazionali](#tutti-i-flussi-conversazionali)
3. [SmartActions Disponibili](#smartactions-disponibili)
4. [Problemi Critici Identificati](#problemi-critici-identificati)
5. [Fix Proposti](#fix-proposti)

---

## 🏗 PANORAMICA ARCHITETTURA

### Entry Points

**Main Chat Endpoint**: `POST /api/chat`
- File: `routes/chat/index.js`
- Handler: Main router con orchestrazione modulare
- Validation: `validateChatMessage()`, `isValidSessionId()`
- Rate Limiting: `chatRateLimiter` (clientId based)

**Polling Endpoint**: `GET /api/chat/poll/:sessionId`
- File: `routes/chat/polling-handler.js`
- Scopo: Long-polling per messaggi operatore
- Frequenza: Ogni 3 secondi dal widget

**Resume Endpoint**: `GET /api/chat/resume/:token`
- File: `routes/chat/resume-handler.js`
- Scopo: Riprendi chat da link ticket

### Handler Modules

| Module | File | Responsabilità |
|--------|------|----------------|
| **AI Handler** | `ai-handler.js` | OpenAI integration, knowledge base |
| **Escalation Handler** | `escalation-handler.js` | Richiesta operatore, queue management |
| **Ticket Handler** | `ticket-handler.js` | Workflow creazione ticket |
| **Session Handler** | `session-handler.js` | Session CRUD, message persistence |
| **Polling Handler** | `polling-handler.js` | Long-polling operator messages |
| **Resume Handler** | `resume-handler.js` | Riapertura chat da token |

### Session Stati (Prisma Schema)

```prisma
enum SessionStatus {
  ACTIVE              // Chat attiva con AI
  WITH_OPERATOR       // Operatore connesso
  WAITING_OPERATOR    // In coda per operatore
  WAITING_CLIENT      // Timeout, attende risposta utente
  REQUESTING_TICKET   // Workflow ticket in corso
  ENDED               // Chat terminata
  CLOSED              // Chat chiusa definitivamente
  RESUMED             // Chat ripresa da token
}
```

---

## 🗺 TUTTI I FLUSSI CONVERSAZIONALI

### FLUSSO 1: Avvio Chat Standard

**Trigger**: Utente apre widget, invia primo messaggio

**Sequenza**:
```
1. POST /api/chat { message: "Ciao", sessionId: null }
   ├─ Genera sessionId server-side (generateSecureSessionId)
   ├─ Crea ChatSession (status: ACTIVE)
   └─ Salva UserMessage nel DB

2. handleAIResponse()
   ├─ Carica knowledgeBase.json
   ├─ Build system prompt con regole
   ├─ Chiamata OpenAI API
   ├─ Parse JSON response
   └─ Return { reply, actions, smartActions, escalation }

3. Response al widget
   └─ { reply, sessionId, status: 'active', smartActions }
```

**Codice**:
- `routes/chat/index.js:42-106` - Validation e session creation
- `routes/chat/session-handler.js:15-45` - getOrCreateSession()
- `routes/chat/ai-handler.js:78-193` - handleAIResponse()

**Stati Possibili**:
- ✅ **ACTIVE** → Chat con AI funzionante

**Problemi Noti**: ✅ Nessuno

---

### FLUSSO 2: Richiesta Operatore (Diretta)

**Trigger**: Utente chiede operatore esplicitamente

**Sequenza Corretta**:
```
1. POST /api/chat { message: "voglio un operatore", sessionId: "..." }
   ├─ Salva UserMessage
   └─ handleAIResponse() detects trigger

2. AI returns { escalation: "operator" }
   └─ routes/chat/index.js:394-396 triggers escalation

3. handleEscalation()
   ├─ Check operatori online (isOnline + isActive + availabilityStatus: AVAILABLE)
   ├─ SCENARIO A: Operatore disponibile
   │  ├─ Update session → WITH_OPERATOR
   │  ├─ Create OperatorChat
   │  ├─ Create SLA record
   │  ├─ Notify all operators (new_operator_request)
   │  ├─ Notify assigned operator (new_chat_assigned)
   │  └─ Return { reply: "Connesso con [Nome]", operator: {...} }
   │
   └─ SCENARIO B: Nessun operatore disponibile
      ├─ Calculate priority (LOW/MEDIUM/HIGH based on wait time)
      ├─ Add to queue (queueService.addToQueue)
      ├─ Update session → WAITING_OPERATOR
      ├─ Create SLA record for queue
      ├─ Notify all operators (new_operator_request)
      └─ Return smartActions: [wait_in_queue, request_ticket, continue_ai]
```

**Codice**:
- `routes/chat/index.js:394-396` - Escalation trigger
- `routes/chat/escalation-handler.js:20-299` - handleEscalation()
- `services/queue-service.js:53-63` - addToQueue()
- `utils/smart-actions.js:68-118` - createEscalationActions()

**Stati Possibili**:
- ✅ **ACTIVE** → **WITH_OPERATOR** (operatore disponibile)
- ✅ **ACTIVE** → **WAITING_OPERATOR** (nessun operatore)

**SmartActions Restituiti**:
```javascript
// SCENARIO A: Con operatori online ma occupati
[
  { action: 'wait_in_queue', disabled: true, text: 'Sei in coda (posizione N°)' },
  { action: 'request_ticket', text: 'Apri Ticket' },
  { action: 'continue_ai', text: 'Continua con AI' }
]

// SCENARIO B: Nessun operatore online
[
  { action: 'request_ticket', text: 'Apri Ticket' },
  { action: 'continue_ai', text: 'Continua con AI' }
]
```

**Problemi Noti**: ⚠️ Vedi [PROBLEMA CRITICO #1](#problema-1-continue_ai-non-gestito)

---

### FLUSSO 3: Utente Rifiuta Operatore (continue_ai)

**Trigger**: Utente clicca "Continua con AI" dopo escalation fallita

**Sequenza ATTESA**:
```
1. POST /api/chat { message: "continue_ai", sessionId: "..." }
   ├─ Riconosciuto come internal command (non salvato in DB)
   ├─ ❌ MANCA IL GESTORE SPECIFICO
   └─ Cade nel fallback AI handler
```

**Sequenza CORRETTA (Mancante)**:
```
1. POST /api/chat { message: "continue_ai", sessionId: "..." }
   ├─ if (sanitizedMessage === 'continue_ai') { ... }
   ├─ Update session.status → ACTIVE
   ├─ Remove from queue if present
   ├─ Cancel queue entry (status: CANCELLED, reason: 'user_refused')
   └─ Return { reply: "Ok, continua a scrivermi!", status: 'active' }
```

**Codice Attuale**:
- ❌ **MANCANTE** in `routes/chat/index.js`
- ✅ Riconosciuto come internal command: `routes/chat/index.js:99`
- ❌ Nessun handler dedicato

**Stati Possibili**:
- ❌ **WAITING_OPERATOR** → dovrebbe → **ACTIVE** (MA NON AVVIENE)

**Problema**: 🔴 **CRITICO** - Vedi [PROBLEMA #1](#problema-1-continue_ai-non-gestito)

---

### FLUSSO 4: Chat con Operatore Attiva

**Trigger**: Operatore connesso, utente invia messaggi

**Sequenza**:
```
1. POST /api/chat { message: "...", sessionId: "..." }
   ├─ Salva UserMessage
   ├─ Check isWithOperator(session) → TRUE
   ├─ Find active OperatorChat (endedAt: null)
   ├─ notifyOperators({ event: 'new_message', ... }, operatorId)
   └─ Return { reply: null, status: 'with_operator', operatorConnected: true }

2. Widget polling attivo (ogni 3s)
   ├─ GET /api/chat/poll/:sessionId
   ├─ Fetch messages WHERE sender = 'OPERATOR' AND timestamp > lastPollTime
   └─ Return { messages: [...], operatorConnected: true }
```

**Codice**:
- `routes/chat/index.js:123-148` - Operator message notification
- `routes/chat/polling-handler.js:9-104` - handlePolling()
- `routes/chat/session-handler.js:63-72` - isWithOperator()

**Stati Possibili**:
- ✅ **WITH_OPERATOR** → Rimane **WITH_OPERATOR**

**Problemi Noti**: ✅ Nessuno

---

### FLUSSO 5: Operatore Chiede Chiusura Chat

**Trigger**: Operatore invia messaggio di chiusura (es. "Posso chiudere?")

**Sequenza**:
```
1. Operatore invia messaggio via dashboard
   ├─ POST /api/operators/send-message
   ├─ Salva OperatorMessage
   └─ notifyWidget({ event: 'operator_message', ... })

2. Widget riceve messaggio di chiusura
   ├─ Rileva parole chiave ("posso chiudere", "hai bisogno")
   ├─ Mostra smartActions localmente (client-side)
   └─ Bottoni: [continue_chat, end_chat]

3. Utente risponde:

   A) Utente clicca "Continua chat"
      └─ POST /api/chat { message: "continue_chat" }
         ├─ Check if operator still online
         ├─ IF YES:
         │  └─ Return "La chat continua con [operatore]"
         └─ IF NO:
            ├─ Re-queue with HIGH priority
            ├─ Return smartActions: [wait_in_queue, request_ticket, continue_ai]

   B) Utente clicca "Chiudi chat"
      └─ POST /api/chat { message: "end_chat" }
         ├─ End OperatorChat (set endedAt)
         ├─ Log operator event (duration, rating)
         ├─ Update session → ACTIVE
         ├─ Cancel queue entries
         └─ Return "Grazie per aver chattato!"
```

**Codice**:
- `routes/operators.js:873-960` - Operator send message + closure smartActions
- `routes/chat/index.js:151-242` - continue_chat handler
- `routes/chat/index.js:244-309` - end_chat handler
- `utils/smart-actions.js:123-168` - createClosureActions()

**Stati Possibili**:
- ✅ **WITH_OPERATOR** → **ACTIVE** (end_chat)
- ✅ **WITH_OPERATOR** → **WAITING_OPERATOR** (continue_chat + operator offline)
- ✅ **WITH_OPERATOR** → **WITH_OPERATOR** (continue_chat + operator online)

**Problemi Noti**: ✅ Funziona correttamente

---

### FLUSSO 6: Creazione Ticket

**Trigger**: Utente chiede ticket o clicca smartAction `request_ticket`

**Sequenza**:
```
1. POST /api/chat { message: "apri ticket" }
   ├─ Regex match: /apri.*ticket|crea.*ticket|request_ticket/i
   ├─ Check if ticket already exists (status: OPEN/IN_PROGRESS/WAITING_USER)
   ├─ IF EXISTS:
   │  └─ Return "Hai già un ticket aperto: #XXXX"
   └─ IF NOT:
      ├─ Update session → REQUESTING_TICKET
      └─ Return "Come ti chiami?" (step 1)

2. Workflow di raccolta dati:
   STEP 1 (nome):
      ├─ POST /api/chat { message: "Mario Rossi" }
      ├─ Update session.metadata.ticketData.name
      └─ Return "Qual è il tuo contatto preferito?"

   STEP 2 (contact method):
      ├─ POST /api/chat { message: "email" | "whatsapp" }
      ├─ Update session.metadata.ticketData.contactMethod
      └─ Return "Inserisci [email|numero WhatsApp]"

   STEP 3 (contact value):
      ├─ POST /api/chat { message: "mario@example.com" }
      ├─ Validate format (email vs phone)
      ├─ Update session.metadata.ticketData.contactValue
      └─ Return "Descrivi il problema"

   STEP 4 (description):
      ├─ POST /api/chat { message: "Ho un problema con..." }
      ├─ Create Ticket in DB
      ├─ Generate resumeToken
      ├─ Update session → ACTIVE
      └─ Return "Ticket #XXXX creato!" + smartActions: [continue_ai]

3. Ticket creato:
   ├─ Email notification (se implementato)
   ├─ Dashboard notification per operatori
   └─ Resume link: /api/chat/resume/{token}
```

**Codice**:
- `routes/chat/index.js:337-385` - Ticket detection e start
- `routes/chat/ticket-handler.js:9-245` - handleTicketCollection()
- `routes/chat/session-handler.js:74-81` - isRequestingTicket()

**Stati Possibili**:
- ✅ **ACTIVE/WAITING_OPERATOR** → **REQUESTING_TICKET** → **ACTIVE**

**Problemi Noti**: ✅ Funziona correttamente

---

### FLUSSO 7: Resume Chat da Ticket

**Trigger**: Utente clicca link ticket ricevuto via email

**Sequenza**:
```
1. GET /api/chat/resume/{token}
   ├─ Validate token format
   ├─ Find ticket by resumeToken
   ├─ IF NOT FOUND:
   │  └─ Return { error: "Token non valido o scaduto" }
   └─ IF FOUND:
      ├─ Find existing session or create new
      ├─ Update session → RESUMED
      ├─ Load conversation history
      └─ Return {
           sessionId,
           ticket: { ticketNumber, status, ... },
           history: [...],
           smartActions: [resume_with_ai, resume_with_operator]
         }

2. Widget mostra cronologia + azioni:
   A) resume_with_ai:
      ├─ Update session → ACTIVE
      └─ Return "Continua con AI"

   B) resume_with_operator:
      ├─ handleEscalation()
      └─ Procede come FLUSSO 2
```

**Codice**:
- `routes/chat/resume-handler.js:9-123` - resumeChatFromToken()
- `routes/chat/index.js:312-334` - resume_with_ai / resume_with_operator handlers

**Stati Possibili**:
- ✅ **CLOSED** → **RESUMED** → **ACTIVE** (resume_with_ai)
- ✅ **CLOSED** → **RESUMED** → **WAITING_OPERATOR** (resume_with_operator)

**Problemi Noti**: ✅ Funziona correttamente

---

### FLUSSO 8: Timeout Inattività

**Trigger**: Utente inattivo per 10 minuti

**Sequenza**:
```
1. Timeout Service (background cron, ogni 60s)
   ├─ Check sessions WHERE status = ACTIVE|WITH_OPERATOR|WAITING_OPERATOR
   ├─ Find inattive > 10 min (lastActivity < now - 10min)
   └─ For each:
      ├─ Update session → WAITING_CLIENT
      ├─ Send command message "Sei ancora lì?"
      └─ Start 5min grace period

2. Se utente risponde entro 5 min:
   ├─ timeoutService.reactivateChat(sessionId)
   ├─ Update session → ACTIVE|WITH_OPERATOR (restore previous status)
   └─ Continue conversation

3. Se utente NON risponde (dopo 5 min):
   ├─ Update session → ENDED
   ├─ End OperatorChat (if any)
   ├─ Remove from queue
   └─ Log timeout event
```

**Codice**:
- `services/timeout-service.js:20-147` - checkInactiveSessions(), reactivateChat()
- `routes/chat/index.js:112-120` - Reactivation logic

**Stati Possibili**:
- ✅ **ACTIVE/WITH_OPERATOR** → **WAITING_CLIENT** → **ACTIVE/WITH_OPERATOR** (riattivato)
- ✅ **ACTIVE/WITH_OPERATOR** → **WAITING_CLIENT** → **ENDED** (timeout finale)

**Problemi Noti**: ✅ Funziona correttamente

---

## 🎯 SMARTACTIONS DISPONIBILI

### Tabella Completa SmartActions

| Action | Trigger Context | Destinazione Status | File Gestione |
|--------|----------------|---------------------|---------------|
| **request_operator** | User chiede operatore | WITH_OPERATOR / WAITING_OPERATOR | escalation-handler.js |
| **continue_ai** | User rifiuta operatore | ❌ **NON GESTITO** | ❌ MANCANTE |
| **wait_in_queue** | Informational only | WAITING_OPERATOR (no action) | - |
| **request_ticket** | User vuole ticket | REQUESTING_TICKET | ticket-handler.js |
| **open_ticket** | Alias di request_ticket | REQUESTING_TICKET | ticket-handler.js |
| **continue_chat** | Closure check - continue | WITH_OPERATOR | index.js:151-242 |
| **end_chat** | Closure check - end | ACTIVE | index.js:244-309 |
| **resume_with_ai** | Resume da ticket | ACTIVE | index.js:312-326 |
| **resume_with_operator** | Resume da ticket | WAITING_OPERATOR | index.js:328-334 |

### Validazione SmartActions

**File**: `utils/smart-actions.js`

```javascript
isActionValidForSessionState(action, sessionStatus, hasOperator)
```

Regole:
- `wait_in_queue`: Solo se `WAITING_OPERATOR` e NO operatore
- `request_operator`: Solo se `ACTIVE|RESUMED` e NO operatore
- `request_ticket`: Sempre tranne se `CLOSED` o con operatore
- `continue_ai`: Sempre se NON `CLOSED`
- `continue_chat`: Solo se `CLOSED|RESUMED`
- `end_chat`: Solo se `ACTIVE|WITH_OPERATOR|RESUMED`

---

## 🔴 PROBLEMI CRITICI IDENTIFICATI

### PROBLEMA #1: `continue_ai` NON GESTITO

**Severità**: 🔴 **CRITICA**
**Impatto Utente**: Errore generico quando rifiuta operatore
**Frequenza**: Ogni volta che user clicca "Continua con AI" dopo escalation fallita

#### Descrizione Tecnica

L'azione `continue_ai` è:
- ✅ Definita come internal command (`routes/chat/index.js:99`)
- ✅ Inclusa in smartActions (`utils/smart-actions.js:84, 113, 159, 177, 225, 231`)
- ❌ **MAI GESTITA** esplicitamente in `routes/chat/index.js`

**Flusso Attuale (ROTTO)**:
```
1. User clicca "Continua con AI"
   └─ POST /api/chat { message: "continue_ai" }

2. routes/chat/index.js
   ├─ Line 102: isInternalCommand = TRUE
   ├─ Line 105-109: NON salva in DB ✅
   ├─ Line 112-148: Skip (not with operator)
   ├─ Line 151-309: Skip (not continue_chat/end_chat/resume_*)
   ├─ Line 337-385: Skip (not requesting ticket)
   ├─ Line 342-385: Skip (not ticket trigger)
   └─ Line 388-406: 🔴 CADE QUI - handleAIResponse()

3. handleAIResponse() riceve "continue_ai"
   ├─ OpenAI non riconosce il comando
   ├─ Ritorna risposta confusa o errore
   └─ Return { reply: "Mi dispiace, c'è stato un problema..." }
```

#### Codice Problematico

**File**: `routes/chat/index.js`

```javascript
// Line 89-109: Correttamente riconosciuto
const internalCommands = [
  // ...
  'continue_ai',  // ✅ Presente
  // ...
];
const isInternalCommand = internalCommands.includes(sanitizedMessage);

// ❌ MANCA IL GESTORE DOPO Line 309:

// Line 310-385: Altri gestori (resume_*, ticket)
// Line 388: Fallback ad AI
const history = buildConversationHistory(session.messages);
const aiResponse = await handleAIResponse(sanitizedMessage, session, history);
// 🔴 "continue_ai" arriva qui e confonde l'AI
```

#### Comportamento Atteso vs Attuale

| Scenario | Atteso | Attuale | Fix Necessario |
|----------|--------|---------|----------------|
| User in WAITING_OPERATOR clicca "Continua con AI" | Session → ACTIVE, remove from queue, "Ok continua!" | ❌ Errore generico AI | ✅ Aggiungi handler |
| User in ACTIVE con smartAction continue_ai | Conferma "Continua a scrivermi!" | ❌ Passa ad AI che non capisce | ✅ Aggiungi handler |

#### Soluzione Proposta

**Posizione**: `routes/chat/index.js` dopo line 334 (dopo resume handlers)

```javascript
// ✅ FIX: Handle continue_ai action
if (sanitizedMessage === 'continue_ai') {
  console.log('🤖 User chose to continue with AI (refusing operator)');

  const prisma = container.get('prisma');

  // Cancel any pending queue entries
  await prisma.queueEntry.updateMany({
    where: {
      sessionId: session.sessionId,
      status: { in: ['WAITING', 'ASSIGNED'] }
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'user_refused_operator'
    }
  });

  // Set session to ACTIVE (AI mode)
  await prisma.chatSession.update({
    where: { id: session.id },
    data: { status: SESSION_STATUS.ACTIVE }
  });

  // Log analytics
  await prisma.analytics.create({
    data: {
      eventType: 'operator_refused',
      sessionId: session.sessionId,
      eventData: {
        previousStatus: session.status,
        reason: 'user_chose_ai'
      }
    }
  });

  const continueAIText = await getAutomatedText('continue_with_ai');

  return res.json({
    reply: continueAIText || "Perfetto! Continua pure a scrivermi, ti assisto io. 🤖",
    sessionId: session.sessionId,
    status: 'active',
    operatorConnected: false
  });
}
```

#### File da Aggiornare

1. **routes/chat/index.js** (PRIMARY)
   - Aggiungi handler `continue_ai` dopo line 334
   - Import `getAutomatedText` (già presente)

2. **data/automated-texts.json** (SECONDARY)
   - Aggiungi testo: `"continue_with_ai": "Perfetto! Continua pure..."`

3. **Test da Eseguire**
   - Scenario 1: User richiede operatore → nessuno disponibile → clicca "Continua con AI"
   - Scenario 2: User in coda → clicca "Continua con AI"
   - Verificare: session.status = ACTIVE, queueEntry.status = CANCELLED

---

### PROBLEMA #2: `wait_in_queue` Confuso

**Severità**: 🟡 **MEDIA**
**Impatto Utente**: Utente clicca bottone disabilitato, nulla succede
**Frequenza**: Quando in coda

#### Descrizione

L'azione `wait_in_queue` è definita come `disabled: true` (informational only) ma:
- ✅ Correttamente non cliccabile nel widget
- ❌ Riconosciuta come internal command (line 100) ma mai gestita
- ⚠️ Potrebbe causare confusione se widget non rispetta `disabled`

#### Soluzione

**Opzione A**: Rimuovi da internal commands (è solo informativa)
**Opzione B**: Aggiungi handler no-op che ritorna messaggio informativo

**Scelta Consigliata**: Opzione A

```javascript
// routes/chat/index.js:89-101
const internalCommands = [
  'request_operator',
  'continue_chat',
  'end_chat',
  'apri ticket',
  'continua con assistente AI',
  'resume_with_ai',
  'resume_with_operator',
  'request_ticket',
  'open_ticket',
  'continue_ai',
  // ❌ REMOVE: 'wait_in_queue' (è disabled, non serve handler)
];
```

---

### PROBLEMA #3: Race Condition in Polling

**Severità**: 🟡 **MEDIA**
**Impatto Utente**: Messaggi duplicati o persi in edge cases
**Frequenza**: Rara (solo con latenza alta)

#### Descrizione

**File**: `routes/chat/polling-handler.js:27-42`

```javascript
const lastPollTime = session.lastPollTime || session.lastActivity;

// Fetch new messages since last poll
const newMessages = await prisma.message.findMany({
  where: {
    sessionId,
    sender: 'OPERATOR',
    timestamp: { gt: lastPollTime } // 🔴 RACE: lastPollTime potrebbe essere stale
  },
  orderBy: { timestamp: 'asc' }
});
```

**Problema**: Se due richieste di polling arrivano contemporaneamente:
1. Request A legge `lastPollTime = T1`
2. Request B legge `lastPollTime = T1` (stesso valore)
3. Entrambe fetchano messaggi > T1
4. Entrambe ritornano gli stessi messaggi duplicati

#### Soluzione

Usa transaction + atomic update:

```javascript
const result = await prisma.$transaction(async (tx) => {
  const session = await tx.chatSession.findUnique({
    where: { sessionId },
    select: { lastPollTime: true, lastActivity: true }
  });

  const lastPollTime = session.lastPollTime || session.lastActivity;
  const now = new Date();

  const newMessages = await tx.message.findMany({
    where: {
      sessionId,
      sender: 'OPERATOR',
      timestamp: { gt: lastPollTime }
    },
    orderBy: { timestamp: 'asc' }
  });

  // Atomic update to prevent race
  if (newMessages.length > 0) {
    await tx.chatSession.update({
      where: { sessionId },
      data: { lastPollTime: now }
    });
  }

  return { newMessages, lastPollTime: now };
});
```

---

### PROBLEMA #4: Nessuna Validazione `fiveMinutesAgo`

**Severità**: 🔴 **CRITICA (Bug)**
**Impatto**: Server crash
**Frequenza**: Ogni richiesta escalation

#### Descrizione

**File**: `routes/chat/escalation-handler.js:47`

```javascript
const onlineOperators = await prisma.operator.findMany({
  where: {
    isOnline: true,
    isActive: true,
    availabilityStatus: 'AVAILABLE',
    lastSeen: { gte: fiveMinutesAgo } // 🔴 ERROR: fiveMinutesAgo is not defined
  },
  // ...
});
```

**Errore**: Variabile `fiveMinutesAgo` usata ma mai definita

#### Soluzione

Aggiungi definizione all'inizio della funzione:

```javascript
export async function handleEscalation(message, session) {
  const prisma = container.get('prisma');
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // ✅ ADD THIS

  try {
    logger.debug('ESCALATION', 'Checking for operators');
    // ...
```

---

## ✅ FIX PROPOSTI - RIEPILOGO

### Priority 1: CRITICAL (Deploy Blocker)

1. **`continue_ai` handler** → `routes/chat/index.js`
   - Aggiungi handler completo dopo line 334
   - Gestisci queue cancellation
   - Return confirmatory message

2. **`fiveMinutesAgo` undefined** → `escalation-handler.js:20`
   - Aggiungi `const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);`

### Priority 2: HIGH (UX Improvement)

3. **`wait_in_queue` cleanup** → `routes/chat/index.js:100`
   - Rimuovi da internal commands (è disabled)

4. **Polling race condition** → `polling-handler.js:27-55`
   - Usa transaction per atomic update

### Priority 3: MEDIUM (Enhancement)

5. **Error messages improvement**
   - Aggiungi automated text per `continue_with_ai`
   - Migliora fallback error message

---

## 📊 STATO FLUSSI

| Flusso | Stato | Priorità Fix |
|--------|-------|--------------|
| ✅ Avvio Chat Standard | Funzionante | - |
| ✅ Richiesta Operatore (Diretta) | Funzionante | - |
| 🔴 Utente Rifiuta Operatore | **ROTTO** | 🔴 CRITICAL |
| ✅ Chat con Operatore Attiva | Funzionante | - |
| ✅ Operatore Chiede Chiusura | Funzionante | - |
| ✅ Creazione Ticket | Funzionante | - |
| ✅ Resume Chat da Ticket | Funzionante | - |
| ✅ Timeout Inattività | Funzionante | - |

---

## 🎯 PROSSIMI PASSI

1. ✅ Review questo documento con il team
2. 🔧 Implementare FIX Priority 1 (CRITICAL)
3. ✅ Testing manuale di tutti i flussi
4. 🔧 Implementare FIX Priority 2-3
5. 📝 Aggiornare documentazione tecnica

---

**Fine Documento** | Generato: 2025-10-05 | Analista: Claude Code
