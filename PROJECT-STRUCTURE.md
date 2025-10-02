# 📁 PROJECT STRUCTURE - Lucine Chatbot System

## 🎯 Overview

Questo progetto è composto da **DUE repository separati**:

1. **Backend** - Node.js/Express (lucine-chatbot-render)
2. **Frontend Widget** - Shopify Theme (lucine-minimal)

---

## 📂 REPOSITORY 1: BACKEND

### **Location**
```
/Users/brnobtt/Desktop/lucine-chatbot-render/
```

### **Git Remote**
```bash
git remote -v
# origin  https://github.com/mujians/lucine-chatbot-render.git
```

### **Deployment**
- **Platform**: Render.com
- **Auto-deploy**: Git push su `main` → Deploy automatico
- **Database**: PostgreSQL (Render managed)
- **URL Production**: https://lucine-chatbot.onrender.com

### **Struttura Cartelle**
```
lucine-chatbot-render/
├── routes/              # API endpoints
│   ├── chat/           # Chat logic (modularized)
│   │   ├── index.js           # Main router
│   │   ├── ai-handler.js      # OpenAI integration
│   │   ├── escalation-handler.js  # Queue + SLA integration
│   │   ├── ticket-handler.js  # Ticket creation
│   │   ├── session-handler.js # Session management
│   │   └── polling-handler.js # Operator message polling
│   ├── operators.js    # Operator auth, messaging, auto-assign
│   ├── users.js        # 👑 User management (ADMIN only)
│   ├── tickets.js      # Ticket management
│   ├── chat-management.js  # Chat states & notes
│   └── analytics.js    # Analytics & stats
├── services/           # Business logic services
│   ├── queue-service.js      # Dynamic priority queue
│   ├── sla-service.js        # SLA monitoring & tracking
│   ├── timeout-service.js    # 10min inactivity handler
│   └── health-service.js     # System health checks
├── middleware/         # Security, auth, rate limiting
│   ├── security.js           # JWT auth, rate limiting
│   └── check-admin.js        # 👑 Admin-only middleware
├── utils/              # Helper functions
│   ├── knowledge.js          # Knowledge base (cached)
│   ├── notifications.js      # WebSocket notifications
│   └── security.js           # Input sanitization
├── config/             # Configuration
│   └── container.js          # Dependency injection
├── prisma/            # Database schema & migrations
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Migration history
├── public/dashboard/  # Operator dashboard (static)
│   ├── index.html            # Main dashboard
│   ├── users.html            # 👑 User management UI
│   ├── css/
│   └── js/
├── scripts/           # Utility scripts
├── data/              # Knowledge base JSON
└── server.js          # Main entry point + WebSocket
```

### **Key Features**
- ✅ **WebSocket Real-time**: Bidirectional operator-user communication
- ✅ **Dynamic Priority Queue**: Based on wait time (0-5min=LOW, 5-15min=MEDIUM, 15+min=HIGH)
- ✅ **SLA Tracking**: First response + resolution deadlines
- ✅ **User Management**: Role-based access (ADMIN, OPERATOR)
- ✅ **Auto-assignment**: Queue-based operator assignment
- ✅ **Server-side Sessions**: Crypto-secure session IDs

---

## 📂 REPOSITORY 2: FRONTEND WIDGET (SHOPIFY)

### **Location**
```
/Users/brnobtt/Desktop/lucine-minimal/
```

### **Deployment**
- **Platform**: Shopify Theme
- **Live URL**: https://lucinedinatale.it/?chatbot=test

### **Struttura Cartelle**
```
lucine-minimal/
├── snippets/
│   └── chatbot-popup.liquid  # ⭐ WIDGET v3.0 (WebSocket enabled)
├── layout/
│   └── theme.liquid          # Include widget snippet
├── assets/
│   ├── theme.js
│   └── theme.css
└── ...
```

### **Widget File**
```
/Users/brnobtt/Desktop/lucine-minimal/snippets/chatbot-popup.liquid
```

**Activation**: Widget si attiva solo con URL param `?chatbot=test`

**Key Features (v3.0)**:
- ✅ WebSocket connection for instant messages
- ✅ Auto-reconnect with exponential backoff
- ✅ Queue position updates
- ✅ Polling fallback when WebSocket unavailable

---

## 📚 DOCUMENTAZIONE

### **File Principali**
Leggi in QUESTO ORDINE:

1. **README.md**
   - Overview architettura
   - Stack tecnologico
   - Quick start guide
   - Production URLs

2. **SYSTEM-MAP.md**
   - Mappa completa API endpoints
   - Database schema dettagliato
   - Relazioni tra entità
   - Flussi operativi

3. **FRONTEND-BACKEND-FLOW.md**
   - Comunicazione widget ↔ backend
   - WebSocket flow
   - Polling fallback
   - Session management

4. **PROJECT-STRUCTURE.md** (questo file)
   - Struttura repository
   - File locations
   - Workflow sviluppo

---

## 🔄 WORKFLOW DI SVILUPPO

### **Backend Changes**
```bash
cd /Users/brnobtt/Desktop/lucine-chatbot-render

# 1. Modify code
# 2. Test locally (optional)
npm run dev

# 3. Commit & push
git add .
git commit -m "feat: description"
git push origin main

# 4. Render auto-deploys (2-3 min)
# 5. Check logs on Render dashboard
```

### **Widget Changes**
```bash
cd /Users/brnobtt/Desktop/lucine-minimal

# 1. Modify chatbot-popup.liquid
# 2. Commit & push
git add snippets/chatbot-popup.liquid
git commit -m "fix: widget description"
git push origin main

# 3. Shopify auto-syncs theme
# 4. Test on: https://lucinedinatale.it/?chatbot=test
```

### **Database Changes**
```bash
cd /Users/brnobtt/Desktop/lucine-chatbot-render

# 1. Edit prisma/schema.prisma
# 2. Create migration (dev only)
npx prisma migrate dev --name migration_name

# 3. For production (Render shell)
psql $DATABASE_URL -c "SQL COMMANDS HERE"

# Example: Add role field
psql $DATABASE_URL -c "ALTER TABLE \"Operator\" ADD COLUMN IF NOT EXISTS \"role\" TEXT NOT NULL DEFAULT 'OPERATOR';"
```

---

## 🔑 ENVIRONMENT VARIABLES

### **Backend (Render)**
```bash
DATABASE_URL=postgresql://...       # PostgreSQL connection
OPENAI_API_KEY=sk-...              # OpenAI API key
JWT_SECRET=...                     # JWT signing secret
ADMIN_PASSWORD=lucine2025admin     # Admin default password
NODE_ENV=production                # Environment
PORT=3000                          # Server port
```

**Dove impostare**: Render Dashboard → Environment Variables

### **Widget (Shopify)**
Nessuna env var - tutto hardcoded nel file `.liquid`:
```javascript
const BACKEND_URL = 'https://lucine-chatbot.onrender.com/api/chat';
const WS_URL = 'wss://lucine-chatbot.onrender.com';
```

---

## 🚨 COSE IMPORTANTI DA SAPERE

### **Session ID Server-Side**
- Widget invia `sessionId: null` alla prima richiesta
- Backend genera ID sicuro con crypto
- Widget salva ID dalla risposta backend

### **WebSocket Real-time**
- wss://lucine-chatbot.onrender.com
- Autenticazione con `widget_auth` per utenti
- Autenticazione con `operator_auth` per operatori
- Auto-reconnect con exponential backoff (max 30s)

### **Dynamic Priority Queue**
- Priorità calcolata in base a tempo di attesa:
  - 0-5 min → LOW priority (2min wait estimate)
  - 5-15 min → MEDIUM priority (3min wait estimate)
  - 15+ min → HIGH priority (5min wait estimate)
- Auto-assignment quando operatore disponibile

### **Escalation Flow**
1. AI non sa rispondere → Inietta pulsanti YES/NO automatici
2. User clicca YES → `sendMessage('request_operator')`
3. Backend verifica operatori disponibili
4. Se nessun operatore → Aggiungi a coda + crea SLA record
5. Quando operatore diventa disponibile → Auto-assignment
6. Notifica real-time tramite WebSocket

### **User Management (ADMIN only)**
- Solo utenti con role='ADMIN' possono:
  - Creare nuovi operatori
  - Modificare avatar e displayName
  - Disattivare operatori
- Accesso: https://lucine-chatbot.onrender.com/dashboard/users.html

---

## 🗂️ FILE DA NON TOCCARE

### **Backend**
- `node_modules/` - Dependencies (mai committare)
- `.env` - Secrets locali (mai committare)
- `prisma/migrations/` - Già applicate in production

### **Widget**
- File non relativi al chatbot nel tema Shopify
- Solo modificare: `snippets/chatbot-popup.liquid`

---

## 📞 CONTATTI E SUPPORTO

### **Credenziali Admin**
- **Username**: `admin`
- **Password**: (vedi `ADMIN_PASSWORD` su Render)
- **Dashboard**: https://lucine-chatbot.onrender.com/dashboard

### **Repository**
- Backend: https://github.com/mujians/lucine-chatbot-render
- Widget: (Shopify theme repo)

### **Production URLs**
- Backend API: https://lucine-chatbot.onrender.com
- Widget Live: https://lucinedinatale.it/?chatbot=test
- Dashboard: https://lucine-chatbot.onrender.com/dashboard
- User Management: https://lucine-chatbot.onrender.com/dashboard/users.html

---

## 🔍 QUICK REFERENCE

### **Dove sono i file chiave?**

| Cosa | Dove |
|------|------|
| Widget chatbot | `/Users/brnobtt/Desktop/lucine-minimal/snippets/chatbot-popup.liquid` |
| Backend server | `/Users/brnobtt/Desktop/lucine-chatbot-render/server.js` |
| Chat logic | `/Users/brnobtt/Desktop/lucine-chatbot-render/routes/chat/` |
| User management | `/Users/brnobtt/Desktop/lucine-chatbot-render/routes/users.js` |
| Database schema | `/Users/brnobtt/Desktop/lucine-chatbot-render/prisma/schema.prisma` |
| Operator dashboard | `/Users/brnobtt/Desktop/lucine-chatbot-render/public/dashboard/` |
| Documentazione | `/Users/brnobtt/Desktop/lucine-chatbot-render/*.md` |

### **Deploy rapido**

```bash
# Backend
cd ~/Desktop/lucine-chatbot-render && git add . && git commit -m "fix: ..." && git push

# Widget
cd ~/Desktop/lucine-minimal && git add . && git commit -m "fix: ..." && git push
```

---

**Last Updated**: 2025-10-01
**Versione Sistema**: Backend 3.0 | Widget 3.0
**Features**: WebSocket, Dynamic Queue, SLA Tracking, User Management
