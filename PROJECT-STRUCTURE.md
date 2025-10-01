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
│   ├── operators.js    # Operator auth & messaging
│   ├── tickets.js      # Ticket management
│   └── analytics.js    # Analytics & stats
├── services/           # Business logic services
├── middleware/         # Security, auth, rate limiting
├── prisma/            # Database schema & migrations
├── public/dashboard/  # Operator dashboard (static)
├── scripts/           # Utility scripts (admin reset, etc)
├── data/              # Knowledge base JSON
└── server.js          # Main entry point
```

### **Key Files**
- `server.js` - Main application
- `prisma/schema.prisma` - Database schema
- `.env` - Environment variables (LOCAL ONLY - never commit)
- `package.json` - Dependencies

---

## 📂 REPOSITORY 2: FRONTEND WIDGET (SHOPIFY)

### **Location**
```
/Users/brnobtt/Desktop/lucine-minimal/
```

### **Git Remote**
```bash
cd /Users/brnobtt/Desktop/lucine-minimal
git remote -v
# origin  https://github.com/[shopify-theme-repo].git (o Shopify CLI)
```

### **Deployment**
- **Platform**: Shopify Theme
- **Deploy Method**: Git push → Shopify auto-sync
- **Live URL**: https://lucinedinatale.it/?chatbot=test

### **Struttura Cartelle**
```
lucine-minimal/
├── snippets/
│   └── chatbot-popup.liquid  # ⭐ WIDGET PRINCIPALE
├── layout/
│   └── theme.liquid          # Include widget snippet
├── assets/
│   ├── theme.js
│   └── theme.css
├── sections/
├── templates/
└── config/
```

### **Widget File**
```
/Users/brnobtt/Desktop/lucine-minimal/snippets/chatbot-popup.liquid
```

**Activation**: Widget si attiva solo con URL param `?chatbot=test`

---

## 📚 DOCUMENTAZIONE - QUALI FILE LEGGERE

### **Per capire il SISTEMA COMPLETO**
Leggi in QUESTO ORDINE:

1. **README.md** (lucine-chatbot-render)
   - Overview architettura
   - Stack tecnologico
   - Quick start guide
   - Production URLs

2. **SYSTEM-MAP.md** (lucine-chatbot-render)
   - Mappa completa API endpoints
   - Database schema dettagliato
   - Relazioni tra entità
   - Flussi operativi

3. **FRONTEND-BACKEND-FLOW.md** (lucine-chatbot-render)
   - Comunicazione widget ↔ backend
   - Analisi richieste/risposte
   - Debug flow completo
   - Session management

4. **WIDGET-FIXES-SUMMARY.md** (lucine-chatbot-render)
   - Changelog widget v2.8
   - Fix applicati
   - Problemi risolti

### **Per DEBUG e TROUBLESHOOTING**

- **DEBUG-JWT-TOKEN.md** - JWT 403 errors, token verification
- **COMPLETE-FIXES-REPORT.md** - Report finale 10/10 fix
- **ANALYSIS-SUMMARY.md** - Executive summary, metriche

### **File Tecnici Specifici**

- **prisma/schema.prisma** - Database schema completo
- **routes/chat/index.js** - Main chat logic
- **routes/chat/escalation-handler.js** - Escalation a operatori
- **middleware/security.js** - JWT auth, rate limiting
- **snippets/chatbot-popup.liquid** - Widget frontend

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
```

---

## 🚨 COSE IMPORTANTI DA SAPERE

### **NON lavoriamo in locale**
⚠️ **IMPORTANTE**: Questo progetto NON usa `localhost`
- Backend gira SOLO su Render
- Frontend gira SOLO su Shopify
- Database è SOLO su Render PostgreSQL

### **Session ID Server-Side**
- Widget invia `sessionId: null` alla prima richiesta
- Backend genera ID sicuro con crypto
- Widget salva ID dalla risposta backend

### **Polling Operatore**
- Polling ogni 3 secondi: `GET /api/chat/poll/{sessionId}`
- Widget traccia messaggi già mostrati con `Set()`
- Evita duplicati controllando `msg.id`

### **Escalation Flow**
1. AI non sa rispondere → Inietta pulsanti YES/NO automatici
2. User clicca YES → `sendMessage('request_operator')`
3. Backend check operatori online
4. Se disponibile → Connessione diretta
5. Se offline → Ticket form automatico

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

---

## 🔍 QUICK REFERENCE

### **Dove sono i file chiave?**

| Cosa | Dove |
|------|------|
| Widget chatbot | `/Users/brnobtt/Desktop/lucine-minimal/snippets/chatbot-popup.liquid` |
| Backend server | `/Users/brnobtt/Desktop/lucine-chatbot-render/server.js` |
| Chat logic | `/Users/brnobtt/Desktop/lucine-chatbot-render/routes/chat/` |
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
**Versione Sistema**: Backend 2.7 | Widget 2.9
