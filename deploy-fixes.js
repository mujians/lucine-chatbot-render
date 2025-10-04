/**
 * 🚀 DEPLOY FIXES - Run this on Render
 * Fixes production database schema and seeds data
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function runFixes() {
  console.log('🔧 Starting production fixes...\n');

  try {
    // 1. Fix SLARecord schema
    console.log('1️⃣ Fixing SLARecord schema...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SLARecord" 
      ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL'
    `);
    console.log('   ✅ SLARecord.category column added\n');

    // 2. Check if AutomatedText table has data
    const textsCount = await prisma.automatedText.count();
    console.log(`2️⃣ Current automated texts: ${textsCount}`);

    if (textsCount === 0) {
      console.log('   📝 Seeding automated texts...');
      
      const defaultTexts = [
        { key: 'operator_greeting', label: 'Saluto Operatore', category: 'operator', text: 'Ciao! Un attimo che controllo la conversazione e vedo come posso aiutarti.\nIntanto, fammi sapere se hai altre esigenze specifiche 😊', description: 'Messaggio automatico quando un operatore prende controllo della chat', isActive: true },
        { key: 'operator_connected', label: 'Operatore Connesso', category: 'operator', text: 'Perfetto! Ti sto connettendo con un operatore...\n\n⏱️ {operatorName} ti risponderà a breve. Attendi un momento.', description: 'Messaggio quando viene trovato un operatore disponibile', isActive: true },
        { key: 'queue_no_operators', label: 'Nessun Operatore Online', category: 'queue', text: '⏰ Non ci sono operatori disponibili al momento\n\n💡 Puoi aprire un ticket o continuare con l\'assistente AI', description: 'Messaggio quando nessun operatore è online', isActive: true },
        { key: 'queue_all_busy', label: 'Operatori Occupati', category: 'queue', text: '⏰ **Al momento tutti gli operatori sono impegnati.**\n\n{waitMessage}\n\nPuoi attendere in linea oppure lasciare un ticket per essere ricontattato.', description: 'Messaggio quando tutti gli operatori sono occupati', isActive: true },
        { key: 'operator_no_online', label: 'Nessun Operatore Online (Escalation)', category: 'queue', text: '⏰ Non ci sono operatori disponibili al momento\n\n💡 Puoi aprire un ticket o continuare con l\'assistente AI', description: 'Messaggio escalation quando nessun operatore è online', isActive: true },
        { key: 'operator_all_busy', label: 'Operatori Tutti Occupati (Escalation)', category: 'queue', text: '⏰ **Al momento tutti gli operatori sono impegnati.**\n\n{waitMessage}\n\nPuoi attendere in linea oppure lasciare un ticket per essere ricontattato.', description: 'Messaggio escalation quando tutti occupati', isActive: true },
        { key: 'ticket_start', label: 'Inizio Creazione Ticket', category: 'ticket', text: '🎫 **Perfetto! Creiamo un ticket di supporto.**\n\nUn operatore ti ricontatterà appena disponibile per riprendere la conversazione.\n\n👤 **Per iniziare, come ti chiami?**\n\n💡 _Scrivi "annulla" in qualsiasi momento per tornare alla chat_', description: 'Messaggio di inizio del flusso di creazione ticket', isActive: true },
        { key: 'ticket_ask_name', label: 'Richiesta Nome', category: 'ticket', text: '👤 **Come ti chiami?**\n\nInserisci il tuo nome per proseguire.', description: 'Richiesta del nome dell\'utente', isActive: true },
        { key: 'ticket_ask_contact', label: 'Richiesta Contatto', category: 'ticket', text: 'Piacere di conoscerti, **{name}**! 👋\n\n📧 **Come preferisci essere contattato?**\n\nInviami:\n• La tua **email** (es: mario.rossi@gmail.com)\n• Oppure il tuo numero **WhatsApp** (es: +39 333 123 4567)\n\n💡 _Scrivi "annulla" per tornare alla chat_', description: 'Richiesta del metodo di contatto', isActive: true },
        { key: 'ticket_created', label: 'Ticket Creato', category: 'ticket', text: '✅ **Ticket #{ticketNumber} creato con successo!**\n\n👤 **{name}**, grazie per le informazioni!\n\n📧 Ti contatteremo a: **{contact}**\n⏱️ **Tempo di risposta**: 2-4 ore\n\n🔗 **Link per riprendere la chat**:\n{resumeUrl}\n\n💡 _Salva questo link! Potrai usarlo per continuare la conversazione in qualsiasi momento._\n\nGrazie per aver contattato le **Lucine di Natale**! 🎄✨', description: 'Conferma creazione ticket', isActive: true },
        { key: 'closure_request', label: 'Richiesta Chiusura', category: 'closure', text: 'Posso aiutarti con qualcos\'altro?', description: 'Domanda dell\'operatore prima di chiudere la conversazione', isActive: true },
        { key: 'chat_continue', label: 'Continua Chat', category: 'closure', text: 'Certo! Dimmi pure, come posso aiutarti ancora.', description: 'Risposta quando l\'utente vuole continuare la chat', isActive: true },
        { key: 'chat_end_goodbye', label: 'Saluto Finale', category: 'closure', text: 'Felici di esserti stati d\'aiuto! Se ti servisse ancora qualcosa, siamo sempre disponibili.\n\nOra puoi continuare a parlare con il nostro assistente virtuale per qualsiasi informazione aggiuntiva.', description: 'Messaggio di saluto quando l\'utente termina la conversazione', isActive: true },
        { key: 'ticket_cancel', label: 'Ticket Annullato', category: 'ticket', text: '🔙 Perfetto! Sono tornato in modalità chat normale.\n\nCome posso aiutarti con le **Lucine di Natale**? 🎄', description: 'Messaggio quando l\'utente annulla la creazione del ticket', isActive: true },
        { key: 'ticket_ask_additional', label: 'Richiesta Info Aggiuntive', category: 'ticket', text: 'Perfetto! Ti contatterò su **{contact}** ✅\n\n📝 **C\'è qualcos\'altro che vuoi aggiungere?**\n\nPuoi darmi più dettagli sul tuo problema o sulla tua richiesta.\n\n_Oppure scrivi "no" o "basta" per procedere._', description: 'Richiesta informazioni aggiuntive dopo contatto', isActive: true },
        { key: 'ticket_name_invalid', label: 'Nome Non Valido', category: 'ticket', text: '❌ Nome non valido.\n\nPer favore, inserisci il tuo **nome** (almeno 2 caratteri).\n\n💡 _Scrivi "annulla" per tornare alla chat_', description: 'Errore validazione nome durante creazione ticket', isActive: true },
        { key: 'ticket_contact_invalid', label: 'Contatto Non Valido', category: 'ticket', text: '❌ **Contatto non valido**\n\nInserisci un contatto valido:\n📧 **Email**: esempio@gmail.com\n📱 **WhatsApp**: +39 333 123 4567\n\n💡 _Scrivi "annulla" per tornare alla chat_', description: 'Errore validazione contatto durante creazione ticket', isActive: true },
        { key: 'ticket_already_exists', label: 'Ticket Già Esistente', category: 'general', text: '✅ **Hai già un ticket aperto: #{ticketNumber}**\n\nUn operatore ti contatterà a breve. Se vuoi aggiungere informazioni, scrivile pure qui.', description: 'Messaggio quando l\'utente ha già un ticket aperto', isActive: true },
        { key: 'resume_welcome', label: 'Benvenuto Ripresa Chat', category: 'general', text: '🎫 **Benvenuto!**\n\nHai ripreso la conversazione del ticket #{ticketNumber}.\n\n{operatorStatus}', description: 'Messaggio di benvenuto quando si riprende una chat da link', isActive: true }
      ];

      for (const text of defaultTexts) {
        await prisma.automatedText.upsert({
          where: { key: text.key },
          update: text,
          create: text
        });
        console.log(`   ✅ ${text.key}`);
      }
      
      console.log(`\n   ✅ Seeded ${defaultTexts.length} texts\n`);
    } else {
      console.log('   ℹ️  Texts already exist, skipping seed\n');
    }

    console.log('🎉 All fixes applied successfully!');
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runFixes();
