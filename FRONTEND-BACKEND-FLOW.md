# 🔄 FRONTEND-BACKEND FLOW ANALYSIS

## 📍 PROBLEMA ATTUALE

**Sintomo**: Widget mostra "Mi dispiace, c'è stato un problema di connessione"
**Location**: chatbot-popup.liquid:856
**Backend**: Funziona correttamente (test curl OK)

---

## 🎨 FRONTEND WIDGET ANALYSIS

### **File Location**
```
/Users/brnobtt/Desktop/lucine-minimal/snippets/chatbot-popup.liquid
```

### **Activation**
- Widget si attiva SOLO con URL param: `?chatbot=test`
- Check alla riga 692: `if (urlParams.get('chatbot') === 'test')`

### **Configuration**
```javascript
const BACKEND_URL = 'https://lucine-chatbot.onrender.com/api/chat'; // ✅ CORRETTO
let sessionId = generateSessionId(); // ❌ CLIENT-SIDE (deprecated)
```

### **Session ID Generation (Client-Side - OLD)**
```javascript
// Riga 998-1000
function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
```
**⚠️ PROBLEMA**: Il widget genera session ID lato client, ma il backend ora genera session ID server-side con crypto!

---

## 🔄 CHAT FLOW COMPLETO

### **1. User Opens Chat**
```
User visits: https://lucinedinatale.it/?chatbot=test
  ↓
Widget loads (chatbot-popup.liquid)
  ↓
DOMContentLoaded event
  ↓
Check URL param: chatbot=test?
  ├─ NO  → Widget hidden
  └─ YES → initializeChatbot()
           ↓
           Generate client-side sessionId ❌
           ↓
           Show welcome messages
```

### **2. User Sends First Message**
```
User types message → clicks send
  ↓
Widget: sendMessage() function (line 778)
  ↓
Check: isOperatorMode?
  ├─ YES → sendToOperator() (line 1074)
  └─ NO  → Continue
           ↓
[FETCH REQUEST]
POST https://lucine-chatbot.onrender.com/api/chat
Headers: {
  'Content-Type': 'application/json',
  'X-Session-ID': sessionId  ← Client-generated ID ❌
}
Body: {
  message: "user message",
  sessionId: sessionId  ← Client-generated ID ❌
}
```

### **3. Backend Processing**
```
Backend: routes/chat/index.js
  ↓
Extract: message, sessionId from body
  ↓
Check sessionId validity
  ├─ Invalid/Missing → Generate new server-side ID ✅
  └─ Valid → Use existing
           ↓
Rate limiting check (utils/security.js)
  ↓
Validate & sanitize message
  ↓
session-handler.getOrCreateSession()
  ├─ Session exists? Use it
  └─ No session → Create new (Prisma)
           ↓
Save user message
  ↓
Check: isWithOperator(session)?
  ├─ YES → Queue for operator
  └─ NO  → ai-handler.generateAIResponse()
                ↓
                Load knowledge base (cached)
                ↓
                Call OpenAI (with retry)
                ↓
                Parse response
                ↓
[RESPONSE]
{
  reply: "AI response",
  sessionId: "session-1759...", ← Server-generated ✅
  status: "active",
  smartActions: [...]
}
```

### **4. Widget Receives Response**
```
Widget: await fetch() resolves (line 820)
  ↓
const data = await response.json()
  ↓
Check: data.error?
  ├─ YES → throw Error ❌ TRIGGER LINE 856
  └─ NO  → Continue
           ↓
Update sessionId from response
  ↓
Check status:
  ├─ 'connecting_operator' → Start operator mode
  ├─ 'ticket_request' → Show ticket form
  └─ 'active' → Display reply + smartActions
```

---

## 🐛 ERROR SOURCES

### **Possible Error #1: CORS**
```javascript
// Widget line 808
const response = await fetch(BACKEND_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId  ← Custom header
  },
  ...
});
```

**Issue**: Custom header `X-Session-ID` triggers CORS preflight
**Backend**: Missing CORS headers for preflight OPTIONS request

**Check**: `server.js` CORS configuration

### **Possible Error #2: Network/Timeout**
```javascript
// Widget line 855-857
} catch (error) {
  addMessage('Mi dispiace, c\'è stato un problema di connessione...', 'bot');
  console.error('Chat Error:', error);
}
```

**Causes**:
- Network timeout (no timeout set in fetch)
- DNS resolution failure
- SSL/TLS certificate issue
- Render service cold start (takes 30s+)

### **Possible Error #3: Response Format**
```javascript
// Widget expects:
{
  reply: "...",
  sessionId: "...",
  status: "...",
  smartActions: [...]
}

// But might receive:
{
  error: "Some error message"  ← Triggers line 823
}
```

---

## 🔍 BACKEND SERVER.JS ANALYSIS

### **Current CORS Setup**
```javascript
// Needs verification in server.js
app.use(cors({
  origin: '*',  // Or specific origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'], // ← Must include custom header!
  credentials: true
}));
```

### **Response Format (utils/api-response.js)**
```javascript
// Success response
res.success = function(data, message) {
  return this.json({
    ...data,
    message: message
  });
};

// Error response
res.error = function(message, errorCode, statusCode) {
  return this.status(statusCode).json({
    error: message,
    errorCode: errorCode
  });
};
```

**✅ Backend returns correct format on success**
**⚠️ Backend returns `{error: "..."}` on error → Widget catches it correctly**

---

## 🛠️ FIXES NEEDED

### **Fix #1: Add CORS Headers (server.js)**
```javascript
import cors from 'cors';

app.use(cors({
  origin: [
    'https://lucinedinatale.it',
    'https://www.lucinedinatale.it',
    'http://localhost:3000' // for testing
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight explicitly
app.options('*', cors());
```

### **Fix #2: Add Fetch Timeout (Widget)**
```javascript
// Widget line 808 - Add timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

try {
  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId
    },
    body: JSON.stringify({
      message: message,
      sessionId: sessionId
    }),
    signal: controller.signal  // ← Add abort signal
  });

  clearTimeout(timeoutId);

  // ... rest of code
} catch (error) {
  clearTimeout(timeoutId);

  if (error.name === 'AbortError') {
    addMessage('⏱️ Timeout: il server non risponde. Riprova tra qualche secondo.', 'bot');
  } else {
    addMessage('Mi dispiace, c\'è stato un problema di connessione...', 'bot');
  }
  console.error('Chat Error:', error);
}
```

### **Fix #3: Session ID Sync (Widget)**
```javascript
// Widget line 713-714 - Don't generate client-side ID initially
const BACKEND_URL = 'https://lucine-chatbot.onrender.com/api/chat';
let sessionId = null; // ← Start as null, backend will generate

// Widget line 816 - Send null on first message
body: JSON.stringify({
  message: message,
  sessionId: sessionId || null  // ← Send null if not set
})

// Backend will generate secure ID and return it
```

### **Fix #4: Better Error Logging (Widget)**
```javascript
} catch (error) {
  // Log more details
  console.error('Chat Error:', {
    message: error.message,
    name: error.name,
    stack: error.stack,
    sessionId: sessionId,
    backendUrl: BACKEND_URL
  });

  // User-friendly message based on error type
  if (error.name === 'AbortError') {
    addMessage('⏱️ Il server sta impiegando troppo tempo. Riprova.', 'bot');
  } else if (error.message.includes('fetch')) {
    addMessage('🌐 Problema di connessione. Controlla la tua connessione internet.', 'bot');
  } else {
    addMessage('Mi dispiace, c\'è stato un problema. Contatta info@lucinedinatale.it', 'bot');
  }
}
```

---

## 🧪 TESTING CHECKLIST

### **1. Test CORS**
```bash
# From browser console on lucinedinatale.it
fetch('https://lucine-chatbot.onrender.com/api/chat', {
  method: 'OPTIONS',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': 'test123'
  }
}).then(r => console.log('CORS OK', r.headers));
```

### **2. Test Backend Response**
```bash
# Test from terminal (works ✅)
curl -X POST https://lucine-chatbot.onrender.com/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Test"}' -v

# Expected: 200 OK with JSON response
```

### **3. Test Frontend Widget**
```javascript
// Browser console on https://lucinedinatale.it/?chatbot=test
// Check:
console.log('Session ID:', sessionId);
console.log('Backend URL:', BACKEND_URL);

// Send test message and watch network tab
```

### **4. Test Network Tab**
- Open DevTools → Network
- Filter: XHR/Fetch
- Send message
- Check:
  - Request headers (CORS)
  - Response status (200/4xx/5xx)
  - Response body (JSON format)
  - Timing (Cold start? >30s?)

---

## 📊 ENDPOINT MAPPING

### **Chat Endpoints (Public)**

| Endpoint | Method | Widget Line | Purpose | Response |
|----------|--------|-------------|---------|----------|
| `/api/chat` | POST | 808 | Send user message | `{reply, sessionId, status, smartActions}` |
| `/api/chat/poll/:sessionId` | GET | 1033 | Poll operator messages | `{messages[], hasOperator, sessionStatus}` |

### **Operator Endpoints (Widget Uses)**

| Endpoint | Method | Widget Line | Purpose | Response |
|----------|--------|-------------|---------|----------|
| `/api/operators/send` | POST | 1076 | Send to operator (WRONG!) | Not implemented ❌ |

**⚠️ ERROR**: Widget line 1076 calls `/api/operators/send` which doesn't exist!
**Should be**: `/api/operators/send-message` (requires JWT auth)

### **Ticket Endpoints**

| Endpoint | Method | Widget Line | Purpose | Response |
|----------|--------|-------------|---------|----------|
| `/api/tickets/create` | POST | 1118 | Create ticket (WRONG!) | Not implemented ❌ |

**⚠️ ERROR**: Widget line 1118 calls `/api/tickets/create` which doesn't exist!
**Should be**: `/api/tickets` (POST) or `/api/tickets/from-chat`

---

## 🔴 CRITICAL ISSUES FOUND

### **Issue 1: Missing CORS Headers**
**Impact**: HIGH
**Symptom**: Fetch fails on cross-origin request
**Fix**: Add proper CORS middleware in server.js

### **Issue 2: Wrong Operator Endpoint**
**Impact**: MEDIUM
**Location**: Widget line 1076
**Current**: `POST /api/operators/send`
**Correct**: `POST /api/operators/send-message` + JWT token
**Problem**: Unauthenticated users can't send to operators directly

### **Issue 3: Wrong Ticket Endpoint**
**Impact**: MEDIUM
**Location**: Widget line 1118
**Current**: `POST /api/tickets/create`
**Correct**: `POST /api/tickets` or `POST /api/tickets/from-chat`

### **Issue 4: No Timeout on Fetch**
**Impact**: LOW
**Symptom**: Widget hangs on slow/failed requests
**Fix**: Add AbortController with 10s timeout

### **Issue 5: Client Session ID Mismatch**
**Impact**: LOW
**Details**: Widget generates client-side ID, backend generates server-side
**Fix**: Start with `null`, let backend generate and return ID

---

## 🚀 IMMEDIATE ACTION PLAN

### **Priority 1: Fix CORS (Backend)**
```bash
# Check if cors package is installed
npm list cors

# If not installed:
npm install cors

# Update server.js with proper CORS config
```

### **Priority 2: Fix Operator Endpoint (Widget)**
```javascript
// Widget line 1074-1103
// REMOVE sendToOperator() function
// Instead, user messages in operator mode should go to /api/chat
// Backend will route them to the operator
```

### **Priority 3: Fix Ticket Endpoint (Widget)**
```javascript
// Widget line 1118
// Change URL from:
fetch('https://lucine-chatbot.onrender.com/api/tickets/create', ...)
// To:
fetch('https://lucine-chatbot.onrender.com/api/tickets', ...)
```

### **Priority 4: Add Error Handling (Widget)**
```javascript
// Add timeout
// Add better error messages
// Add retry logic
```

---

## 📈 PERFORMANCE OPTIMIZATIONS

### **Current Issues**
1. **Cold Start**: Render free tier sleeps after 15min inactivity → 30s+ startup
2. **No Request Caching**: Every chat request hits DB and OpenAI
3. **No CDN**: Widget served from Shopify (OK), but API has latency

### **Solutions**
1. **Keep-Alive Ping**: Ping backend every 10min to prevent sleep
2. **Redis Cache**: Cache frequent questions (knowledge base queries)
3. **CDN**: Use Cloudflare in front of Render
4. **Connection Pooling**: Optimize Prisma connection pool

---

## 🔗 FRONTEND WIDGET IMPROVEMENTS

### **Enhancement 1: Retry Logic**
```javascript
async function sendMessageWithRetry(message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(BACKEND_URL, {...});
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}
```

### **Enhancement 2: Loading State**
```javascript
function showConnecting() {
  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'chat-message bot loading';
  loadingMsg.innerHTML = '<div class="message-bubble">🔄 Connessione al server...</div>';
  messagesContainer.appendChild(loadingMsg);
}
```

### **Enhancement 3: Offline Detection**
```javascript
if (!navigator.onLine) {
  addMessage('📵 Sei offline. Controlla la connessione internet.', 'bot');
  return;
}
```

---

## 🎯 NEXT STEPS

1. ✅ **Create SYSTEM-MAP.md** (Done)
2. ✅ **Create FRONTEND-BACKEND-FLOW.md** (This file)
3. 🔧 **Fix CORS in server.js**
4. 🔧 **Fix widget endpoints**
5. 🧪 **Test on production**
6. 📝 **Update documentation**

---

*Last updated: 2025-10-01*
*Analysis by: System Debugging*
