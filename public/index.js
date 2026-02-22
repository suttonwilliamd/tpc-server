// === tpc-server UI ===
const API_BASE = '';

// State
let currentTab = 'thoughts';
let currentFilter = { type: 'all', search: '', tags: [] };
let allTags = new Set();
let thoughts = [];
let plans = [];
let context = null;

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
    await loadStats();
    await loadTags();
    await loadContext();
    await loadData();
    setupEventListeners();
    renderTags();
});

// === API Calls ===
async function loadStats() {
    try {
        const [thoughtsRes, plansRes] = await Promise.all([
            fetch(`${API_BASE}/thoughts?limit=1`),
            fetch(`${API_BASE}/plans?limit=1`)
        ]);
        
        // Get counts from headers or by loading all
        const thoughtsAll = await fetch(`${API_BASE}/thoughts`).then(r => r.json());
        const plansAll = await fetch(`${API_BASE}/plans`).then(r => r.json());
        
        document.getElementById('thought-count').textContent = thoughtsAll.length.toLocaleString();
        document.getElementById('plan-count').textContent = plansAll.length;
        
        // Count DF legends
        const dfCount = thoughtsAll.filter(t => 
            t.tags && t.tags.includes('dwarf-fortress')
        ).length;
        document.getElementById('df-count').textContent = dfCount.toLocaleString();
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

async function loadTags() {
    try {
        const thoughts = await fetch(`${API_BASE}/thoughts`).then(r => r.json());
        thoughts.forEach(t => {
            if (t.tags) t.tags.forEach(tag => allTags.add(tag));
        });
    } catch (e) {
        console.error('Failed to load tags:', e);
    }
}

async function loadContext() {
    try {
        context = await fetch(`${API_BASE}/context`).then(r => r.json());
    } catch (e) {
        console.error('Failed to load context:', e);
    }
}

async function loadData() {
    try {
        thoughts = await fetch(`${API_BASE}/thoughts`).then(r => r.json());
        plans = await fetch(`${API_BASE}/plans`).then(r => r.json());
        render();
    } catch (e) {
        console.error('Failed to load data:', e);
    }
}

// === Event Listeners ===
function setupEventListeners() {
    // Search
    document.getElementById('search-input').addEventListener('input', debounce(e => {
        currentFilter.search = e.target.value.toLowerCase();
        render();
    }, 300));

    document.getElementById('search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            currentFilter.search = e.target.value.toLowerCase();
            render();
        }
    });

    // Type filter
    document.getElementById('type-filter').addEventListener('change', e => {
        currentFilter.type = e.target.value;
        render();
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            render();
        });
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
}

// === Rendering ===
function render() {
    const container = document.getElementById('cards-container');
    let items = [];

    if (currentTab === 'thoughts') {
        items = thoughts.filter(t => filterItem(t, 'thought'));
    } else if (currentTab === 'plans') {
        items = plans.filter(p => filterItem(p, 'plan'));
    } else if (currentTab === 'context') {
        // Context tab shows both
        const ctxThoughts = (context?.last10Thoughts || []).filter(t => filterItem(t, 'thought'));
        const ctxPlans = (context?.incompletePlans || []).filter(p => filterItem(p, 'plan'));
        items = [...ctxPlans.map(p => ({...p, _type: 'plan', _source: 'context'})), 
                 ...ctxThoughts.map(t => ({...t, _type: 'thought', _source: 'context'}))];
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${currentTab === 'thoughts' ? '💭' : '📋'}</div>
                <p class="empty-state-text">No ${currentTab} found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.slice(0, 50).map(item => renderCard(item)).join('');
    
    // Add click handlers
    container.querySelectorAll('.card').forEach((card, i) => {
        card.addEventListener('click', () => openModal(items[i]));
    });
}

function filterItem(item, type) {
    // Type filter
    if (currentFilter.type !== 'all' && currentFilter.type !== type) return false;
    
    // Search filter
    if (currentFilter.search) {
        const searchStr = (item.content || item.title || item.description || '').toLowerCase();
        if (!searchStr.includes(currentFilter.search)) return false;
    }
    
    // Tag filter
    if (currentFilter.tags.length > 0) {
        const itemTags = item.tags || [];
        if (!currentFilter.tags.some(tag => itemTags.includes(tag))) return false;
    }
    
    return true;
}

function renderCard(item) {
    const isThought = item._type === 'thought' || item.content !== undefined;
    const type = isThought ? 'thought' : 'plan';
    const title = isThought ? 
        (item.content ? item.content.substring(0, 60) + (item.content.length > 60 ? '...' : '') : 'Untitled') :
        (item.title || 'Untitled');
    const preview = isThought ? 
        (item.content || '') : 
        (item.description || '');
    const tags = item.tags || [];
    const timestamp = item.timestamp || item.created_at;
    const status = item.status;
    
    return `
        <div class="card">
            <span class="card-type ${type}">${type}</span>
            <h3 class="card-title">${escapeHtml(title)}</h3>
            <p class="card-preview">${escapeHtml(preview.substring(0, 150))}</p>
            <div class="card-footer">
                <span class="card-date">${formatDate(timestamp)}</span>
                <div class="card-tags">
                    ${status ? `<span class="status-badge ${status}">${status.replace('_', ' ')}</span>` : ''}
                    ${tags.slice(0, 3).map(tag => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderTags() {
    const container = document.getElementById('tag-filters');
    const sortedTags = Array.from(allTags).sort();
    
    container.innerHTML = sortedTags.slice(0, 15).map(tag => `
        <button class="tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join('');
    
    container.querySelectorAll('.tag-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const tag = pill.dataset.tag;
            if (currentFilter.tags.includes(tag)) {
                currentFilter.tags = currentFilter.tags.filter(t => t !== tag);
                pill.classList.remove('active');
            } else {
                currentFilter.tags.push(tag);
                pill.classList.add('active');
            }
            render();
        });
    });
}

// === Modal ===
function openModal(item) {
    const isThought = item._type === 'thought' || item.content !== undefined;
    const type = isThought ? 'thought' : 'plan';
    
    document.getElementById('modal-type').textContent = type;
    document.getElementById('modal-title').textContent = isThought ? 
        (item.content ? item.content.substring(0, 100) : 'Untitled') : 
        (item.title || 'Untitled');
    
    document.getElementById('modal-content').textContent = isThought ? 
        (item.content || '') : 
        (item.description || '');
    
    document.getElementById('modal-timestamp').textContent = formatDate(item.timestamp || item.created_at);
    
    // Status
    const statusRow = document.getElementById('modal-status-row');
    if (item.status) {
        statusRow.style.display = 'flex';
        document.getElementById('modal-status').textContent = item.status.replace('_', ' ');
        document.getElementById('modal-status').className = `status-badge ${item.status}`;
    } else {
        statusRow.style.display = 'none';
    }
    
    // Plan link
    const planRow = document.getElementById('modal-plan-row');
    if (item.plan_id) {
        planRow.style.display = 'flex';
        document.getElementById('modal-plan').textContent = `Plan #${item.plan_id}`;
    } else {
        planRow.style.display = 'none';
    }
    
    // Tags
    const tags = item.tags || [];
    document.getElementById('modal-tags').innerHTML = tags.map(tag => 
        `<span class="card-tag">${escapeHtml(tag)}</span>`
    ).join('');
    
    // Changelog
    const changelogRow = document.getElementById('modal-changelog');
    if (item.changelog && item.changelog.length > 0) {
        changelogRow.style.display = 'block';
        document.getElementById('modal-changelog-list').innerHTML = item.changelog.map(entry => 
            `<li>${escapeHtml(JSON.stringify(entry))}</li>`
        ).join('');
    } else {
        changelogRow.style.display = 'none';
    }
    
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// === Utilities ===
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}
