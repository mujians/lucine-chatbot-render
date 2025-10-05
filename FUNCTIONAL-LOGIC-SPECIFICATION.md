# 📋 Functional Logic Specification - Lucine Chatbot System

**Project**: Omnichannel Customer Support System for Christmas Lights E-commerce
**Purpose**: AI-first support (70% automation) with intelligent escalation to human operators
**Last Updated**: 2025-10-05

---

## 1. Flussi utente (User Flows)

### 1.1 Inizio chat e prima risposta AI

```
USER:
  └─> Visita sito Shopify con ?chatbot=test
      └─> Widget visibile (bolla in basso a destra)
          └─> Click su bolla
              └─> Widget si apre
                  └─> Sistema:
                      ├─> GET /api/chat (senza sessionId)
                      ├─> Backend genera sessionId sicuro server-side
                      ├─> Crea ChatSession (status: ACTIVE)
                      ├─> Salva Message (sender: BOT, automated_text: ai_greeting)
                      └─> Ritorna: { reply: "Ciao! Sono Lucy...", sessionId, status: 'active' }
                  └─> Widget mostra greeting AI
                  └─> User digita messaggio
                      └─> POST /api/chat { message, sessionId }
                          ├─> Salva Message (sender: USER)
                          ├─> Costruisce conversationHistory (ultimi N messaggi)
                          ├─> Chiama OpenAI GPT-3.5 con context + knowledge base
                          ├─> AI analizza risposta:
                          │   ├─> Se può rispondere → ritorna reply
                          │   └─> Se non sa → suggerisce escalation
                          └─> Ritorna: { reply, status: 'active', smartActions?: [...] }
```

**Variabili di stato**:
- `sessionId`: UUID generato server-side
- `ChatSession.status`: `ACTIVE`
- `Message.sender`: `USER` | `BOT`

---

### 1.2 Escalation proposta dall'AI → presa in carico da operatore

```
ESCALATION FLOW:

1. AI rileva necessità operatore:
   └─> Risposta include smartActions:
       [
         { action: 'request_operator', text: 'Sì, voglio parlare con un operatore' },
         { action: 'continue_ai', text: 'No, continua tu' }
       ]

2. User clicca "Sì, voglio parlare con un operatore":
   └─> Widget invia: POST /api/chat { message: 'request_operator', sessionId }
       └─> Backend (escalation-handler.js):
           ├─> NON salva 'request_operator' come Message (è comando interno)
           ├─> Conta operatori online disponibili:
           │   └─> SELECT COUNT(*) FROM Operator WHERE isOnline=true AND isActive=true
           ├─> Se operatori disponibili = 0:
           │   ├─> Aggiungi a QueueEntry (status: WAITING, priority calcolata)
           │   ├─> Calcola estimatedWaitTime basato su:
           │   │   ├─> Numero operatori online
           │   │   ├─> Chat attive per operatore
           │   │   └─> Posizione in coda
           │   └─> Ritorna: {
           │         reply: "⏰ Operatori occupati. Attesa ~X min",
           │         queuePosition: N,
           │         smartActions: [
           │           { action: 'wait_in_queue' },
           │           { action: 'request_ticket' },
           │           { action: 'continue_ai' }
           │         ]
           │       }
           └─> Se operatori disponibili > 0:
               └─> Assegna automaticamente (auto-assignment disabilitato - richiede azione manuale operatore)

3. Operatore vede chat in pending list (dashboard):
   └─> GET /api/operators/pending-chats
       └─> Ritorna: [{ sessionId, priority, waitTime, preview }]
   └─> Operatore clicca "Prendi chat":
       └─> POST /api/operators/take-chat { sessionId, operatorId }
           ├─> Verifica se già presa (idempotenza):
           │   └─> Se existing.operatorId === operatorId → return { alreadyTaken: true }
           ├─> Crea OperatorChat (sessionId, operatorId)
           ├─> Aggiorna ChatSession (status: WITH_OPERATOR)
           ├─> Aggiorna QueueEntry (status: ASSIGNED, assignedTo, assignedAt)
           ├─> Chiama queueService.updateQueuePositions()
           ├─> Invia system message PRIMA:
           │   ├─> Crea Message (sender: SYSTEM, "👤 [Nome] si è unito")
           │   └─> WebSocket: { event: 'system_message', message: {...} }
           ├─> Invia greeting DOPO (se non già inviato):
           │   ├─> Crea Message (sender: OPERATOR, automated_text: operator_greeting)
           │   └─> WebSocket: { event: 'new_operator_message', message: {...} }
           └─> Ritorna: { success: true, chatId, operator }

4. Widget riceve notifiche WebSocket:
   └─> handleNotification():
       ├─> case 'system_message':
       │   └─> if (!displayedMessageIds.has(msg.id)):
       │       ├─> displayedMessageIds.add(msg.id)
       │       └─> addMessage(msg.message, 'system')
       └─> case 'new_operator_message':
           └─> if (!displayedMessageIds.has(msg.id)):
               ├─> displayedMessageIds.add(msg.id)
               ├─> addMessage(msg.message, 'operator')
               └─> updateHeaderForOperatorMode()
```

**Variabili di stato**:
- `ChatSession.status`: `ACTIVE` → `WITH_OPERATOR`
- `QueueEntry.status`: `WAITING` → `ASSIGNED`
- `OperatorChat.endedAt`: `null` (attiva)
- `Message.sender`: `SYSTEM`, `OPERATOR`

**Condizioni critiche**:
- Comando `request_operator` NON salvato come Message
- System message inviato PRIMA di greeting
- Deduplicazione via `displayedMessageIds` su WebSocket
- Idempotenza: stesso operatore può chiamare take-chat più volte senza duplicati

---

### 1.3 Creazione ticket

```
TICKET FLOW (Multi-step):

1. Trigger:
   ├─> User clicca smartAction 'request_ticket', oppure
   └─> User scrive "voglio aprire un ticket" / "crea ticket"

2. Backend rileva trigger:
   └─> POST /api/chat { message: 'apri ticket' | regex match }
       ├─> NON salva trigger come Message
       ├─> Verifica ticket esistente:
       │   └─> SELECT * FROM Ticket
       │       WHERE sessionId = ?
       │       AND status IN ('OPEN', 'IN_PROGRESS', 'WAITING_USER')
       ├─> Se esiste:
       │   └─> Ritorna: { reply: "Hai già ticket #[number] aperto", ticketNumber }
       └─> Se NON esiste:
           ├─> Aggiorna ChatSession (status: REQUESTING_TICKET)
           └─> Ritorna: {
                 reply: automated_text('ticket_start'), // "Qual è il tuo nome?"
                 status: 'requesting_ticket'
               }

3. Raccolta dati (sequence):

   Step 1 - Nome:
   └─> User: "Mario Rossi"
       └─> Backend salva in session metadata { ticketData: { name: "Mario Rossi" } }
       └─> Ritorna: "Qual è la tua email?"

   Step 2 - Email:
   └─> User: "mario@example.com"
       └─> Valida formato email
       └─> Salva in metadata.ticketData.email
       └─> Ritorna: "Descrivi il problema"

   Step 3 - Descrizione:
   └─> User: "Le luci non si accendono"
       └─> Salva in metadata.ticketData.description
       └─> Crea Ticket:
           ├─> ticketNumber: auto-incrementale (T-000001)
           ├─> sessionId
           ├─> subject: auto-generato da descrizione
           ├─> description
           ├─> priority: MEDIUM (default)
           ├─> status: OPEN
           ├─> contactMethod: CHAT
           ├─> customerName, customerEmail
           ├─> resumeUrl: /api/chat/resume/[token]
       └─> Aggiorna ChatSession (status: ACTIVE)
       └─> Ritorna: {
             reply: automated_text('ticket_created', { ticketNumber, resumeUrl }),
             ticketNumber,
             resumeUrl
           }
```

**Variabili di stato**:
- `ChatSession.status`: `ACTIVE` → `REQUESTING_TICKET` → `ACTIVE`
- `ChatSession.metadata.ticketData`: oggetto temporaneo per raccolta dati
- `Ticket.status`: `OPEN`
- `Ticket.resumeUrl`: token JWT firmato

**Dati raccolti**:
- `customerName` (step 1)
- `customerEmail` (step 2, validato)
- `description` (step 3)
- `subject` (auto-generato)
- `contactMethod`: sempre `CHAT`

---

### 1.4 Chiusura conversazione da parte dell'operatore

```
CLOSURE FLOW:

1. Operatore clicca "Chiudi conversazione" in dashboard:
   └─> POST /api/operators/close-conversation { sessionId, operatorId }
       ├─> Verifica session è WITH_OPERATOR
       ├─> Crea Message:
       │   ├─> sender: SYSTEM
       │   ├─> message: automated_text('closure_request') // "Posso aiutarti con qualcos'altro?"
       │   └─> metadata: {
       │         smartActions: [
       │           { action: 'continue_chat', text: 'Sì, ho ancora bisogno' },
       │           { action: 'end_chat', text: 'No, grazie' }
       │         ],
       │         isClosureRequest: true
       │       }
       ├─> Salva Message nel DB (per polling fallback)
       └─> Invia WebSocket:
           └─> {
                 event: 'closure_request',
                 message: {
                   id, sender: 'SYSTEM', message, timestamp, smartActions
                 }
               }

2. Widget riceve e mostra:
   └─> case 'closure_request':
       └─> if (!displayedMessageIds.has(msg.id)):
           ├─> displayedMessageIds.add(msg.id)
           ├─> addMessage(msg.message, 'bot')
           └─> showSmartActions(msg.smartActions)

3. User risponde:

   Caso A - "Sì, ho ancora bisogno":
   └─> POST /api/chat { message: 'continue_chat', sessionId }
       ├─> NON salva 'continue_chat' come Message (comando interno)
       ├─> ChatSession.status rimane WITH_OPERATOR
       └─> Ritorna: {
             reply: automated_text('chat_continue'), // "Ok, continua pure"
             status: 'with_operator'
           }

   Caso B - "No, grazie":
   └─> POST /api/chat { message: 'end_chat', sessionId }
       ├─> NON salva 'end_chat' come Message (comando interno)
       ├─> Aggiorna OperatorChat (endedAt: NOW())
       ├─> Aggiorna ChatSession (status: ACTIVE) // Torna ad AI
       ├─> CLEANUP QUEUE:
       │   └─> UPDATE QueueEntry
       │       SET status='CANCELLED', cancelledAt=NOW(), cancelReason='chat_ended'
       │       WHERE sessionId=? AND status IN ('WAITING','ASSIGNED')
       └─> Ritorna: {
             reply: automated_text('chat_end_goodbye'), // "Grazie, a presto!"
             status: 'back_to_ai',
             operatorConnected: false
           }
```

**Variabili di stato**:
- `Message.metadata.isClosureRequest`: `true`
- `OperatorChat.endedAt`: `null` → `timestamp` (se end_chat)
- `ChatSession.status`: `WITH_OPERATOR` → `ACTIVE` (se end_chat)
- `QueueEntry.status`: `ASSIGNED` → `CANCELLED` (se end_chat)

**Comandi interni**:
- `continue_chat`: NON salvato, mantiene status
- `end_chat`: NON salvato, termina operatorChat + cleanup queue

**Deduplicazione**:
- `displayedMessageIds.has(msg.id)` previene doppio "Posso aiutarti?"

---

### 1.5 Riapertura conversazione da link resume

```
RESUME FLOW:

1. User riceve email/SMS con resumeUrl:
   └─> https://lucine-chatbot.onrender.com/api/chat/resume/[TOKEN]

2. User clicca link:
   └─> GET /api/chat/resume/[TOKEN]
       ├─> Verifica token JWT:
       │   ├─> Decodifica payload: { ticketId, sessionId }
       │   └─> Se invalido/scaduto → 404 "Token non valido"
       ├─> Recupera Ticket:
       │   └─> SELECT * FROM Ticket WHERE id = ticketId
       ├─> Recupera ChatSession con messaggi:
       │   └─> SELECT * FROM ChatSession WHERE sessionId = sessionId
       │       INCLUDE Messages ORDER BY timestamp ASC
       └─> Ritorna HTML redirect a widget con params:
           └─> https://lucinedinatale.it/?chatbot=test&resume=[sessionId]

3. Widget rileva param resume:
   └─> URL contiene ?resume=[sessionId]
       ├─> Imposta sessionId = [sessionId]
       ├─> GET /api/chat/sessions/[sessionId]
       │   └─> Ritorna: { sessionId, status, messages: [...], operatorName }
       ├─> Carica storico messaggi nel widget:
       │   └─> messages.forEach(msg => {
       │         displayedMessageIds.add(msg.id);
       │         addMessage(msg.message, msg.sender.toLowerCase());
       │       })
       └─> Aggiorna ChatSession (status: ACTIVE)
       └─> Widget pronto per nuovi messaggi

4. User scrive nuovo messaggio:
   └─> POST /api/chat { message, sessionId }
       └─> Continua flusso normale (AI o operatore se già assegnato)
```

**Variabili di stato**:
- `Ticket.resumeUrl`: `/api/chat/resume/[JWT_TOKEN]`
- Token JWT payload: `{ ticketId, sessionId, exp }`
- `ChatSession.status`: qualsiasi → `ACTIVE`
- `displayedMessageIds`: popolato con IDs storici

**Comportamento**:
- Storico messaggi visibile
- Session riattivata
- Può essere riassegnato a operatore diverso
- Ticket rimane collegato

---

## 2. Messaggi automatici (Automated Texts)

| Nome interno | Testo visualizzato | Trigger/Condizione | Sender | Canale |
|--------------|-------------------|-------------------|--------|---------|
| `ai_greeting` | "Ciao! Sono Lucy, l'assistente AI di Lucine di Natale. Come posso aiutarti?" | Prima apertura widget, sessionId nuovo | `BOT` | HTTP Response |
| `operator_greeting` | "Ciao! Un attimo che controllo la tua richiesta..." | Operatore prende chat, se nessun messaggio OPERATOR esistente | `OPERATOR` | WebSocket + DB (polling fallback) |
| `escalation_offer` | "Non ho informazioni sufficienti. Vuoi parlare con un operatore umano?" | AI non trova risposta in knowledge base, confidence < threshold | `BOT` | HTTP Response |
| `queue_position` | "🎉 Sei salito in coda! Ora sei al [position]° posto (attesa ~[wait] min)" | User aggiunto a QueueEntry, o posizione cambia | `SYSTEM` | WebSocket (queue_update event) |
| `operators_busy` | "⏰ Tutti gli operatori sono occupati. Attesa stimata: ~[wait] minuti" | Escalation richiesta, operatori.count(isOnline=true) = 0 | `BOT` | HTTP Response |
| `closure_request` | "Posso aiutarti con qualcos'altro?" | Operatore clicca "Chiudi conversazione" | `SYSTEM` | WebSocket (closure_request event) + DB |
| `chat_continue` | "Perfetto! Continua pure a scrivere." | User clicca "Sì, ho ancora bisogno" dopo closure | `BOT` | HTTP Response |
| `chat_end_goodbye` | "Grazie per averci contattato! A presto 🎄" | User clicca "No, grazie" dopo closure | `BOT` | HTTP Response |
| `ticket_start` | "Perfetto! Apriamo un ticket. Qual è il tuo nome completo?" | User richiede ticket, nessun ticket aperto esistente | `BOT` | HTTP Response |
| `ticket_email_request` | "Grazie [name]! Qual è la tua email per il follow-up?" | Step 2 creazione ticket, dopo nome ricevuto | `BOT` | HTTP Response |
| `ticket_description_request` | "Perfetto! Ora descrivi il problema che stai riscontrando." | Step 3 creazione ticket, dopo email validata | `BOT` | HTTP Response |
| `ticket_created` | "✅ Ticket #[ticketNumber] creato! Ti abbiamo inviato un'email con il link per continuare: [resumeUrl]" | Ticket salvato nel DB con successo | `BOT` | HTTP Response |
| `ticket_already_exists` | "Hai già un ticket aperto: #[ticketNumber]. Vuoi continuare con quello?" | User richiede ticket, ma esiste già uno OPEN/IN_PROGRESS | `BOT` | HTTP Response |
| `sla_warning` | "⚠️ Cliente in attesa da [minutes] minuti - SLA vicino a scadenza" | Queue entry > 15 minuti, slaWarningNotified=false | `SYSTEM` | SMS/Dashboard notification (operatori) |
| `sla_violation` | "🚨 VIOLAZIONE SLA - Ticket #[ticketNumber] - Cliente in attesa da [minutes] min" | Queue entry > 30 minuti, slaViolationNotified=false | `SYSTEM` | SMS/Dashboard notification (manager) |

**Note**:
- Tutti i testi sono configurabili in DB (`AutomatedText` table)
- Supportano variabili con sintassi `[variableName]`
- WebSocket ha priorità, DB+polling è fallback
- Messaggi OPERATOR e SYSTEM controllano `displayedMessageIds` per deduplicazione

---

## 3. Modello dati (Entità principali)

### 3.1 ChatSession

**Scopo**: Rappresenta una conversazione utente (unica per sessionId)

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | Int | Primary key auto-incrementale | |
| `sessionId` | String | UUID univoco generato server-side | Usato come chiave pubblica |
| `status` | SessionStatus | Stato corrente della sessione | Enum (vedi sotto) |
| `createdAt` | DateTime | Timestamp creazione | Auto-generato |
| `endedAt` | DateTime? | Timestamp chiusura (se chiusa) | Null se attiva |
| `lastActivity` | DateTime | Ultimo messaggio/interazione | Aggiornato ad ogni POST /api/chat |
| `metadata` | Json | Dati extra (IP, userAgent, ticketData temporaneo) | Oggetto flessibile |
| `messages` | Message[] | Relazione 1:N con messaggi | |
| `operatorChats` | OperatorChat[] | Relazione 1:N con assegnazioni operatore | |
| `tickets` | Ticket[] | Relazione 1:N con ticket creati | |
| `queueEntries` | QueueEntry[] | Relazione 1:N con posizioni in coda | |

**Enum: SessionStatus**
```
ACTIVE              // Conversazione attiva con AI
WITH_OPERATOR       // Assegnata a operatore umano
REQUESTING_TICKET   // In raccolta dati per ticket (stato temporaneo)
WAITING_CLIENT      // Timeout: attesa risposta cliente (dopo inattività)
ENDED               // Chiusa definitivamente
CANCELLED           // Annullata (timeout o altro)
RESOLVED            // Risolta con successo
NOT_RESOLVED        // Chiusa senza risoluzione
```

**Transizioni di stato valide** (state-machine.js):
```
ACTIVE → WITH_OPERATOR, REQUESTING_TICKET, WAITING_CLIENT, ENDED
WITH_OPERATOR → RESOLVED, NOT_RESOLVED, WAITING_CLIENT, CANCELLED, ACTIVE
REQUESTING_TICKET → ACTIVE, ENDED
WAITING_CLIENT → ACTIVE, WITH_OPERATOR, ENDED
```

---

### 3.2 Message

**Scopo**: Singolo messaggio in una conversazione

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | Int | Primary key | |
| `sessionId` | String | FK a ChatSession | |
| `sender` | MessageSender | Chi ha inviato il messaggio | Enum (vedi sotto) |
| `message` | String | Contenuto testuale | Sanitized/escaped |
| `timestamp` | DateTime | Quando è stato inviato | Auto-generato |
| `metadata` | Json | Dati extra (operatorId, isAutomatic, smartActions) | |
| `session` | ChatSession | Relazione N:1 | |

**Enum: MessageSender**
```
USER       // Cliente finale
BOT        // AI (GPT-3.5)
OPERATOR   // Operatore umano
SYSTEM     // Sistema (notifiche, eventi)
```

**Metadata comuni**:
```json
// Per OPERATOR messages:
{
  "operatorId": "uuid",
  "isAutomatic": true,  // Se è greeting automatico
  "operatorName": "Mario Rossi"
}

// Per SYSTEM messages con azioni:
{
  "smartActions": [
    { "action": "continue_chat", "text": "...", "type": "success" }
  ],
  "isClosureRequest": true
}

// Per BOT messages con escalation:
{
  "escalation": "operator",
  "confidence": 0.3,
  "smartActions": [...]
}
```

**Regole**:
- Comandi interni (`continue_chat`, `end_chat`, `request_operator`) NON salvati come Message
- Ogni Message ha un `id` univoco per deduplicazione widget
- Ordinamento sempre per `timestamp ASC`

---

### 3.3 Ticket

**Scopo**: Richiesta di assistenza asincrona con follow-up

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `ticketNumber` | String | Numero leggibile (T-000001) | Auto-incrementale, UNIQUE |
| `sessionId` | String | FK a ChatSession | Collegamento alla conversazione |
| `subject` | String | Titolo/oggetto ticket | Max 200 caratteri |
| `description` | String | Descrizione problema | Raccolta da user in step 3 |
| `priority` | Priority | Urgenza ticket | Enum (default: MEDIUM) |
| `status` | TicketStatus | Stato lavorazione | Enum (vedi sotto) |
| `contactMethod` | ContactMethod | Come contattare cliente | Enum (sempre CHAT per ora) |
| `customerName` | String | Nome cliente | Raccolta in step 1 |
| `customerEmail` | String | Email cliente | Raccolta in step 2, validata |
| `customerPhone` | String? | Telefono (opzionale) | Non raccolto attualmente |
| `assignedTo` | String? | Operatore assegnato (FK) | Null se non assegnato |
| `createdAt` | DateTime | Timestamp creazione | |
| `updatedAt` | DateTime | Ultimo aggiornamento | |
| `resolvedAt` | DateTime? | Timestamp risoluzione | Null se non risolto |
| `resumeUrl` | String | Link per riprendere chat | `/api/chat/resume/[JWT_TOKEN]` |
| `metadata` | Json | Dati extra | |
| `session` | ChatSession | Relazione N:1 | |
| `assignedOperator` | Operator? | Relazione N:1 | |

**Enum: Priority**
```
LOW       // Priorità bassa
MEDIUM    // Priorità media (default)
HIGH      // Priorità alta
URGENT    // Urgente (escalation SLA)
```

**Enum: TicketStatus**
```
OPEN             // Appena creato, non assegnato
IN_PROGRESS      // Operatore ci sta lavorando
WAITING_USER     // In attesa risposta cliente
WAITING_INTERNAL // In attesa info interne
RESOLVED         // Risolto
CLOSED           // Chiuso senza risoluzione
CANCELLED        // Annullato
```

**Enum: ContactMethod**
```
EMAIL    // Contatto via email
PHONE    // Contatto telefonico
CHAT     // Contatto via widget chat (default)
SMS      // Contatto via SMS
```

**Resume URL**:
- Token JWT firmato con `JWT_SECRET`
- Payload: `{ ticketId, sessionId, exp: 7d }`
- Validità: 7 giorni dalla creazione
- Permette ripresa conversazione senza autenticazione

---

### 3.4 Operator

**Scopo**: Utente operatore dashboard

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `username` | String | Username login (UNIQUE) | Min 3 caratteri |
| `password` | String | Password hash (bcrypt) | Min 8 caratteri, hashed |
| `name` | String | Nome completo | Visualizzato in chat |
| `displayName` | String? | Nome alternativo widget | Se null, usa `name` |
| `email` | String | Email (UNIQUE) | Per notifiche |
| `role` | OperatorRole | Ruolo/permessi | Enum (default: OPERATOR) |
| `isActive` | Boolean | Account attivo | False = disabilitato |
| `isOnline` | Boolean | Stato online | Aggiornato da heartbeat |
| `lastSeen` | DateTime | Ultimo accesso | Aggiornato ogni 30s |
| `createdAt` | DateTime | Data creazione account | |
| `operatorChats` | OperatorChat[] | Relazione 1:N chat assegnate | |
| `assignedTickets` | Ticket[] | Relazione 1:N ticket assegnati | |

**Enum: OperatorRole**
```
ADMIN       // Accesso completo, gestione utenti
SUPERVISOR  // Supervisione, reports, SLA
OPERATOR    // Operatore standard
```

**Calcolo "disponibilità"**:
```javascript
const isAvailable = operator.isOnline
                 && operator.isActive
                 && (activeChatsCount === 0);
```

**Heartbeat**:
- Dashboard invia GET /api/operators/heartbeat ogni 30s
- Aggiorna `isOnline=true` e `lastSeen=NOW()`
- Se lastSeen > 5 minuti fa → considerato offline

---

### 3.5 OperatorChat

**Scopo**: Associazione operatore ↔ sessione (assegnazione chat)

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `sessionId` | String | FK a ChatSession | |
| `operatorId` | String | FK a Operator | |
| `startedAt` | DateTime | Inizio presa in carico | Auto-generato |
| `endedAt` | DateTime? | Fine (se chiusa) | Null = ancora attiva |
| `session` | ChatSession | Relazione N:1 | |
| `operator` | Operator | Relazione N:1 | |

**Constraint UNIQUE**:
- `sessionId` + `endedAt=null` → un solo operatore attivo per sessione

**Query chiave**:
```sql
-- Chat attive per operatore
SELECT * FROM OperatorChat
WHERE operatorId = ? AND endedAt IS NULL;

-- Chat in corso per sessione
SELECT * FROM OperatorChat
WHERE sessionId = ? AND endedAt IS NULL;
```

**Lifecycle**:
1. Creata quando operatore prende chat (`POST /operators/take-chat`)
2. `endedAt` impostato quando:
   - User clicca "No, grazie" (end_chat)
   - Timeout inattività (WAITING_CLIENT → ENDED)
3. Può esistere più di un OperatorChat per sessionId (riassegnazioni)

---

### 3.6 QueueEntry

**Scopo**: Posizione in coda per richieste operatore

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `sessionId` | String | FK a ChatSession (UNIQUE) | |
| `priority` | Priority | Priorità in coda | Enum (LOW/MEDIUM/HIGH/URGENT) |
| `requiredSkills` | String[] | Competenze richieste | Array vuoto = qualsiasi operatore |
| `status` | QueueStatus | Stato entry | Enum (vedi sotto) |
| `enteredAt` | DateTime | Timestamp ingresso coda | |
| `assignedAt` | DateTime? | Timestamp assegnazione | |
| `cancelledAt` | DateTime? | Timestamp cancellazione | |
| `assignedTo` | String? | Operatore assegnato (FK) | |
| `cancelReason` | String? | Motivo cancellazione | 'chat_ended', 'timeout', 'user_cancel' |
| `estimatedWaitTime` | Int | Attesa stimata (minuti) | Ricalcolato dinamicamente |
| `slaWarningNotified` | Boolean | Notifica warning inviata | True dopo 15 min |
| `slaViolationNotified` | Boolean | Notifica violazione inviata | True dopo 30 min |
| `session` | ChatSession | Relazione N:1 | |

**Enum: QueueStatus**
```
WAITING    // In attesa assegnazione
ASSIGNED   // Assegnata a operatore
CANCELLED  // Cancellata (vari motivi)
TIMEOUT    // Timeout attesa
```

**Calcolo priorità ranking** (per ordinamento):
```javascript
const priorityRank = {
  'URGENT': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1
};

// Ordinamento coda:
ORDER BY priorityRank DESC, enteredAt ASC  // FIFO per stessa priorità
```

**Calcolo posizione**:
```javascript
// Numero di entry con priorità maggiore O stessa priorità ma entrate prima
position = QueueEntry.count(
  status='WAITING' AND (
    priorityRank > myRank
    OR (priorityRank = myRank AND enteredAt < myEnteredAt)
  )
) + 1;
```

**Cleanup automatico** (cron job ogni 10 minuti):
```javascript
// Trova entry WAITING > 30 min con session terminata
const staleEntries = QueueEntry.findMany({
  status: 'WAITING',
  enteredAt: { lt: NOW() - 30min },
  session: { status: 'ENDED' | 'CANCELLED' | 'RESOLVED' }
});

// Marca come CANCELLED
staleEntries.forEach(entry => {
  entry.update({
    status: 'CANCELLED',
    cancelledAt: NOW(),
    cancelReason: 'session_ended_cleanup'
  });
});
```

**SLA Monitoring** (ogni 60s):
```javascript
// Warning (15 min)
const warningEntries = QueueEntry.findMany({
  status: 'WAITING',
  enteredAt: { between: [NOW()-30min, NOW()-15min] },
  slaWarningNotified: false
});
// → Invia notifica operatori, set slaWarningNotified=true

// Violation (30 min)
const violationEntries = QueueEntry.findMany({
  status: 'WAITING',
  enteredAt: { lt: NOW()-30min },
  slaViolationNotified: false
});
// → Crea ticket URGENT, notifica manager, upgrade priority='HIGH'
```

---

### 3.7 SLARecord (opzionale - monitoraggio)

**Scopo**: Tracciamento metriche SLA per analytics

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `sessionId` | String | FK a ChatSession | |
| `ticketId` | String? | FK a Ticket (se presente) | |
| `firstResponseTime` | Int? | Tempo prima risposta (secondi) | Null se non risposto |
| `resolutionTime` | Int? | Tempo risoluzione totale (secondi) | Null se non risolto |
| `waitTimeInQueue` | Int? | Tempo in coda (secondi) | Null se assegnato immediatamente |
| `handledBy` | String? | Operatore che ha gestito | FK a Operator |
| `slaStatus` | SLAStatus | Rispetto SLA | Enum (vedi sotto) |
| `createdAt` | DateTime | Timestamp record | |

**Enum: SLAStatus**
```
MET                 // SLA rispettato
WARNING             // Vicino a scadenza
VIOLATED_RESPONSE   // Violato SLA prima risposta
VIOLATED_RESOLUTION // Violato SLA risoluzione
```

**Soglie SLA**:
```javascript
const SLA_THRESHOLDS = {
  firstResponse: 5 * 60,      // 5 minuti
  resolution: 24 * 60 * 60,   // 24 ore
  warningThreshold: 15 * 60,  // 15 minuti (warning)
  violationThreshold: 30 * 60 // 30 minuti (violation)
};
```

---

### 3.8 AutomatedText

**Scopo**: Messaggi configurabili nel DB

| Campo | Tipo | Descrizione | Valori/Note |
|-------|------|-------------|-------------|
| `id` | String | UUID primary key | |
| `key` | String | Chiave univoca (UNIQUE) | Es: 'operator_greeting' |
| `text` | String | Testo messaggio | Supporta variabili `[var]` |
| `description` | String? | Descrizione uso | Per dashboard |
| `language` | String | Lingua (default: 'it') | Supporto i18n futuro |
| `isActive` | Boolean | Attivo | False = usa fallback |
| `createdAt` | DateTime | Timestamp creazione | |
| `updatedAt` | DateTime | Ultimo aggiornamento | |

**Esempi**:
```
key: 'operator_greeting'
text: 'Ciao! Un attimo che controllo la tua richiesta...'

key: 'ticket_created'
text: '✅ Ticket #[ticketNumber] creato! Link: [resumeUrl]'

key: 'queue_position'
text: '🎉 Sei salito in coda! Ora sei al [position]° posto (attesa ~[wait] min)'
```

**Interpolazione variabili**:
```javascript
function interpolate(text, vars) {
  return text.replace(/\[(\w+)\]/g, (match, key) => vars[key] || match);
}

// Uso:
const text = getAutomatedText('ticket_created');
const final = interpolate(text, { ticketNumber: 'T-000123', resumeUrl: '...' });
```

---

## 4. Comportamento del widget frontend

### 4.1 Attivazione e inizializzazione

**Trigger attivazione**:
```
Condizione: URL contiene parametro ?chatbot=test
Esempio: https://lucinedinatale.it/products/luci-natale?chatbot=test

1. Snippet HTML incluso in theme.liquid (Shopify):
   {% include 'chatbot-popup' %}

2. Script si auto-inizializza:
   const urlParams = new URLSearchParams(window.location.search);
   if (urlParams.get('chatbot') === 'test') {
     initializeChatbot();
   }

3. Bolla chat appare in basso a destra:
   - Background: rgba(255,255,255,0.1) blur
   - Border: 2px rgba(255,255,255,0.3)
   - Icon: SVG chat bubble bianco
   - Animation: pulse 2s infinite

4. Primo click su bolla:
   └─> Apre popup (400x600px)
   └─> POST /api/chat { message: '', sessionId: null }
       └─> Backend genera sessionId + invia ai_greeting
   └─> Mostra greeting AI
   └─> Input field attivato
```

**Stati widget**:
- `closed`: bolla visibile, popup nascosto
- `open`: popup visibile (400x600px)
- `minimized`: (non implementato - solo open/closed)

**Elementi UI**:
```
┌─────────────────────────────┐
│ Header                      │ ← Nome operatore se WITH_OPERATOR
│ [Close X]                   │
├─────────────────────────────┤
│                             │
│  Messages Container         │ ← Scroll automatico su nuovi
│  (auto-scroll)              │
│                             │
│  [BOT] Ciao! Sono Lucy...   │
│  [USER] Vorrei info         │
│  [OPERATOR] Certo, dimmi... │
│                             │
├─────────────────────────────┤
│ [Input field____________ ] │
│               [Send button] │
└─────────────────────────────┘
```

---

### 4.2 Visualizzazione messaggi

**Rendering message bubble**:
```javascript
function addMessage(text, sender) {
  // sender: 'bot' | 'user' | 'operator' | 'system'

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${sender}`;

  // Stili per sender:
  if (sender === 'user') {
    // Align right, background christmas-green, text white
    bubble.style = 'align-self: flex-end; background: #059669; color: white;';
  } else if (sender === 'operator') {
    // Align left, background christmas-red, text white
    bubble.style = 'align-self: flex-start; background: #dc2626; color: white;';
  } else if (sender === 'bot') {
    // Align left, background dark gray, text light
    bubble.style = 'align-self: flex-start; background: #374151; color: #e5e7eb;';
  } else if (sender === 'system') {
    // Center, background gold, text dark, full width
    bubble.style = 'align-self: center; background: #f59e0b; color: #1a1a1a; text-align: center;';
  }

  bubble.textContent = text;
  messagesContainer.appendChild(bubble);

  // Auto-scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
```

**Ordine messaggi**:
- Sempre `timestamp ASC` (dal più vecchio al più recente)
- Nuovi messaggi appesi in fondo
- Auto-scroll attivato solo se utente già in fondo (UX)

**Deduplicazione**:
```javascript
const displayedMessageIds = new Set();

// Prima di addMessage():
if (displayedMessageIds.has(msg.id)) {
  console.log('⚠️ Duplicate prevented:', msg.id);
  return; // Non mostrare
}

displayedMessageIds.add(msg.id);
addMessage(msg.message, msg.sender.toLowerCase());
```

---

### 4.3 Passaggio AI → Operatore

**Indicatori UI cambio modalità**:

```javascript
// 1. WebSocket notifica: operator_connected
case 'operator_connected':
  isOperatorMode = true;
  updateHeaderForOperatorMode();
  break;

function updateHeaderForOperatorMode() {
  // Cambia header da "Lucy AI" a "Operatore: [Nome]"
  headerTitle.textContent = `👤 ${operatorName || 'Operatore'}`;
  headerSubtitle.textContent = 'In linea';

  // Cambia colore header
  header.style.background = 'linear-gradient(135deg, #dc2626, #f59e0b)';

  // Mostra indicatore online
  const onlineIndicator = document.createElement('div');
  onlineIndicator.className = 'online-indicator';
  onlineIndicator.style = 'width: 8px; height: 8px; background: #10b981; border-radius: 50%;';
  header.appendChild(onlineIndicator);
}

// 2. Primo messaggio operatore ricevuto:
case 'new_operator_message':
  if (!isOperatorMode) {
    isOperatorMode = true;
    updateHeaderForOperatorMode();
  }
  // ... rest of handler
```

**Flusso completo**:
```
1. User clicca "Sì, voglio operatore"
   └─> sendMessage('request_operator')
   └─> Reply: "⏰ Operatori occupati, attesa ~X min"
   └─> Mostra: smartActions [Attendi | Ticket | AI]

2. (Lato dashboard) Operatore vede pending chat
   └─> Clicca "Prendi chat"
   └─> Backend: take-chat → crea OperatorChat

3. Widget riceve WebSocket:
   └─> Event: 'system_message'
       └─> "👤 Mario Rossi si è unito alla chat"
       └─> addMessage(msg, 'system') // Banner gold centered

   └─> Event: 'new_operator_message'
       └─> "Ciao! Un attimo che controllo..."
       └─> addMessage(msg, 'operator') // Bubble red left
       └─> updateHeaderForOperatorMode() // Header rosso + nome operatore

4. User vede:
   ┌─────────────────────────────┐
   │ 👤 Mario Rossi        [🟢] │ ← Online indicator
   │ In linea                    │
   ├─────────────────────────────┤
   │ [SYSTEM] 👤 Mario Rossi     │
   │          si è unito         │
   │ [OPERATOR] Ciao! Un         │
   │            attimo...        │
   └─────────────────────────────┘

5. Messaggi user ora vanno a operatore:
   └─> POST /api/chat (status: WITH_OPERATOR)
   └─> Backend NON chiama AI
   └─> Notifica operatore via WebSocket
   └─> Reply: null (no bot response)
```

---

### 4.4 Apertura ticket

**UI Flow**:

```
1. User vede smartAction "Apri ticket":
   └─> Button HTML:
       <button class="smart-action-btn" data-action="request_ticket">
         📝 Apri un ticket
       </button>

   └─> Click handler:
       sendMessage('request_ticket');

2. Widget invia comando + riceve step 1:
   └─> POST /api/chat { message: 'request_ticket' }
   └─> Reply: "Perfetto! Qual è il tuo nome?"
   └─> addMessage(reply, 'bot')

3. User digita nome:
   └─> "Mario Rossi"
   └─> POST /api/chat { message: 'Mario Rossi' }
   └─> Backend salva in metadata.ticketData.name
   └─> Reply: "Grazie Mario! Qual è la tua email?"

4. User digita email:
   └─> "mario@example.com"
   └─> Backend valida formato + salva in metadata.ticketData.email
   └─> Reply: "Perfetto! Ora descrivi il problema"

5. User digita descrizione:
   └─> "Le luci non si accendono"
   └─> Backend:
       ├─> Crea Ticket in DB
       ├─> Genera ticketNumber (T-000123)
       ├─> Genera resumeUrl con JWT
       ├─> Pulisce metadata.ticketData
       └─> Reply: "✅ Ticket #T-000123 creato! Ti abbiamo inviato email con link: [url]"

6. Widget mostra conferma:
   [BOT] ✅ Ticket #T-000123 creato!
         Ti abbiamo inviato email con il link per continuare:
         https://lucine-chatbot.onrender.com/api/chat/resume/eyJ...

   [Button] Chiudi chat
```

**Validazione step email**:
```javascript
// Backend valida formato
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return {
    reply: "⚠️ Email non valida. Riprova:",
    status: 'requesting_ticket'
  };
}
```

**Indicatore progresso** (opzionale):
```
Header mostra: "Apertura ticket (2/3)" durante raccolta dati
```

---

### 4.5 Ripresa da resumeUrl

**Flow completo**:

```
1. User clicca link email:
   └─> https://lucine-chatbot.onrender.com/api/chat/resume/[TOKEN]

2. Backend (resume-handler.js):
   └─> Verifica JWT token
   └─> Decodifica: { ticketId, sessionId, exp }
   └─> Recupera Ticket + ChatSession
   └─> Redirect a:
       https://lucinedinatale.it/?chatbot=test&resume=[sessionId]

3. Widget rileva parametro resume:
   const resumeSessionId = urlParams.get('resume');
   if (resumeSessionId) {
     resumeChat(resumeSessionId);
   }

4. Function resumeChat():
   async function resumeChat(sessionId) {
     // Imposta sessionId
     window.sessionId = sessionId;

     // Apri widget automaticamente
     openChatPopup();

     // Mostra loader
     showLoader('Caricamento conversazione...');

     // Recupera storico
     const response = await fetch(`/api/chat/sessions/${sessionId}`);
     const data = await response.json();

     // Popola messaggi
     data.messages.forEach(msg => {
       displayedMessageIds.add(msg.id); // Registra ID
       addMessage(msg.message, msg.sender.toLowerCase());
     });

     // Aggiorna header
     if (data.operatorName) {
       headerTitle.textContent = `👤 ${data.operatorName}`;
       isOperatorMode = true;
     }

     // Mostra messaggio sistema
     addMessage(
       '🔄 Conversazione ripresa. Puoi continuare a scrivere.',
       'system'
     );

     // Attiva input
     hideLoader();
     inputField.focus();
   }

5. User può:
   └─> Scrivere nuovo messaggio
       └─> Continua flusso normale (AI o operatore)
   └─> Vedere tutto lo storico precedente
```

**Stato session dopo resume**:
- `status` diventa `ACTIVE` (anche se era `ENDED`)
- Operatore può essere riassegnato (diverso da quello originale)
- Ticket rimane collegato

---

## 5. Comandi di sistema (Trigger)

### 5.1 Lista comandi interni

| Comando | Visibilità | Salvato come Message? | Mostrato a user? | Azione |
|---------|------------|----------------------|------------------|--------|
| `request_operator` | Invisibile | ❌ NO | ❌ NO | Trigger escalation a operatore |
| `continue_chat` | Invisibile | ❌ NO | ❌ NO | Continua chat dopo closure request |
| `end_chat` | Invisibile | ❌ NO | ❌ NO | Termina chat con operatore |
| `request_ticket` | Invisibile | ❌ NO | ❌ NO | Avvia flow creazione ticket |
| `apri ticket` | Visibile (user typed) | ❌ NO | ✅ SI (come input user) | Trigger creazione ticket via keyword |
| `continua con assistente AI` | Invisibile | ❌ NO | ❌ NO | Torna a modalità AI |
| `wait_in_queue` | Invisibile | ❌ NO | ❌ NO | Conferma attesa in coda |

**Implementazione filtro**:

```javascript
// Backend (routes/chat/index.js:85-94)
const internalCommands = [
  'request_operator',
  'continue_chat',
  'end_chat',
  'apri ticket',
  'continua con assistente AI'
];

const isInternalCommand = internalCommands.includes(sanitizedMessage);

if (!isInternalCommand) {
  await saveUserMessage(session.sessionId, sanitizedMessage);
} else {
  console.log(`🔒 Internal command detected, not saving: ${sanitizedMessage}`);
}
```

**Widget (chatbot-popup.liquid:820-824)**:
```javascript
// Comandi nascosti all'user
const isInternalCommand = message === 'request_operator' ||
                          message === 'continua con assistente AI' ||
                          message === 'continue_chat' ||
                          message === 'end_chat' ||
                          message === 'apri ticket';

if (isInternalCommand) {
  // Non mostrare bubble user
  // Invia solo al backend
}
```

---

### 5.2 Trigger basati su keyword (visibili)

**Pattern matching**:

```javascript
// Backend (routes/chat/index.js:181-224)

// Ticket trigger
const ticketTriggers = /apri.*ticket|crea.*ticket|voglio.*ticket|ticket|request_ticket/i;
if (ticketTriggers.test(sanitizedMessage)) {
  // Avvia flow ticket
}

// Escalation trigger (AI decision)
if (aiResponse.escalation === 'operator') {
  // Avvia flow escalation
}
```

**User vede**:
```
[USER] voglio aprire un ticket
[BOT] Perfetto! Qual è il tuo nome?
```

**Backend NON salva**:
- "voglio aprire un ticket" viene salvato come Message (USER)
- Ma il trigger "apri ticket" (esatto) viene filtrato

---

### 5.3 SmartActions (button triggers)

**Struttura smartAction**:
```javascript
{
  type: 'success' | 'secondary' | 'danger',
  icon: '✅' | '❌' | '📝',
  text: 'Testo button',
  description: 'Descrizione hover (opzionale)',
  action: 'continue_chat' | 'end_chat' | 'request_operator' | ...
}
```

**Rendering widget**:
```javascript
function showSmartActions(actions) {
  const container = document.createElement('div');
  container.className = 'smart-actions-container';

  actions.forEach(action => {
    const button = document.createElement('button');
    button.className = `smart-action-btn ${action.type}`;
    button.innerHTML = `${action.icon} ${action.text}`;
    button.dataset.action = action.action;

    button.onclick = () => {
      sendMessage(action.action); // Invia comando interno
      container.remove(); // Rimuovi buttons
    };

    container.appendChild(button);
  });

  messagesContainer.appendChild(container);
}
```

**Esempi uso**:

```javascript
// Escalation offer
smartActions: [
  { action: 'request_operator', text: 'Sì, voglio operatore', type: 'success' },
  { action: 'continue_ai', text: 'No, continua AI', type: 'secondary' }
]

// Closure request
smartActions: [
  { action: 'continue_chat', text: 'Sì, ho ancora bisogno', type: 'success' },
  { action: 'end_chat', text: 'No, grazie', type: 'secondary' }
]

// Queue options
smartActions: [
  { action: 'wait_in_queue', text: 'Attendi in coda', type: 'success' },
  { action: 'request_ticket', text: 'Apri ticket', type: 'secondary' },
  { action: 'continue_ai', text: 'Torna ad AI', type: 'secondary' }
]
```

---

## 6. Logiche SLA e coda

### 6.1 Calcolo priorità in coda

**Formula priority ranking**:

```javascript
const priorityRank = {
  'URGENT': 4,   // +300% urgency
  'HIGH': 3,     // +200% urgency
  'MEDIUM': 2,   // +100% baseline
  'LOW': 1       // +0% (lowest)
};

// Ordinamento coda (queue-service.js:92-95)
ORDER BY
  priorityRank(priority) DESC,  // Priorità più alta prima
  enteredAt ASC                 // FIFO per stessa priorità
```

**Calcolo posizione individuale** (queue-service.js:159-193):

```javascript
async getQueuePosition(sessionId) {
  // 1. Recupera entry per questo sessionId
  const entry = await prisma.queueEntry.findFirst({
    where: { sessionId, status: 'WAITING' }
  });

  if (!entry) return null;

  // 2. Calcola rank numerico
  const myRank = priorityRank[entry.priority] || 1;

  // 3. Conta quante entry sono "davanti"
  const allWaiting = await prisma.queueEntry.findMany({
    where: { status: 'WAITING' },
    select: { priority: true, enteredAt: true }
  });

  const position = allWaiting.filter(item => {
    const itemRank = priorityRank[item.priority] || 1;

    // Davanti se:
    // - Priorità maggiore, OPPURE
    // - Stessa priorità MA entrata prima
    return itemRank > myRank ||
           (itemRank === myRank && item.enteredAt < entry.enteredAt);
  }).length;

  return position + 1; // Position 1-indexed
}
```

**Esempio ordinamento**:
```
QueueEntry #1: priority=HIGH,   enteredAt=10:00 → Position 1
QueueEntry #2: priority=MEDIUM, enteredAt=10:01 → Position 2
QueueEntry #3: priority=URGENT, enteredAt=10:02 → Position 1 (overtakes #1)
QueueEntry #4: priority=MEDIUM, enteredAt=10:03 → Position 3
QueueEntry #5: priority=HIGH,   enteredAt=10:04 → Position 2 (between #3 and #2)

Final order: #3 (URGENT), #5 (HIGH), #1 (HIGH), #2 (MEDIUM), #4 (MEDIUM)
```

---

### 6.2 Calcolo tempo attesa stimato

**Formula** (queue-service.js:198-236):

```javascript
async calculateEstimatedWait(priority) {
  // 1. Conta operatori online
  const onlineOperators = await prisma.operator.count({
    where: { isOnline: true, isActive: true }
  });

  if (onlineOperators === 0) {
    return 30; // 30 min se nessun operatore online
  }

  // 2. Conta quanti sono DAVVERO disponibili (no chat attive)
  let availableCount = 0;
  for (const op of onlineOperators) {
    const activeChats = await prisma.operatorChat.count({
      where: { operatorId: op.id, endedAt: null }
    });
    if (activeChats === 0) availableCount++;
  }

  // 3. Se operatori disponibili → assegnazione quasi immediata
  if (availableCount > 0) {
    return 1; // 1 minuto
  }

  // 4. Tutti occupati → calcola basato su queue size
  const busyOperators = onlineOperators.length;
  const totalWaiting = await prisma.queueEntry.count({
    where: { status: 'WAITING' }
  });

  // Formula: (queue_size / num_operators) * avg_chat_duration
  // Assunto: chat media = 5 minuti
  const estimatedMinutes = Math.ceil((totalWaiting / busyOperators) * 5);

  // 5. Limita tra 3-30 minuti
  return Math.min(30, Math.max(3, estimatedMinutes));
}
```

**Esempi**:
```
Scenario A: 3 operatori online, 0 chat attive
→ estimatedWait = 1 min (assegnazione immediata)

Scenario B: 2 operatori online, 2 chat attive, 6 in coda
→ estimatedWait = (6 / 2) * 5 = 15 min

Scenario C: 0 operatori online
→ estimatedWait = 30 min (massimo)

Scenario D: 1 operatore online, 1 chat attiva, 10 in coda
→ estimatedWait = (10 / 1) * 5 = 50 → capped at 30 min
```

---

### 6.3 Transizioni stato QueueEntry

**Diagramma stato**:

```
       ┌─────────┐
       │ WAITING │ ← Entry creata (addToQueue)
       └────┬────┘
            │
            ├─→ [Operatore prende chat]
            │   └─→ ASSIGNED (assignedTo, assignedAt impostati)
            │
            ├─→ [User clicca "end_chat"]
            │   └─→ CANCELLED (cancelReason: 'chat_ended')
            │
            ├─→ [Timeout > 30 min + session ENDED]
            │   └─→ CANCELLED (cancelReason: 'session_ended_cleanup')
            │
            └─→ [User cancella richiesta]
                └─→ CANCELLED (cancelReason: 'user_cancel')
```

**Trigger cancellazione**:

1. **Chat terminata** (routes/chat/index.js:164-174):
```javascript
// User clicca "No, grazie" dopo closure request
await prisma.queueEntry.updateMany({
  where: {
    sessionId: session.sessionId,
    status: { in: ['WAITING', 'ASSIGNED'] }
  },
  data: {
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancelReason: 'chat_ended'
  }
});
```

2. **Cron cleanup** (server.js:313-324 + queue-service.js:555-599):
```javascript
// Ogni 10 minuti
setInterval(async () => {
  const cleanedCount = await queueService.cleanupStaleEntries();
}, 10 * 60 * 1000);

// cleanupStaleEntries():
const staleEntries = await prisma.queueEntry.findMany({
  where: {
    status: 'WAITING',
    enteredAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } // > 30 min
  },
  include: { session: true }
});

for (const entry of staleEntries) {
  // Cancella se session è terminata
  if (['ENDED', 'CANCELLED', 'RESOLVED', 'NOT_RESOLVED'].includes(entry.session.status)) {
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'session_ended_cleanup'
      }
    });
  }
}
```

3. **Assegnazione operatore** (routes/operators.js:484-511):
```javascript
// Operatore prende chat
const queueEntry = await prisma.queueEntry.findFirst({
  where: { sessionId, status: 'WAITING' }
});

if (queueEntry) {
  await prisma.queueEntry.update({
    where: { id: queueEntry.id },
    data: {
      status: 'ASSIGNED',
      assignedTo: operatorId,
      assignedAt: new Date()
    }
  });

  await queueService.updateQueuePositions(); // Ricalcola posizioni
}
```

---

### 6.4 SLA Monitoring e violazioni

**Soglie SLA**:

```javascript
// queue-service.js:13-14
this.slaWarningThreshold = 15 * 60 * 1000;    // 15 minuti
this.slaViolationThreshold = 30 * 60 * 1000;  // 30 minuti
```

**Check SLA** (eseguito ogni 60 secondi):

```javascript
// queue-service.js:332-382
async checkSLAViolations() {
  const now = new Date();

  // 1. WARNINGS (15-30 min)
  const warningEntries = await prisma.queueEntry.findMany({
    where: {
      status: 'WAITING',
      enteredAt: {
        lt: new Date(now - this.slaWarningThreshold),  // > 15 min fa
        gte: new Date(now - this.slaViolationThreshold) // < 30 min fa
      },
      slaWarningNotified: false
    }
  });

  for (const entry of warningEntries) {
    await this.notifySLAWarning(entry);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { slaWarningNotified: true }
    });
  }

  // 2. VIOLATIONS (> 30 min)
  const violationEntries = await prisma.queueEntry.findMany({
    where: {
      status: 'WAITING',
      enteredAt: { lt: new Date(now - this.slaViolationThreshold) },
      slaViolationNotified: false
    }
  });

  for (const entry of violationEntries) {
    await this.escalateSLAViolation(entry);
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        slaViolationNotified: true,
        priority: 'HIGH' // Upgrade priorità
      }
    });
  }
}
```

**Azioni notifica** (queue-service.js:384-438):

```javascript
// WARNING (15 min)
async notifySLAWarning(queueEntry) {
  const waitTime = Math.round((new Date() - queueEntry.enteredAt) / 60000);
  const remainingTime = Math.round((this.slaViolationThreshold - (new Date() - queueEntry.enteredAt)) / 60000);

  // Notifica tutti operatori online
  const operators = await prisma.operator.findMany({
    where: { isOnline: true, isActive: true }
  });

  // SMS/Dashboard notification (SMS disabilitato - campo phone non in schema)
  // Future: twilioService.sendSMS(operator.phone, `⚠️ Cliente in attesa ${waitTime}min...`)

  console.log(`⏰ SLA warning: session ${queueEntry.sessionId}, wait ${waitTime}min`);
}

// VIOLATION (30 min)
async escalateSLAViolation(queueEntry) {
  const waitTime = Math.round((new Date() - queueEntry.enteredAt) / 60000);

  // 1. Crea ticket automatico URGENT
  const ticket = await prisma.ticket.create({
    data: {
      sessionId: queueEntry.sessionId,
      subject: `SLA VIOLATION - Sessione in attesa ${waitTime} minuti`,
      description: `Escalation automatica per violazione SLA.\n\nSessione ${queueEntry.sessionId} in coda da ${waitTime} minuti.\n\nRichiede intervento immediato.`,
      priority: 'URGENT',
      status: 'OPEN',
      contactMethod: 'CHAT'
    }
  });

  // 2. Notifica manager (tutti operatori per ora)
  const managers = await prisma.operator.findMany({
    where: { isActive: true }
  });

  // Future: SMS managers

  console.log(`🚨 SLA VIOLATION: session ${queueEntry.sessionId}, ticket #${ticket.ticketNumber}`);
}
```

**Timeline esempio**:
```
10:00 - User entra in coda (QueueEntry creata, status=WAITING)
10:15 - Check SLA → WARNING triggered
        └─> slaWarningNotified = true
        └─> Dashboard notification agli operatori
10:30 - Check SLA → VIOLATION triggered
        └─> slaViolationNotified = true
        └─> priority upgrade to HIGH
        └─> Ticket automatico creato (URGENT)
        └─> SMS notification manager
10:32 - Operatore prende chat (finalmente!)
        └─> status = ASSIGNED
        └─> Nessun ulteriore check SLA
```

---

### 6.5 Duplicate prevention in coda

**Check prima di aggiungere** (queue-service.js:36-52):

```javascript
async addToQueue(sessionId, priority = 'MEDIUM', requiredSkills = []) {
  // 1. Verifica se già in coda
  const existing = await this.prisma.queueEntry.findFirst({
    where: {
      sessionId,
      status: { in: ['WAITING', 'ASSIGNED'] }
    }
  });

  // 2. Se esiste già → ritorna entry esistente (no duplicato)
  if (existing) {
    console.log(`ℹ️ Session ${sessionId} already in queue (status: ${existing.status})`);
    return {
      position: await this.getQueuePosition(sessionId),
      estimatedWait: existing.estimatedWaitTime,
      queueId: existing.id,
      alreadyInQueue: true
    };
  }

  // 3. Se non esiste → crea nuovo
  const queueEntry = await this.prisma.queueEntry.create({...});
  // ...
}
```

**Constraint database**:
```prisma
model QueueEntry {
  sessionId String @unique  // ← Previene duplicati a livello DB
  // ... altri campi
}
```

---

## 7. Comunicazione Real-time

### 7.1 WebSocket vs Polling

**Strategia dual-channel**:

```
Priorità 1: WebSocket (instant delivery)
  ↓ fallback se non connesso
Priorità 2: Polling HTTP (ogni 3 secondi)
```

**WebSocket connection** (chatbot-popup.liquid:1334-1402):

```javascript
function connectWebSocket() {
  const wsUrl = 'wss://lucine-chatbot.onrender.com'; // Produzione
  // const wsUrl = 'ws://localhost:3000'; // Sviluppo

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ WebSocket connected');

    // Registra widget con sessionId
    ws.send(JSON.stringify({
      type: 'widget_connect',
      sessionId: sessionId
    }));
  };

  ws.onmessage = (event) => {
    const notification = JSON.parse(event.data);
    handleNotification(notification);
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
    // Polling continua a funzionare
  };

  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected');
    // Tentativo riconnessione dopo 5s
    setTimeout(() => {
      if (sessionId) connectWebSocket();
    }, 5000);
  };
}
```

**Polling fallback** (chatbot-popup.liquid:1094-1136):

```javascript
function startOperatorPolling() {
  pollInterval = setInterval(async () => {
    const response = await fetch(`/api/chat/poll/${sessionId}`);
    const data = await response.json();

    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(msg => {
        // Deduplicazione con displayedMessageIds
        if ((msg.sender === 'OPERATOR' || msg.sender === 'SYSTEM')
            && !displayedMessageIds.has(msg.id)) {

          displayedMessageIds.add(msg.id);

          const senderType = msg.sender === 'OPERATOR' ? 'operator' :
                            msg.sender === 'SYSTEM' ? 'system' : 'bot';

          addMessage(msg.message, senderType);

          if (msg.smartActions) {
            showSmartActions(msg.smartActions);
          }
        }
      });
    }
  }, 3000); // Ogni 3 secondi
}
```

**Backend notification** (utils/notifications.js:20-60):

```javascript
export function notifyWidget(sessionId, notification) {
  const widgetConnections = container.get('widgetConnections');
  const ws = widgetConnections.get(sessionId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(notification));
    console.log(`📤 WebSocket sent to widget ${sessionId}:`, notification.event);
    return true; // Inviato via WebSocket
  } else {
    console.log(`⚠️ Widget ${sessionId} not connected, will use polling`);
    return false; // Fallback a polling
  }
}
```

---

## 8. Note finali

**Assunzioni chiave**:
1. Un solo operatore attivo per sessione (constraint: `sessionId + endedAt=null UNIQUE`)
2. Comandi interni mai salvati come Message nel DB
3. Deduplicazione messaggi via `displayedMessageIds` (Set in-memory widget)
4. Queue cleanup automatico ogni 10 minuti + on chat end
5. SLA check ogni 60 secondi con escalation automatica
6. WebSocket prioritario, polling fallback garantito
7. Resume chat valido per 7 giorni (JWT expiry)
8. Priority coda rispettata con FIFO per stessa priorità

**Limitazioni note**:
1. SMS notifications disabilitate (campo `phone` non in schema Operator)
2. Auto-assignment operatori disabilitato (richiede azione manuale)
3. Skill matching in coda non implementato (campo `requiredSkills` ignorato)
4. I18n (multi-lingua) non implementato (hardcoded italiano)
5. Messaggi vocali non supportati
6. File upload non supportato

**Metriche chiave da monitorare**:
- Tempo medio risposta (firstResponseTime)
- Tempo medio risoluzione (resolutionTime)
- Percentuale violazioni SLA
- Queue size medio per ora del giorno
- Tasso conversione AI → operatore
- Tasso creazione ticket
- Tasso abbandono coda

---

**Fine specifica funzionale**
