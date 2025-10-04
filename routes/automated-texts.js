/**
 * 📝 AUTOMATED TEXTS MANAGEMENT
 * API per gestire testi automatici configurabili
 */

import express from 'express';
import container from '../config/container.js';
import { authenticateToken } from '../middleware/security.js';

const router = express.Router();

// Tutti gli endpoint richiedono autenticazione
router.use(authenticateToken);

/**
 * GET /automated-texts
 * Lista tutti i testi automatici
 */
router.get('/', async (req, res) => {
  try {
    const prisma = container.get('prisma');

    const { category, isActive } = req.query;

    const where = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const texts = await prisma.automatedText.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { key: 'asc' }
      ]
    });

    res.json({ texts, count: texts.length });
  } catch (error) {
    console.error('❌ Error fetching automated texts:', error);
    res.status(500).json({ error: 'Errore nel recuperare i testi' });
  }
});

/**
 * GET /automated-texts/:key
 * Ottieni un testo specifico per chiave
 */
router.get('/:key', async (req, res) => {
  try {
    const prisma = container.get('prisma');
    const { key } = req.params;

    const text = await prisma.automatedText.findUnique({
      where: { key }
    });

    if (!text) {
      return res.status(404).json({ error: 'Testo non trovato' });
    }

    res.json(text);
  } catch (error) {
    console.error('❌ Error fetching automated text:', error);
    res.status(500).json({ error: 'Errore nel recuperare il testo' });
  }
});

/**
 * POST /automated-texts
 * Crea nuovo testo automatico
 */
router.post('/', async (req, res) => {
  try {
    const prisma = container.get('prisma');
    const { key, label, text, description, category, isActive } = req.body;

    // Validazione
    if (!key || !label || !text) {
      return res.status(400).json({
        error: 'Campi obbligatori: key, label, text'
      });
    }

    // Controlla se esiste già
    const existing = await prisma.automatedText.findUnique({
      where: { key }
    });

    if (existing) {
      return res.status(409).json({
        error: 'Esiste già un testo con questa chiave'
      });
    }

    const newText = await prisma.automatedText.create({
      data: {
        key,
        label,
        text,
        description: description || null,
        category: category || 'general',
        isActive: isActive !== undefined ? isActive : true
      }
    });

    res.status(201).json(newText);
  } catch (error) {
    console.error('❌ Error creating automated text:', error);
    res.status(500).json({ error: 'Errore nella creazione del testo' });
  }
});

/**
 * PUT /automated-texts/:key
 * Aggiorna testo automatico
 */
router.put('/:key', async (req, res) => {
  try {
    const prisma = container.get('prisma');
    const { key } = req.params;
    const { label, text, description, category, isActive } = req.body;

    // Controlla se esiste
    const existing = await prisma.automatedText.findUnique({
      where: { key }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Testo non trovato' });
    }

    const updateData = {};
    if (label !== undefined) updateData.label = label;
    if (text !== undefined) updateData.text = text;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.automatedText.update({
      where: { key },
      data: updateData
    });

    res.json(updated);
  } catch (error) {
    console.error('❌ Error updating automated text:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento del testo' });
  }
});

/**
 * DELETE /automated-texts/:key
 * Elimina testo automatico
 */
router.delete('/:key', async (req, res) => {
  try {
    const prisma = container.get('prisma');
    const { key } = req.params;

    await prisma.automatedText.delete({
      where: { key }
    });

    res.json({ message: 'Testo eliminato con successo' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Testo non trovato' });
    }
    console.error('❌ Error deleting automated text:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione del testo' });
  }
});

/**
 * GET /automated-texts/categories/list
 * Lista tutte le categorie disponibili
 */
router.get('/categories/list', async (req, res) => {
  try {
    const prisma = container.get('prisma');

    const categories = await prisma.automatedText.groupBy({
      by: ['category'],
      _count: { category: true }
    });

    res.json(categories);
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({ error: 'Errore nel recuperare le categorie' });
  }
});

export default router;
