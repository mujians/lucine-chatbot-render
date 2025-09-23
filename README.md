# Lucine Chatbot - Render + PostgreSQL

Sistema chatbot professionale con database persistente per Lucine di Natale.

## 🚀 Features

- ✅ **Database PostgreSQL** per storico completo
- ✅ **Chat persistenti** (nessuna perdita sessioni)
- ✅ **Ticket system** integrato
- ✅ **Dashboard operatori** real-time
- ✅ **Analytics dettagliate**
- ✅ **Knowledge base** gestibile
- ✅ **No cold starts** (con piano Starter)

## 📦 Stack Tecnologico

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Prisma ORM)
- **AI**: OpenAI GPT-3.5
- **Hosting**: Render.com
- **Frontend**: Shopify (esistente)

## 🛠️ Setup Locale

```bash
# 1. Installa dipendenze
npm install

# 2. Copia e configura .env
cp .env.example .env
# Edita .env con le tue chiavi

# 3. Setup database
npx prisma migrate dev
npx prisma db seed

# 4. Avvia in development
npm run dev
```

## 🚢 Deploy su Render

### Metodo 1: Deploy Automatico (Raccomandato)

1. **Fork questo repo** su GitHub
2. **Vai su Render.com** e crea account
3. **Clicca "New +"** → "Blueprint"
4. **Connetti GitHub** e seleziona il repo
5. **Render rileverà `render.yaml`** e creerà automaticamente:
   - Web Service (Node.js)
   - PostgreSQL Database
6. **Aggiungi le environment variables**:
   - `OPENAI_API_KEY`: La tua chiave OpenAI
   - `ADMIN_PASSWORD`: Password per admin endpoints

### Metodo 2: Deploy Manuale

1. **Crea PostgreSQL Database**:
   - New → PostgreSQL
   - Name: `lucine-db`
   - Region: Frankfurt (EU)
   - Copia `Internal Database URL`

2. **Crea Web Service**:
   - New → Web Service
   - Connect GitHub repo
   - Runtime: Node
   - Build: `npm install && npx prisma generate`
   - Start: `npm start`
   - Add environment variables

3. **Run Migrations**:
   ```bash
   # In Render Shell o locally con DATABASE_URL
   npx prisma migrate deploy
   ```

## 🔧 Configurazione

### Environment Variables Richieste

- `DATABASE_URL`: Fornito automaticamente da Render
- `OPENAI_API_KEY`: Chiave API OpenAI
- `SESSION_SECRET`: Generato automaticamente
- `CORS_ORIGIN`: `https://lucinedinatale.it`
- `ADMIN_PASSWORD`: Password admin dashboard

### Database Schema

Il database include:
- `ChatSession`: Sessioni utente
- `Message`: Tutti i messaggi
- `Ticket`: Sistema ticket supporto
- `Operator`: Gestione operatori
- `Analytics`: Tracking eventi
- `KnowledgeItem`: FAQ dinamiche

## 📊 Endpoints API

### Chat
- `POST /api/chat` - Messaggio principale
- `GET /api/chat/history/:sessionId` - Storico chat

### Tickets
- `POST /api/tickets` - Crea ticket
- `GET /api/tickets/:ticketNumber` - Status ticket
- `GET /api/tickets` - Lista ticket (admin)

### Operators
- `GET /api/operators/status` - Operatori online
- `POST /api/operators/login` - Login operatore
- `POST /api/operators/take-chat` - Prendi chat
- `POST /api/operators/send-message` - Invia messaggio

### Analytics
- `GET /api/analytics/dashboard` - Stats dashboard
- `GET /api/analytics/hourly` - Stats orarie
- `GET /api/analytics/conversions` - Conversioni

### Admin
- `GET /api/admin/stats?password=XXX` - Database stats
- `POST /api/admin/cleanup?password=XXX` - Pulizia dati
- `POST /api/admin/knowledge?password=XXX` - Aggiorna KB

## 🎯 Testing

```bash
# Test chat endpoint
curl -X POST https://YOUR-APP.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Ciao", "sessionId": "test-123"}'

# Check health
curl https://YOUR-APP.onrender.com/health
```

## 💰 Costi

### Piano Free
- ✅ 750 ore/mese
- ✅ PostgreSQL 1GB
- ⚠️ Spegnimento dopo 15 min inattività
- ⚠️ Cold start ~30 secondi

### Piano Starter ($7/mese)
- ✅ Sempre attivo 24/7
- ✅ No cold starts
- ✅ 100GB bandwidth
- ✅ PostgreSQL incluso
- ✅ Perfetto per produzione

## 🔄 Migrazione da Vercel

1. **Aggiorna frontend** (Shopify theme):
   ```javascript
   // Da:
   const BACKEND_URL = 'https://xxx.vercel.app/api/chat';
   
   // A:
   const BACKEND_URL = 'https://YOUR-APP.onrender.com/api/chat';
   ```

2. **Importa dati esistenti** (opzionale):
   ```bash
   # Export da Vercel/logs
   # Import con script prisma/seed.js
   ```

## 📈 Monitoraggio

Render fornisce:
- Logs in real-time
- Metriche performance
- Alert automatici
- Status page

Dashboard interna:
- `/dashboard` - Operator dashboard
- `/api/analytics/dashboard` - Stats JSON

## 🆘 Troubleshooting

### Database connection issues
```bash
# Test connessione
npx prisma db pull

# Reset database
npx prisma migrate reset
```

### Slow performance
- Upgrade a Starter plan
- Aggiungi indices nel schema
- Implementa caching Redis

### CORS errors
- Verifica `CORS_ORIGIN` env var
- Check Shopify domain

## 📝 License

MIT