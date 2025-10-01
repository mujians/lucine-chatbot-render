# 🗺️ MAPPA COMPLETA DEL SISTEMA - Lucine Chatbot

## 📊 ARCHITETTURA AD ALTO LIVELLO

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
│  ┌──────────────────┐        ┌──────────────────────────────┐  │
│  │  Shopify Store   │  ←───→ │   Chatbot Widget (JS)        │  │
│  │  lucine-minimal/ │        │   assets/chatbot-widget.js   │  │
│  └──────────────────┘        └──────────────────────────────┘  │
│                                       ↓ HTTPS                   │
└───────────────────────────────────────┼─────────────────────────┘
                                        ↓
┌───────────────────────────────────────┼─────────────────────────┐
│                      BACKEND LAYER (Express.js)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    server.js (Entry Point)                │  │
│  │  - Container registration (DI)                            │  │
│  │  - Route mounting                                         │  │
│  │  - WebSocket server                                       │  │
│  │  - Service initialization                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   API Routes    │  │  Middleware  │  │    Services      │  │
│  │   routes/       │  │  middleware/ │  │    services/     │  │
│  └─────────────────┘  └──────────────┘  └──────────────────┘  │
│           ↓                   ↓                    ↓            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Dependency Injection Container              │  │
│  │                  config/container.js                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
└───────────────────────────────────────┼─────────────────────────┘
                                        ↓
┌───────────────────────────────────────┼─────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Prisma ORM Client                      │  │
│  │  - ChatSession, Message, Operator                        │  │
│  │  - Ticket, Analytics, SLARecord                          │  │
│  │  - QueueEntry, OperatorChat                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  OpenAI API  │  │  Twilio SMS  │  │  Email Service       │  │
│  │  GPT-3.5     │  │  (optional)  │  │  (future)            │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 STRUTTURA FILE E RESPONSABILITÀ

### **🎯 Core Files**

| File | Responsabilità | Dipendenze | Stato |
|------|---------------|------------|-------|
| `server.js` | Entry point, DI setup, route mounting | container, prisma, routes | ✅ OK |
| `config/container.js` | Dependency injection container | - | ✅ OK |
| `config/constants.js` | Costanti centralizzate (timeout, rate limits) | - | ✅ OK |
| `prisma/schema.prisma` | Database schema definition | - | ✅ OK |

### **🛣️ Routes (API Endpoints)**

| Route File | Base Path | Responsabilità | Lazy Load | Autenticazione |
|------------|-----------|---------------|-----------|----------------|
| `routes/chat/index.js` | `/api/chat` | Main chat router | ✅ | ❌ Public |
| `routes/chat/ai-handler.js` | - | OpenAI integration | ✅ | - |
| `routes/chat/escalation-handler.js` | - | Operator escalation | ✅ | - |
| `routes/chat/ticket-handler.js` | - | Ticket creation flow | ✅ | - |
| `routes/chat/session-handler.js` | - | Session management | ✅ | - |
| `routes/chat/polling-handler.js` | - | Message polling | ✅ | - |
| `routes/operators.js` | `/api/operators` | Operator login/management | ✅ | ✅ JWT |
| `routes/tickets.js` | `/api/tickets` | Ticket CRUD | ✅ | Partial |
| `routes/chat-management.js` | `/api/chat-management` | Chat status updates | ✅ | ✅ JWT |
| `routes/analytics.js` | `/api/analytics` | Dashboard analytics | ✅ | ❌ |

### **🔧 Services (Background Workers)**

| Service | Funzione | Intervallo | Container | Stato |
|---------|----------|-----------|-----------|-------|
| `timeout-service.js` | Chat timeout (10min inattività) | 2 min | ✅ | ✅ Fixed |
| `sla-service.js` | SLA monitoring & alerts | 1 min | ✅ | ⚠️ Schema error |
| `twilio-service.js` | SMS notifications (optional) | On-demand | ✅ | ✅ |
| `queue-service.js` | Operator queue management | Real-time | ✅ | ✅ |

### **🛡️ Middleware**

| Middleware | Funzione | Usato in | Stato |
|-----------|----------|----------|-------|
| `security.js` | JWT auth, rate limiting, session validation | operators, chat-mgmt | ✅ |
| `response-formatter.js` | API response standardization | Global | ✅ |

### **🔨 Utils (Helper Functions)**

| Util | Funzione | Usato da | Cached |
|------|----------|----------|--------|
| `knowledge.js` | Knowledge base loading & caching | ai-handler | ✅ 5min TTL |
| `state-machine.js` | Chat state transitions | session-handler | - |
| `error-handler.js` | Retry logic, error formatting | ai-handler, routes | - |
| `security.js` | Session ID gen, input sanitization | chat routes | - |
| `notifications.js` | WebSocket operator notifications | services | - |
| `api-response.js` | Response helpers (success/error) | All routes | - |

---

## 🔗 RELAZIONI TRA FILE (Dependency Graph)

```
server.js
  ├─→ container.js (registers prisma, operatorConnections)
  ├─→ routes/chat/index.js
  │     ├─→ ai-handler.js
  │     │     ├─→ knowledge.js (cached)
  │     │     ├─→ error-handler.js (retry)
  │     │     └─→ session-handler.js
  │     ├─→ escalation-handler.js
  │     │     ├─→ notifications.js
  │     │     └─→ queue-service.js
  │     ├─→ ticket-handler.js
  │     ├─→ session-handler.js
  │     │     ├─→ container → prisma
  │     │     └─→ state-machine.js
  │     └─→ polling-handler.js
  │           └─→ container → prisma
  ├─→ routes/operators.js
  │     ├─→ container → prisma (lazy ✅)
  │     ├─→ security.js (JWT)
  │     └─→ notifications.js
  ├─→ routes/tickets.js
  │     └─→ container → prisma (lazy ✅)
  ├─→ routes/chat-management.js
  │     ├─→ container → prisma (lazy ✅)
  │     └─→ security.js (JWT)
  ├─→ routes/analytics.js
  │     └─→ container → prisma (lazy ✅)
  └─→ services/
        ├─→ timeout-service.js
        │     └─→ container → prisma (lazy ✅)
        ├─→ sla-service.js
        │     ├─→ container → prisma
        │     └─→ notifications.js
        ├─→ twilio-service.js
        │     └─→ container → prisma (lazy ✅)
        └─→ queue-service.js
              └─→ container → prisma
```

---

## 🌐 API ENDPOINTS MAP

### **Public Endpoints (No Auth)**

| Method | Endpoint | Funzione | Request Body | Response |
|--------|----------|----------|--------------|----------|
| POST | `/api/chat` | Send message to chatbot | `{message, sessionId?}` | `{reply, sessionId, status, smartActions[]}` |
| GET | `/api/chat/poll/:sessionId` | Poll for operator messages | - | `{messages[], hasOperator}` |
| POST | `/api/tickets` | Create support ticket | `{sessionId, subject, description, userEmail?, userPhone?}` | `{ticketId, ticketNumber}` |
| GET | `/api/tickets/:ticketNumber` | Get ticket status | - | `{ticketNumber, status, notes[]}` |
| GET | `/api/analytics/dashboard` | Dashboard stats | - | `{summary, recentActivity, chatStats[]}` |

### **Authenticated Endpoints (JWT Required)**

| Method | Endpoint | Funzione | Auth | Request Body |
|--------|----------|----------|------|--------------|
| POST | `/api/operators/login` | Operator login | ❌ | `{username, password}` |
| POST | `/api/operators/logout` | Operator logout | ✅ | `{operatorId}` |
| GET | `/api/operators/pending-chats` | Get pending chats | ❌ | - |
| POST | `/api/operators/take-chat` | Take chat assignment | ✅ | `{sessionId, operatorId}` |
| POST | `/api/operators/send-message` | Send operator message | ✅ | `{sessionId, operatorId, message}` |
| GET | `/api/operators/messages/:sessionId` | Get session messages | ✅ | - |
| POST | `/api/chat-management/update-status` | Update chat status | ✅ | `{sessionId, status, notes?}` |
| POST | `/api/chat-management/add-note` | Add internal note | ✅ | `{sessionId, content}` |
| GET | `/api/chat-management/history/:sessionId` | Get chat history | ✅ | - |
| GET | `/api/chat-management/active-chats` | Get active chats dashboard | ✅ | `?filter=assigned|unassigned|waiting` |
| POST | `/api/chat-management/create-ticket` | Create ticket from chat | ✅ | `{sessionId, subject, description, priority?}` |

---

## 🗄️ DATABASE SCHEMA (Prisma Models)

### **Core Models**

```prisma
ChatSession {
  id            String
  sessionId     String @unique    // Server-generated secure ID
  userIp        String?
  userAgent     String?
  startedAt     DateTime
  lastActivity  DateTime
  status        SessionStatus     // ACTIVE, WITH_OPERATOR, WAITING_CLIENT, etc.

  messages      Message[]
  operatorChats OperatorChat[]
  tickets       Ticket[]
}

Message {
  id          String
  sessionId   String
  sender      SenderType        // USER, BOT, OPERATOR, SYSTEM
  message     String
  metadata    Json?
  timestamp   DateTime

  session     ChatSession @relation
}

Operator {
  id            String
  username      String @unique
  email         String
  name          String
  passwordHash  String
  isActive      Boolean
  isOnline      Boolean
  lastSeen      DateTime?

  operatorChats OperatorChat[]
  tickets       Ticket[]
}

OperatorChat {
  id          String
  sessionId   String
  operatorId  String
  startedAt   DateTime
  endedAt     DateTime?
  rating      Int?
  notes       String?

  session     ChatSession @relation
  operator    Operator @relation
}

Ticket {
  id            String
  ticketNumber  String @unique    // Auto-generated
  sessionId     String?
  status        TicketStatus      // OPEN, IN_PROGRESS, RESOLVED
  priority      Priority          // LOW, MEDIUM, HIGH
  subject       String
  description   String
  userEmail     String?
  userPhone     String?
  contactMethod ContactMethod?    // EMAIL, PHONE, CHAT
  createdAt     DateTime
  resolvedAt    DateTime?
  operatorId    String?

  session       ChatSession? @relation
  assignedTo    Operator? @relation
  notes         TicketNote[]
}
```

### **Supporting Models**

```prisma
Analytics {
  id            String
  eventType     String            // chat_started, escalation_requested, etc.
  eventData     Json?
  sessionId     String?
  timestamp     DateTime
  responseTime  Int?
  intentDetected String?
  successful    Boolean?
}

QueueEntry {
  id                    String
  sessionId             String @unique
  priority              Priority
  status                QueueStatus   // WAITING, ASSIGNED, CANCELLED
  enteredAt             DateTime
  assignedAt            DateTime?
  assignedTo            String?
  estimatedWaitTime     Int?
  slaWarningNotified    Boolean
  slaViolationNotified  Boolean
}

SLARecord {
  id                  String
  entityId            String          // sessionId or ticketId
  entityType          String          // 'chat' or 'ticket'
  priority            Priority
  status              String          // ACTIVE, MET, VIOLATED
  createdAt           DateTime
  responseDeadline    DateTime
  resolutionDeadline  DateTime
  firstResponseAt     DateTime?
  resolvedAt          DateTime?
  violatedAt          DateTime?
  escalatedAt         DateTime?
}

InternalNote {
  id          String
  content     String
  sessionId   String
  operatorId  String
  createdAt   DateTime

  operator    Operator @relation
}
```

---

## 🔄 FLUSSI PRINCIPALI

### **1. Chat Flow (User → AI → Operator)**

```
USER sends message
  ↓
[POST /api/chat]
  ↓
security.validateChatMessage() → Sanitize input
  ↓
session-handler.getOrCreateSession()
  ↓
session-handler.saveUserMessage()
  ↓
Check: isWithOperator(session)?
  ├─ YES → Queue message for operator
  └─ NO  → Continue to AI
       ↓
       ai-handler.generateAIResponse()
         ↓
         knowledge.js (cached 5min)
         ↓
         OpenAI API (with retry logic)
         ↓
         Parse response for actions
         ↓
       Check: escalation requested?
         ├─ YES → escalation-handler.handleEscalation()
         │         ↓
         │         Check available operators
         │         ↓
         │         Create OperatorChat
         │         ↓
         │         notifications.notifyOperators() (WebSocket)
         │         ↓
         │         Return: "Operatore in arrivo..."
         │
         └─ NO → Check: ticket requested?
                   ├─ YES → ticket-handler.collectContactInfo()
                   └─ NO  → Return AI response
```

### **2. Operator Takeover Flow**

```
OPERATOR logs in
  ↓
[POST /api/operators/login] → Generate JWT token
  ↓
OPERATOR sees pending chats
  ↓
[GET /api/operators/pending-chats]
  ↓
OPERATOR takes chat
  ↓
[POST /api/operators/take-chat]
  ↓
Check: Chat already taken?
  ├─ YES (different operator) → Reject
  └─ NO → Create/Update OperatorChat
          ↓
          Update session status: WITH_OPERATOR
          ↓
          Save SYSTEM message: "Operatore X joined"
          ↓
          Return: {success: true}
```

### **3. Timeout & Cleanup Flow**

```
timeout-service.js (runs every 2 min)
  ↓
Find sessions: WITH_OPERATOR + inactive 10min
  ↓
For each inactive session:
  ├─→ Set status: WAITING_CLIENT
  ├─→ Save SYSTEM message
  └─→ Log analytics

Find sessions: ACTIVE + no operator + 30min inactive
  ↓
For each abandoned:
  ├─→ Set status: ENDED
  └─→ Log analytics: chat_abandoned
```

---

## 🔐 SECURITY LAYERS

### **Authentication & Authorization**

| Layer | Implementation | Files |
|-------|---------------|-------|
| **Operator Auth** | JWT tokens (24h expiry) | `middleware/security.js` |
| **Session Security** | Server-side crypto session IDs | `utils/security.js` |
| **Rate Limiting** | In-memory store (20 req/min) | `utils/security.js` |
| **Input Sanitization** | XSS protection, HTML strip | `utils/security.js` |
| **Password Hashing** | bcrypt (10 rounds) | `middleware/security.js` |

### **Security Checks**

```javascript
// Session ID Generation (utils/security.js)
generateSecureSessionId() → crypto.randomBytes(16) + SHA256 hash

// Input Validation (utils/security.js)
validateChatMessage(message) → {
  - Length check (1-2000 chars)
  - Suspicious patterns detection
  - HTML/script tag removal
  - SQL injection prevention
}

// JWT Verification (middleware/security.js)
authenticateToken(req, res, next) → {
  - Extract token from header
  - Verify with JWT_SECRET
  - Attach user to req.user
}
```

---

## ⚡ PERFORMANCE & CACHING

### **Caching Strategy**

| Resource | Cache Type | TTL | Invalidation |
|----------|-----------|-----|--------------|
| Knowledge Base | In-memory | 5 min | File watch + manual |
| Session Data | Database | - | On update |
| Operator Status | Database | - | WebSocket push |

### **Optimization Points**

1. **Knowledge Base** (`utils/knowledge.js`)
   - ✅ In-memory cache with 5min TTL
   - ✅ File watcher for auto-reload
   - ✅ Fallback to cached on error
   - **Improvement**: Add Redis cache for multi-instance

2. **Database Queries**
   - ✅ Prisma connection pooling
   - ✅ Lazy loading (container pattern)
   - ⚠️ Missing: Query result caching
   - ⚠️ Missing: Pagination on large result sets

3. **API Response Times**
   - ✅ Async/await patterns
   - ✅ Parallel DB queries (Promise.all)
   - ⚠️ Missing: Response compression (gzip)
   - ⚠️ Missing: CDN for static assets

---

## 🐛 KNOWN ISSUES & FIXES

### **✅ Fixed Issues**

| Issue | File | Fix | Commit |
|-------|------|-----|--------|
| Circular dependency (prisma) | `server.js`, `routes/*` | DI container | Initial |
| Top-level container.get() | `routes/operators.js`, etc. | Lazy loading | 65012b0 |
| Timeout service prisma error | `services/timeout-service.js` | Lazy loading | 7792d6c |

### **⚠️ Current Issues**

| Issue | File | Impact | Priority |
|-------|------|--------|----------|
| SLA schema mismatch | `services/sla-service.js` | Warning logs | Medium |
| Frontend connection error | Widget JS (lucine-minimal) | User-facing | **HIGH** |
| Missing CORS headers | `server.js` | Cross-origin requests | Medium |
| No pagination | `routes/analytics.js` | Performance | Low |

### **🔍 Potential Issues**

1. **WebSocket scaling**: Single operatorConnections Map won't work across multiple instances
2. **Session cleanup**: No automatic cleanup for old ENDED sessions
3. **File upload**: No support for image/file uploads in chat
4. **Error logging**: No centralized error tracking (Sentry, etc.)

---

## 🚀 DEPLOYMENT CHECKLIST

### **Environment Variables Required**

```env
# Database
DATABASE_URL=postgresql://...

# OpenAI
OPENAI_API_KEY=sk-...

# Security
JWT_SECRET=your-secret-key

# Admin
ADMIN_PASSWORD=secure-password

# Optional
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
NODE_ENV=production
PORT=3000
```

### **Service Health Checks**

| Service | Endpoint | Expected |
|---------|----------|----------|
| Backend | `GET /health` | 200 OK |
| Database | Prisma connection | Connected |
| OpenAI | API call | 200 OK |
| WebSocket | WS connection | Connected |

---

## 📈 METRICS & MONITORING

### **Key Metrics to Track**

1. **Chat Performance**
   - Average response time (AI)
   - Escalation rate (%)
   - Session completion rate

2. **Operator Performance**
   - Average handle time
   - Chats per operator
   - Customer satisfaction (ratings)

3. **System Health**
   - API response times
   - Database query times
   - Error rates
   - WebSocket connection count

### **Analytics Events**

```javascript
// Tracked in Analytics table
{
  chat_started,
  ai_response,
  escalation_requested,
  operator_joined,
  chat_timeout,
  chat_abandoned,
  ticket_created,
  ticket_created_from_chat
}
```

---

## 🎯 NEXT STEPS & IMPROVEMENTS

### **High Priority**

1. **Fix frontend widget** (lucine-minimal)
   - Update API endpoint URL
   - Fix CORS headers
   - Test WebSocket connection

2. **SLA Service Schema Fix**
   - Update schema or service logic
   - Remove warningThreshold field

3. **Add Response Compression**
   - Install compression middleware
   - Reduce payload sizes

### **Medium Priority**

4. **Redis Caching**
   - Cache knowledge base
   - Cache session data
   - Enable multi-instance scaling

5. **Centralized Logging**
   - Add Winston/Pino logger
   - Structured logging format
   - Log aggregation (Logtail, etc.)

6. **Monitoring Dashboard**
   - Real-time metrics
   - Error tracking
   - Performance graphs

### **Low Priority**

7. **File Upload Support**
8. **Advanced Analytics**
9. **A/B Testing Framework**
10. **Multi-language Support**

---

## 🔗 QUICK REFERENCE

### **Important File Locations**

```
📦 lucine-chatbot-render/
├── 🎯 server.js                    # Entry point
├── 📁 config/
│   ├── container.js                # DI container
│   └── constants.js                # All constants
├── 📁 routes/
│   ├── chat/                       # Chat routes (modular)
│   ├── operators.js                # Operator management
│   ├── tickets.js                  # Ticket system
│   ├── chat-management.js          # Chat admin
│   └── analytics.js                # Dashboard
├── 📁 services/
│   ├── timeout-service.js          # 10min timeout
│   ├── sla-service.js              # SLA monitoring
│   ├── queue-service.js            # Operator queue
│   └── twilio-service.js           # SMS (optional)
├── 📁 utils/
│   ├── knowledge.js                # KB cache
│   ├── security.js                 # Auth & sanitization
│   ├── state-machine.js            # State transitions
│   ├── error-handler.js            # Retry logic
│   └── notifications.js            # WebSocket
├── 📁 middleware/
│   ├── security.js                 # JWT auth
│   └── response-formatter.js       # API responses
└── 📁 prisma/
    └── schema.prisma               # Database schema
```

### **Common Commands**

```bash
# Development
npm run dev

# Deploy
git push origin main  # Auto-deploy to Render

# Database
npx prisma migrate dev
npx prisma studio

# Logs
# View on Render dashboard
```

---

*Last updated: 2025-10-01*
*Generated by: System Analysis*
