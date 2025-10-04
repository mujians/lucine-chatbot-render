/**
 * 📝 AUTOMATED TEXTS MANAGEMENT
 * Dashboard per gestire i testi automatici
 */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://lucine-chatbot.onrender.com/api';

let allTexts = [];
let editingKey = null;

// Elements
const textsContainer = document.getElementById('texts-container');
const textsCountBadge = document.getElementById('texts-count');
const categoryFilter = document.getElementById('category-filter');
const activeOnlyFilter = document.getElementById('active-only-filter');
const createTextBtn = document.getElementById('create-text-btn');
const modal = document.getElementById('text-modal');
const modalTitle = document.getElementById('modal-title');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const textForm = document.getElementById('text-form');
const logoutBtn = document.getElementById('logout-btn');

// Auth check
const token = localStorage.getItem('auth_token');
if (!token) {
  window.location.href = '/dashboard/login.html';
}

// Load texts on page load
loadTexts();

// Event Listeners
createTextBtn.addEventListener('click', () => openModal());
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
categoryFilter.addEventListener('change', applyFilters);
activeOnlyFilter.addEventListener('change', applyFilters);
textForm.addEventListener('submit', handleSubmit);
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('auth_token');
  window.location.href = '/dashboard/login.html';
});

/**
 * Load all texts from API
 */
async function loadTexts() {
  try {
    const response = await fetch(`${API_BASE}/automated-texts`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load texts');

    const data = await response.json();
    allTexts = data.texts || [];

    applyFilters();
  } catch (error) {
    console.error('Error loading texts:', error);
    showToast('Errore nel caricamento dei testi', 'error');
    textsContainer.innerHTML = '<p class="text-muted">Errore nel caricamento</p>';
  }
}

/**
 * Apply filters and render filtered texts
 */
function applyFilters() {
  const selectedCategory = categoryFilter.value;
  const activeOnly = activeOnlyFilter.checked;

  let filtered = allTexts;

  if (selectedCategory) {
    filtered = filtered.filter(t => t.category === selectedCategory);
  }

  if (activeOnly) {
    filtered = filtered.filter(t => t.isActive);
  }

  renderTexts(filtered);
  textsCountBadge.textContent = filtered.length;
}

/**
 * Render texts list
 */
function renderTexts(texts) {
  if (texts.length === 0) {
    textsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <i class="fas fa-inbox fa-3x" style="margin-bottom: 16px;"></i>
        <p>Nessun testo trovato</p>
        <button class="btn btn-primary" onclick="document.getElementById('create-text-btn').click()">
          <i class="fas fa-plus"></i> Crea il primo testo
        </button>
      </div>
    `;
    return;
  }

  // Group by category
  const grouped = texts.reduce((acc, text) => {
    if (!acc[text.category]) acc[text.category] = [];
    acc[text.category].push(text);
    return acc;
  }, {});

  let html = '';

  Object.entries(grouped).forEach(([category, categoryTexts]) => {
    html += `
      <div class="text-category-group" style="margin-bottom: 30px;">
        <h4 style="color: #666; margin-bottom: 16px; text-transform: capitalize;">
          ${getCategoryIcon(category)} ${getCategoryLabel(category)}
        </h4>
        <div class="texts-grid" style="display: grid; gap: 16px;">
    `;

    categoryTexts.forEach(text => {
      html += `
        <div class="text-card" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; background: white;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div style="flex: 1;">
              <h5 style="margin: 0 0 4px 0; color: #333;">
                ${text.label}
                ${!text.isActive ? '<span class="badge badge-secondary" style="margin-left: 8px;">Inattivo</span>' : ''}
              </h5>
              <code style="font-size: 11px; color: #999;">${text.key}</code>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-sm btn-secondary" onclick="editText('${text.key}')" title="Modifica">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteText('${text.key}')" title="Elimina">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <div class="text-preview" style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
            <p style="margin: 0; font-size: 14px; color: #666; white-space: pre-wrap;">${escapeHtml(text.text)}</p>
          </div>

          ${text.description ? `
            <p style="font-size: 12px; color: #999; margin: 0;">
              <i class="fas fa-info-circle"></i> ${escapeHtml(text.description)}
            </p>
          ` : ''}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  textsContainer.innerHTML = html;
}

/**
 * Open modal for create/edit
 */
function openModal(key = null) {
  editingKey = key;

  if (key) {
    // Edit mode
    const text = allTexts.find(t => t.key === key);
    if (!text) return;

    modalTitle.textContent = 'Modifica Testo';
    document.getElementById('text-key').value = text.key;
    document.getElementById('text-key').disabled = true;
    document.getElementById('text-label').value = text.label;
    document.getElementById('text-category').value = text.category;
    document.getElementById('text-content').value = text.text;
    document.getElementById('text-description').value = text.description || '';
    document.getElementById('text-active').checked = text.isActive;
  } else {
    // Create mode
    modalTitle.textContent = 'Nuovo Testo Automatico';
    textForm.reset();
    document.getElementById('text-key').disabled = false;
    document.getElementById('text-active').checked = true;
  }

  modal.style.display = 'flex';
}

/**
 * Close modal
 */
function closeModal() {
  modal.style.display = 'none';
  textForm.reset();
  editingKey = null;
}

/**
 * Handle form submit
 */
async function handleSubmit(e) {
  e.preventDefault();

  const data = {
    key: document.getElementById('text-key').value.trim(),
    label: document.getElementById('text-label').value.trim(),
    category: document.getElementById('text-category').value,
    text: document.getElementById('text-content').value.trim(),
    description: document.getElementById('text-description').value.trim() || null,
    isActive: document.getElementById('text-active').checked
  };

  try {
    const url = editingKey
      ? `${API_BASE}/automated-texts/${editingKey}`
      : `${API_BASE}/automated-texts`;

    const method = editingKey ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Errore nel salvare il testo');
    }

    showToast(editingKey ? 'Testo aggiornato!' : 'Testo creato!', 'success');
    closeModal();
    loadTexts();
  } catch (error) {
    console.error('Error saving text:', error);
    showToast(error.message, 'error');
  }
}

/**
 * Edit text
 */
window.editText = function(key) {
  openModal(key);
};

/**
 * Delete text
 */
window.deleteText = async function(key) {
  if (!confirm('Sei sicuro di voler eliminare questo testo?')) return;

  try {
    const response = await fetch(`${API_BASE}/automated-texts/${key}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Errore nell\'eliminazione');

    showToast('Testo eliminato', 'success');
    loadTexts();
  } catch (error) {
    console.error('Error deleting text:', error);
    showToast('Errore nell\'eliminazione', 'error');
  }
};

/**
 * Helper functions
 */
function getCategoryIcon(category) {
  const icons = {
    operator: '👤',
    queue: '⏱️',
    ticket: '🎫',
    closure: '👋',
    general: '💬'
  };
  return icons[category] || '📝';
}

function getCategoryLabel(category) {
  const labels = {
    operator: 'Operatore',
    queue: 'Coda',
    ticket: 'Ticket',
    closure: 'Chiusura',
    general: 'Generale'
  };
  return labels[category] || category;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  // Simple toast notification
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
  .modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
`;
document.head.appendChild(style);
