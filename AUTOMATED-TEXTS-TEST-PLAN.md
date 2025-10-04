# 🧪 AUTOMATED TEXTS - TEST PLAN COMPLETO

## 📋 Lista Completa Testi (19 totali)

### 1️⃣ CATEGORIA: OPERATOR (2 testi)

#### `operator_greeting` - Saluto Operatore
**Testo**: "Ciao! Un attimo che controllo la conversazione e vedo come posso aiutarti.\nIntanto, fammi sapere se hai altre esigenze specifiche 😊"

**Quando appare**: Automaticamente quando operatore prende controllo chat

**Schema Logico**:
```
User richiede operatore → Operatore clicca "Prendi chat" →
Backend: routes/operators.js:take-chat →
Crea messaggio automatico con operator_greeting →
Widget riceve via WebSocket/polling
```

**Test**:
- [ ] 1. Utente scrive "voglio parlare con operatore"
- [ ] 2. Dashboard mostra chat in pending
- [ ] 3. Operatore clicca "Prendi chat"
- [ ] 4. Widget mostra saluto operatore automaticamente
- [ ] 5. Verificare testo esatto nel widget

---

#### `operator_connected` - Operatore Connesso
**Testo**: "Perfetto! Ti sto connettendo con un operatore...\n\n⏱️ {operatorName} ti risponderà a breve. Attendi un momento."

**Quando appare**: Quando operatore viene trovato e assegnato dalla coda

**Schema Logico**:
```
User in coda WAITING_OPERATOR → Operatore va online/disponibile →
QueueService assegna automaticamente →
Backend invia operator_connected con {operatorName} →
Widget mostra messaggio con nome operatore
```

**Test**:
- [ ] 1. Utente richiede operatore (nessuno online)
- [ ] 2. Utente vede "in coda" o "nessun operatore"
- [ ] 3. Operatore fa login
- [ ] 4. Widget mostra "Perfetto! Ti sto connettendo con un operatore... ⏱️ Lucy ti risponderà a breve"
- [ ] 5. Verificare interpolazione {operatorName}

---

### 2️⃣ CATEGORIA: QUEUE (4 testi)

#### `queue_no_operators` - Nessun Operatore Online
**Testo**: "⏰ Non ci sono operatori disponibili al momento\n\n💡 Puoi aprire un ticket o continuare con l'assistente AI"

**Quando appare**: Quando utente richiede operatore ma nessuno online

**Schema Logico**:
```
User: "voglio operatore" → Backend controlla operatori online →
count === 0 → Invia queue_no_operators con smartActions →
Widget mostra messaggio + 2 pulsanti (Ticket / Continua AI)
```

**Test**:
- [ ] 1. Assicurarsi nessun operatore online
- [ ] 2. Utente scrive "voglio parlare con operatore"
- [ ] 3. Widget mostra "Non ci sono operatori disponibili"
- [ ] 4. Verificare presenza pulsanti "Apri ticket" e "Continua con AI"
- [ ] 5. Cliccare "Continua con AI" → torna a modalità AI

---

#### `queue_all_busy` - Operatori Occupati
**Testo**: "⏰ **Al momento tutti gli operatori sono impegnati.**\n\n{waitMessage}\n\nPuoi attendere in linea oppure lasciare un ticket per essere ricontattato."

**Quando appare**: Tutti operatori online ma occupati con altre chat

**Schema Logico**:
```
User: "voglio operatore" → Backend conta operatori disponibili →
online > 0 MA tutti busy → Calcola waitMessage (posizione coda) →
Invia queue_all_busy con {waitMessage} interpolato →
Widget mostra posizione in coda + opzioni
```

**Test**:
- [ ] 1. Operatore online e già in chat con altro utente
- [ ] 2. Nuovo utente scrive "operatore"
- [ ] 3. Widget mostra "tutti gli operatori sono impegnati"
- [ ] 4. Verificare {waitMessage} mostra posizione coda
- [ ] 5. Verificare pulsanti ticket/attendi

---

#### `operator_no_online` - Nessun Operatore Online (Escalation)
**Testo**: Stesso di `queue_no_operators`

**Quando appare**: Durante escalation automatica da AI quando nessun operatore

**Test**: Uguale a queue_no_operators

---

#### `operator_all_busy` - Operatori Tutti Occupati (Escalation)
**Testo**: Stesso di `queue_all_busy`

**Quando appare**: Durante escalation automatica quando tutti occupati

**Test**: Uguale a queue_all_busy

---

### 3️⃣ CATEGORIA: TICKET (8 testi)

#### `ticket_start` - Inizio Creazione Ticket
**Testo**: "🎫 **Perfetto! Creiamo un ticket di supporto.**\n\nUn operatore ti ricontatterà appena disponibile per riprendere la conversazione.\n\n👤 **Per iniziare, come ti chiami?**\n\n💡 _Scrivi \"annulla\" in qualsiasi momento per tornare alla chat_"

**Quando appare**: Utente clicca "Apri ticket" o scrive trigger words

**Schema Logico**:
```
User clicca pulsante "Apri ticket" O scrive "apri ticket" →
Backend: routes/chat/index.js verifica trigger →
Cambia status a REQUESTING_TICKET →
Invia ticket_start →
Widget mostra e aspetta nome
```

**Test**:
- [ ] 1. Utente scrive "voglio aprire ticket"
- [ ] 2. Widget mostra messaggio ticket_start
- [ ] 3. Verificare richiesta nome
- [ ] 4. Verificare hint "annulla"

---

#### `ticket_ask_name` - Richiesta Nome
**Testo**: "👤 **Come ti chiami?**\n\nInserisci il tuo nome per proseguire."

**Quando appare**: Step 1 del flusso ticket (raramente usato standalone)

**Test**: Incluso in ticket_start

---

#### `ticket_ask_contact` - Richiesta Contatto
**Testo**: "Piacere di conoscerti, **{name}**! 👋\n\n📧 **Come preferisci essere contattato?**\n\nInviami:\n• La tua **email** (es: mario.rossi@gmail.com)\n• Oppure il tuo numero **WhatsApp** (es: +39 333 123 4567)\n\n💡 _Scrivi \"annulla\" per tornare alla chat_"

**Quando appare**: Dopo che utente fornisce nome valido

**Schema Logico**:
```
User fornisce nome → Backend valida (min 2 caratteri) →
Salva in ticketData.name →
Invia ticket_ask_contact con {name} interpolato →
Widget chiede contatto
```

**Test**:
- [ ] 1. Continuare da ticket_start
- [ ] 2. Scrivere nome "Mario"
- [ ] 3. Widget mostra "Piacere di conoscerti, **Mario**! 👋"
- [ ] 4. Verificare interpolazione {name}
- [ ] 5. Verificare richiesta email/WhatsApp

---

#### `ticket_ask_additional` - Richiesta Info Aggiuntive
**Testo**: "Perfetto! Ti contatterò su **{contact}** ✅\n\n📝 **C'è qualcos'altro che vuoi aggiungere?**\n\nPuoi darmi più dettagli sul tuo problema o sulla tua richiesta.\n\n_Oppure scrivi \"no\" o \"basta\" per procedere._"

**Quando appare**: Dopo contatto valido, chiede dettagli aggiuntivi

**Schema Logico**:
```
User fornisce email/WhatsApp → Backend valida formato →
Salva in ticketData.contact →
Invia ticket_ask_additional con {contact} →
Widget chiede dettagli (opzionale)
```

**Test**:
- [ ] 1. Continuare da ticket_ask_contact
- [ ] 2. Scrivere email "test@test.com"
- [ ] 3. Widget mostra "Ti contatterò su **test@test.com** ✅"
- [ ] 4. Verificare interpolazione {contact}
- [ ] 5. Scrivere "no" o dettagli aggiuntivi

---

#### `ticket_created` - Ticket Creato
**Testo**: "✅ **Ticket #{ticketNumber} creato con successo!**\n\n👤 **{name}**, grazie per le informazioni!\n\n📧 Ti contatteremo a: **{contact}**\n⏱️ **Tempo di risposta**: 2-4 ore\n\n🔗 **Link per riprendere la chat**:\n{resumeUrl}\n\n💡 _Salva questo link! Potrai usarlo per continuare la conversazione in qualsiasi momento._\n\nGrazie per aver contattato le **Lucine di Natale**! 🎄✨"

**Quando appare**: Dopo completamento flusso ticket

**Schema Logico**:
```
User fornisce tutti dati → Backend crea ticket nel DB →
Genera ticketNumber e resumeUrl →
Invia ticket_created con tutte interpolazioni →
Widget mostra riepilogo + link
```

**Test**:
- [ ] 1. Completare flusso ticket
- [ ] 2. Verificare messaggio "Ticket #123 creato"
- [ ] 3. Verificare {ticketNumber} interpolato
- [ ] 4. Verificare {name} corretto
- [ ] 5. Verificare {contact} corretto
- [ ] 6. Verificare {resumeUrl} cliccabile
- [ ] 7. Cliccare link → riprende chat

---

#### `ticket_name_invalid` - Nome Non Valido
**Testo**: "❌ Nome non valido.\n\nPer favore, inserisci il tuo **nome** (almeno 2 caratteri).\n\n💡 _Scrivi \"annulla\" per tornare alla chat_"

**Quando appare**: Utente inserisce nome < 2 caratteri

**Test**:
- [ ] 1. Durante ticket_start
- [ ] 2. Scrivere "A" (1 carattere)
- [ ] 3. Widget mostra errore
- [ ] 4. Ri-chiedere nome

---

#### `ticket_contact_invalid` - Contatto Non Valido
**Testo**: "❌ **Contatto non valido**\n\nInserisci un contatto valido:\n📧 **Email**: esempio@gmail.com\n📱 **WhatsApp**: +39 333 123 4567\n\n💡 _Scrivi \"annulla\" per tornare alla chat_"

**Quando appare**: Formato email/telefono invalido

**Test**:
- [ ] 1. Durante ticket_ask_contact
- [ ] 2. Scrivere "emailsbagliata"
- [ ] 3. Widget mostra errore
- [ ] 4. Ri-chiedere contatto valido

---

#### `ticket_cancel` - Ticket Annullato
**Testo**: "🔙 Perfetto! Sono tornato in modalità chat normale.\n\nCome posso aiutarti con le **Lucine di Natale**? 🎄"

**Quando appare**: Utente scrive "annulla" durante flusso ticket

**Schema Logico**:
```
User scrive "annulla" durante REQUESTING_TICKET →
Backend resetta ticketData →
Cambia status a ACTIVE →
Invia ticket_cancel →
Widget torna a chat AI normale
```

**Test**:
- [ ] 1. Iniziare flusso ticket
- [ ] 2. A qualsiasi step scrivere "annulla"
- [ ] 3. Widget mostra "tornato in modalità chat normale"
- [ ] 4. Verificare torna a AI (non operatore)

---

#### `ticket_already_exists` - Ticket Già Esistente
**Testo**: "✅ **Hai già un ticket aperto: #{ticketNumber}**\n\nUn operatore ti contatterà a breve. Se vuoi aggiungere informazioni, scrivile pure qui."

**Quando appare**: Utente tenta di creare ticket ma ne ha già uno aperto

**Schema Logico**:
```
User scrive "apri ticket" → Backend cerca ticket aperti per sessionId →
Trova ticket OPEN/IN_PROGRESS →
Invia ticket_already_exists con {ticketNumber} →
Widget informa utente
```

**Test**:
- [ ] 1. Creare ticket
- [ ] 2. Senza chiuderlo, scrivere "apri ticket" di nuovo
- [ ] 3. Widget mostra "Hai già un ticket aperto: #123"
- [ ] 4. Verificare {ticketNumber} corretto

---

### 4️⃣ CATEGORIA: CLOSURE (3 testi)

#### `closure_request` - Richiesta Chiusura
**Testo**: "Posso aiutarti con qualcos'altro?"

**Quando appare**: Operatore clicca "Chiudi conversazione"

**Schema Logico**:
```
Operatore clicca "Chiudi conversazione" in dashboard →
Backend: routes/operators.js:close-conversation →
Crea messaggio SYSTEM con closure_request + smartActions →
Widget riceve via polling/WebSocket →
Mostra testo + 2 pulsanti (Sì / No)
```

**Test**:
- [ ] 1. Chat con operatore attiva
- [ ] 2. Operatore clicca "Chiudi conversazione"
- [ ] 3. Widget mostra "Posso aiutarti con qualcos'altro?"
- [ ] 4. Verificare 2 pulsanti: "Sì, ho ancora bisogno" e "No, grazie"
- [ ] 5. Pulsanti cliccabili

---

#### `chat_continue` - Continua Chat
**Testo**: "Certo! Dimmi pure, come posso aiutarti ancora."

**Quando appare**: Utente clicca "Sì, ho ancora bisogno"

**Schema Logico**:
```
User clicca pulsante "Sì" → Widget invia "continue_chat" →
Backend: routes/chat/index.js riconosce continue_chat →
Mantiene status WITH_OPERATOR →
Invia chat_continue →
Widget mostra e aspetta nuova domanda
```

**Test**:
- [ ] 1. Continuare da closure_request
- [ ] 2. Cliccare "Sì, ho ancora bisogno"
- [ ] 3. Widget mostra "Certo! Dimmi pure..."
- [ ] 4. Chat rimane con operatore
- [ ] 5. Pulsanti scompaiono

---

#### `chat_end_goodbye` - Saluto Finale
**Testo**: "Felici di esserti stati d'aiuto! Se ti servisse ancora qualcosa, siamo sempre disponibili.\n\nOra puoi continuare a parlare con il nostro assistente virtuale per qualsiasi informazione aggiuntiva."

**Quando appare**: Utente clicca "No, grazie"

**Schema Logico**:
```
User clicca pulsante "No" → Widget invia "end_chat" →
Backend chiude operatorChat (endedAt = now) →
Cambia status a ACTIVE →
Invia chat_end_goodbye →
Widget torna a modalità AI
```

**Test**:
- [ ] 1. Continuare da closure_request
- [ ] 2. Cliccare "No, grazie"
- [ ] 3. Widget mostra saluto finale
- [ ] 4. Chat torna a AI
- [ ] 5. Header cambia da "Operatore" a "Assistente"

---

### 5️⃣ CATEGORIA: GENERAL (2 testi)

#### `resume_welcome` - Benvenuto Ripresa Chat
**Testo**: "🎫 **Benvenuto!**\n\nHai ripreso la conversazione del ticket #{ticketNumber}.\n\n{operatorStatus}"

**Quando appare**: Utente clicca link resume da email/ticket

**Schema Logico**:
```
User clicca {resumeUrl} da ticket →
GET /api/chat/resume/:token →
Backend: routes/chat/resume-handler.js verifica token →
Trova ticket e sessionId →
Determina operatorStatus (online/offline) →
Invia resume_welcome con interpolazioni →
Widget ricarica chat
```

**Test**:
- [ ] 1. Creare ticket con resumeUrl
- [ ] 2. Copiare link resume
- [ ] 3. Aprire in nuova finestra/tab
- [ ] 4. Widget mostra "Benvenuto! Hai ripreso conversazione ticket #123"
- [ ] 5. Verificare {ticketNumber}
- [ ] 6. Verificare {operatorStatus} (operatore online/offline)

---

## 📊 MATRICE TEST COVERAGE

| Categoria | Testi | Test Completati | Status |
|-----------|-------|-----------------|--------|
| OPERATOR  | 2/2   | 0/2            | ⏳     |
| QUEUE     | 4/4   | 0/4            | ⏳     |
| TICKET    | 8/8   | 0/8            | ⏳     |
| CLOSURE   | 3/3   | 0/3            | ⏳     |
| GENERAL   | 2/2   | 0/2            | ⏳     |
| **TOTALE**| **19/19** | **0/19**   | **⏳** |

---

## 🔄 ORDINE ESECUZIONE TEST

### FASE 1: Flusso Base Operatore
1. operator_greeting (take chat)
2. closure_request (chiudi conversazione)
3. chat_continue (continua)
4. chat_end_goodbye (termina)

### FASE 2: Coda e Escalation
5. queue_no_operators (nessuno online)
6. queue_all_busy (tutti occupati)
7. operator_connected (assegnazione automatica)

### FASE 3: Ticket Completo
8. ticket_start
9. ticket_ask_name (implicito)
10. ticket_name_invalid (validazione)
11. ticket_ask_contact
12. ticket_contact_invalid (validazione)
13. ticket_ask_additional
14. ticket_created
15. ticket_cancel (annulla)
16. ticket_already_exists (duplicato)

### FASE 4: Resume
17. resume_welcome (riprendi da link)

---

## ✅ CRITERI SUCCESSO TEST

Per ogni testo verificare:
- [ ] Testo appare nel momento corretto
- [ ] Testo è esattamente quello configurato
- [ ] Interpolazioni {variabili} funzionano
- [ ] SmartActions/pulsanti appaiono quando previsti
- [ ] Markdown (**bold**, *italic*) renderizzato correttamente
- [ ] Link cliccabili
- [ ] Emoji visualizzate
- [ ] Nessun errore in console
- [ ] Transizione stato corretta
