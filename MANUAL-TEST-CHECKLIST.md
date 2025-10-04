# ✅ MANUAL TEST CHECKLIST - Automated Texts

## 🎯 FASE 1: OPERATORE (4 test)

### TEST 1.1: `operator_greeting` ✅
**Scenario**: Saluto automatico quando operatore prende chat

**Passi**:
1. ✅ Apri widget: https://lucinedinatale.it?chatbot=test
2. ✅ Scrivi: "voglio parlare con operatore"
3. ✅ Dashboard → vai su "Chat Live"
4. ✅ Clicca "Prendi chat" sulla sessione
5. ✅ Verifica nel widget appaia: "Ciao! Un attimo che controllo la conversazione..."

**✅ SUCCESSO SE**: Messaggio appare automaticamente, testo esatto, emoji 😊 visibile

---

### TEST 1.2: `closure_request` + Pulsanti ✅
**Scenario**: Operatore chiede se serve altro + 2 pulsanti

**Passi**:
1. ✅ Continuare da TEST 1.1 (chat con operatore attiva)
2. ✅ Dashboard → clicca "Chiudi conversazione"
3. ✅ Widget → verifica appaia: "Posso aiutarti con qualcos'altro?"
4. ✅ Verifica 2 pulsanti: "✅ Sì, ho ancora bisogno" e "❌ No, grazie"
5. ✅ Pulsanti cliccabili

**✅ SUCCESSO SE**: Testo + 2 pulsanti appaiono, emoji visibili

---

### TEST 1.3: `chat_continue` ✅
**Scenario**: Utente clicca "Sì" → chat continua

**Passi**:
1. ✅ Continuare da TEST 1.2
2. ✅ Widget → clicca pulsante "✅ Sì, ho ancora bisogno"
3. ✅ Verifica appaia: "Certo! Dimmi pure, come posso aiutarti ancora."
4. ✅ Verifica pulsanti scompaiono
5. ✅ Verifica chat ancora con operatore (header "Operatore")

**✅ SUCCESSO SE**: Testo conferma, pulsanti scomparsi, chat attiva

---

### TEST 1.4: `chat_end_goodbye` ✅
**Scenario**: Utente clicca "No" → chat termina

**Passi**:
1. ✅ Ripetere TEST 1.2 (chiudi conversazione)
2. ✅ Widget → clicca pulsante "❌ No, grazie"
3. ✅ Verifica appaia: "Felici di esserti stati d'aiuto! Se ti servisse ancora qualcosa..."
4. ✅ Verifica header cambi da "Operatore" a "Assistente"
5. ✅ Verifica chat torna in modalità AI

**✅ SUCCESSO SE**: Saluto finale, header cambiato, AI attivo

---

## 🎯 FASE 2: CODA (2 test)

### TEST 2.1: `queue_no_operators` ✅
**Scenario**: Nessun operatore online

**Passi**:
1. ✅ Dashboard → tutti operatori offline (logout)
2. ✅ Widget (nuova sessione) → scrivi: "voglio operatore"
3. ✅ Verifica appaia: "⏰ Non ci sono operatori disponibili al momento"
4. ✅ Verifica testo: "💡 Puoi aprire un ticket o continuare con l'assistente AI"
5. ✅ Verifica 2 pulsanti (Apri ticket / Continua AI)

**✅ SUCCESSO SE**: Messaggio coda, emoji, 2 pulsanti

---

### TEST 2.2: `queue_all_busy` ✅
**Scenario**: Operatori online ma tutti occupati

**Passi**:
1. ✅ Dashboard → 1 operatore online
2. ✅ Widget sessione 1 → richiedi operatore → operatore prende chat
3. ✅ Widget sessione 2 (nuova) → scrivi: "operatore"
4. ✅ Verifica: "⏰ **Al momento tutti gli operatori sono impegnati.**"
5. ✅ Verifica messaggio posizione coda (es: "Sei il 1° in coda")

**✅ SUCCESSO SE**: Messaggio occupati, posizione coda, pulsanti

---

## 🎯 FASE 3: TICKET COMPLETO (8 test)

### TEST 3.1: `ticket_start` → `ticket_created` ✅
**Scenario**: Flusso completo creazione ticket

**Passi**:
1. ✅ Widget → scrivi: "apri ticket"
2. ✅ Verifica: "🎫 **Perfetto! Creiamo un ticket di supporto.**"
3. ✅ Verifica: "👤 **Per iniziare, come ti chiami?**"
4. ✅ Scrivi: "Mario Rossi"
5. ✅ Verifica: "Piacere di conoscerti, **Mario Rossi**! 👋"
6. ✅ Verifica interpolazione {name} funziona
7. ✅ Verifica: "📧 **Come preferisci essere contattato?**"
8. ✅ Scrivi: "mario@test.com"
9. ✅ Verifica: "Ti contatterò su **mario@test.com** ✅"
10. ✅ Verifica interpolazione {contact}
11. ✅ Verifica: "📝 **C'è qualcos'altro che vuoi aggiungere?**"
12. ✅ Scrivi: "no"
13. ✅ Verifica: "✅ **Ticket #XXX creato con successo!**"
14. ✅ Verifica {ticketNumber}, {name}, {contact} tutti interpolati
15. ✅ Verifica link resume {resumeUrl} cliccabile

**✅ SUCCESSO SE**: Tutto il flusso completo, tutte interpolazioni OK

---

### TEST 3.2: `ticket_name_invalid` ✅
**Scenario**: Nome troppo corto

**Passi**:
1. ✅ Inizio ticket
2. ✅ Scrivi: "A" (1 carattere)
3. ✅ Verifica: "❌ Nome non valido"
4. ✅ Verifica: "almeno 2 caratteri"
5. ✅ Riprova con nome valido

**✅ SUCCESSO SE**: Errore mostrato, validazione funziona

---

### TEST 3.3: `ticket_contact_invalid` ✅
**Scenario**: Email/telefono invalido

**Passi**:
1. ✅ Dopo nome valido
2. ✅ Scrivi: "emailsbagliata"
3. ✅ Verifica: "❌ **Contatto non valido**"
4. ✅ Verifica esempi email e WhatsApp
5. ✅ Riprova con contatto valido

**✅ SUCCESSO SE**: Errore mostrato, esempi chiari

---

### TEST 3.4: `ticket_cancel` ✅
**Scenario**: Annulla durante ticket

**Passi**:
1. ✅ Inizio ticket
2. ✅ A qualsiasi step scrivi: "annulla"
3. ✅ Verifica: "🔙 Perfetto! Sono tornato in modalità chat normale"
4. ✅ Verifica header torna a "Assistente"
5. ✅ Verifica AI attivo

**✅ SUCCESSO SE**: Annullamento funziona, torna ad AI

---

### TEST 3.5: `ticket_already_exists` ✅
**Scenario**: Tenta creare ticket duplicato

**Passi**:
1. ✅ Completa creazione ticket (TEST 3.1)
2. ✅ Scrivi di nuovo: "apri ticket"
3. ✅ Verifica: "✅ **Hai già un ticket aperto: #XXX**"
4. ✅ Verifica {ticketNumber} corretto
5. ✅ Verifica: "Se vuoi aggiungere informazioni, scrivile pure qui"

**✅ SUCCESSO SE**: Previene duplicato, numero ticket corretto

---

## 🎯 FASE 4: RESUME (1 test)

### TEST 4.1: `resume_welcome` ✅
**Scenario**: Riprendi chat da link ticket

**Passi**:
1. ✅ Copia {resumeUrl} da ticket creato
2. ✅ Apri link in nuova finestra/tab
3. ✅ Verifica: "🎫 **Benvenuto!**"
4. ✅ Verifica: "Hai ripreso la conversazione del ticket #XXX"
5. ✅ Verifica {ticketNumber} corretto
6. ✅ Verifica {operatorStatus} (online/offline)

**✅ SUCCESSO SE**: Riprende chat, ticket number corretto, status operatore

---

## 📊 SCORECARD FINALE

| Test | Categoria | Status | Note |
|------|-----------|--------|------|
| 1.1 | operator_greeting | ⏳ | |
| 1.2 | closure_request | ⏳ | |
| 1.3 | chat_continue | ⏳ | |
| 1.4 | chat_end_goodbye | ⏳ | |
| 2.1 | queue_no_operators | ⏳ | |
| 2.2 | queue_all_busy | ⏳ | |
| 3.1 | ticket_flow_complete | ⏳ | |
| 3.2 | ticket_name_invalid | ⏳ | |
| 3.3 | ticket_contact_invalid | ⏳ | |
| 3.4 | ticket_cancel | ⏳ | |
| 3.5 | ticket_already_exists | ⏳ | |
| 4.1 | resume_welcome | ⏳ | |

**TOTALE**: 0/12 completati

---

## 🐛 BUGS TROVATI

_(Aggiungere qui eventuali bug trovati durante i test)_

---

## ✅ CRITERI GENERALI

Per ogni test verificare:
- [ ] Testo esatto come configurato
- [ ] Interpolazioni {var} funzionano
- [ ] Emoji visibili correttamente
- [ ] **Markdown renderizzato** (**bold**, *italic*)
- [ ] Link cliccabili
- [ ] Pulsanti (smartActions) quando previsti
- [ ] Nessun errore in console browser
- [ ] Transizione stato corretta
