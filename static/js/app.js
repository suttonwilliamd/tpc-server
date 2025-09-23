/**
 * TPC Server Interface - Client-side JavaScript
 * Enhanced with real-time updates and search functionality
 */

let authToken = null;
let pollingInterval = localStorage.getItem('tpcPollingInterval') ? parseInt(localStorage.getItem('tpcPollingInterval')) : 30000;

// Check URL param for polling
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('polling')) {
    pollingInterval = parseInt(urlParams.get('polling'));
    localStorage.setItem('tpcPollingInterval', pollingInterval.toString());
}

async function getAuthToken() {
    // Auth disabled for local server - no token needed
    console.log("Authentication disabled - no token required");
    return null;
}

class TPCApi {
    static async getRecentActivity() {
        try {
            const response = await fetch('/api/recent-activity');
            return await response.json();
        } catch (error) {
            console.error('Error fetching recent activity:', error);
            return [];
        }
    }

    static async getThoughts(page = 1, limit = 10) {
        try {
            const response = await fetch(`/api/thoughts?page=${page}&limit=${limit}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to fetch thoughts: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching thoughts:', error);
            return [];
        }
    }

    static async getPlans(page = 1, limit = 10) {
        try {
            const response = await fetch(`/api/plans?page=${page}&limit=${limit}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to fetch plans: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching plans:', error);
            return [];
        }
    }

    static async getChanges(page = 1, limit = 10) {
        try {
            const response = await fetch(`/api/changes?page=${page}&limit=${limit}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to fetch changes: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching changes:', error);
            return [];
        }
    }

    // New methods for enhanced functionality
    static async getUpdates(since = null) {
        try {
            let url = '/api/updates';
            if (since) {
                url += `?since=${since.toISOString()}`;
            }
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error fetching updates:', error);
            return { thoughts: [], plans: [], changes: [] };
        }
    }

    static async search(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            return await response.json();
        } catch (error) {
            console.error('Error searching:', error);
            return { thoughts: [], plans: [], changes: [] };
        }
    }

    static async createThought(content, planIds = []) {
        try {
            const response = await fetch('/api/thoughts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content, plan_ids: planIds, agent_signature: 'local_user' })  // Default for local
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to create thought: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error creating thought:', error);
            return { error: error.message };
        }
    }

    static async createPlan(title, description, thoughtIds = []) {
        try {
            const response = await fetch('/api/plans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, description, thought_ids: thoughtIds, agent_signature: 'local_user' })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to create plan: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error creating plan:', error);
            return { error: error.message };
        }
    }

    static async createChange(description, planId) {
        try {
            const response = await fetch('/api/changes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description, plan_id: planId, agent_signature: 'local_user' })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to create change: ${response.status} ${errorData.detail || 'Unknown error'}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error creating change:', error);
            return { error: error.message };
        }
    }
}

// Real-time update polling
class RealTimeUpdater {
    constructor(updateInterval = pollingInterval) {
        this.updateInterval = updateInterval;
        this.lastUpdateTime = new Date();
        this.isPolling = false;
        this.pollingInterval = null;
    }

    start() {
        if (this.isPolling) return;
        this.isPolling = true;
        this.pollingInterval = setInterval(() => this.pollUpdates(), this.updateInterval);
    }

    stop() {
        if (!this.isPolling) return;
        this.isPolling = false;
        clearInterval(this.pollingInterval);
    }

    async pollUpdates() {
        try {
            const updates = await TPCApi.getUpdates(this.lastUpdateTime);
            this.lastUpdateTime = new Date();
            
            if (updates.thoughts.length > 0 || updates.plans.length > 0 || updates.changes.length > 0) {
                this.handleUpdates(updates);
            }
        } catch (error) {
            console.error('Error polling updates:', error);
        }
    }

    handleUpdates(updates) {
        // Dispatch custom event for updates
        const event = new CustomEvent('tpc-update', { detail: updates });
        document.dispatchEvent(event);
        
        // Show notification
        this.showUpdateNotification(updates);
    }

    showUpdateNotification(updates) {
        const totalUpdates = updates.thoughts.length + updates.plans.length + updates.changes.length;
        if (totalUpdates > 0) {
            // Create Bootstrap toast notification
            const toast = document.createElement('div');
            toast.className = 'toast align-items-center text-white bg-primary border-0';
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('aria-atomic', 'true');
            
            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">
                        ${totalUpdates} new update(s) available
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            `;
            
            document.body.appendChild(toast);
            const bsToast = new bootstrap.Toast(toast);
            bsToast.show();
            
            // Remove toast after it's hidden
            toast.addEventListener('hidden.bs.toast', () => {
                document.body.removeChild(toast);
            });
        }
    }
}

// Search functionality
class SearchManager {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.init();
    }

    init() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.debounce(() => this.performSearch(), 300));
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        if (query.length < 2) {
            if (this.searchResults) {
                this.searchResults.style.display = 'none';
            }
            return;
        }

        const results = await TPCApi.search(query);
        this.displayResults(results);
    }

    displayResults(results) {
        if (!this.searchResults) return;
        
        let html = '';
        
        if (results.thoughts.length > 0) {
            html += '<h6>Thoughts</h6>';
            results.thoughts.forEach(thought => {
                html += `
                    <div class="search-result-item">
                        <strong>${thought.content.substring(0, 100)}...</strong>
                        <small class="text-muted">${new Date(thought.created_at).toLocaleString()}</small>
                    </div>
                `;
            });
        }
        
        if (results.plans.length > 0) {
            html += '<h6>Plans</h6>';
            results.plans.forEach(plan => {
                html += `
                    <div class="search-result-item">
                        <strong>${plan.title}</strong>
                        <br>
                        <small>${plan.description.substring(0, 100)}...</small>
                        <small class="text-muted">${new Date(plan.created_at).toLocaleString()}</small>
                    </div>
                `;
            });
        }
        
        if (results.changes.length > 0) {
            html += '<h6>Changes</h6>';
            results.changes.forEach(change => {
                html += `
                    <div class="search-result-item">
                        <strong>${change.description.substring(0, 100)}...</strong>
                        <small class="text-muted">${new Date(change.created_at).toLocaleString()}</small>
                    </div>
                `;
            });
        }

        if (html) {
            this.searchResults.innerHTML = html;
            this.searchResults.style.display = 'block';
        } else {
            this.searchResults.innerHTML = '<div class="text-muted">No results found</div>';
            this.searchResults.style.display = 'block';
        }
    }
}

// Modal management functions
async function loadPlansForSelection() {
    try {
        const plans = await TPCApi.getPlans();
        const selectElement = document.getElementById('thoughtPlans');
        const changePlanElement = document.getElementById('changePlan');
        
        if (selectElement) {
            selectElement.innerHTML = '';
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = plan.title;
                selectElement.appendChild(option);
            });
        }
        
        if (changePlanElement) {
            changePlanElement.innerHTML = '';
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = plan.title;
                changePlanElement.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading plans:', error);
    }
}

// Rich text toolbar functions
function addRichTextToolbar(modalId, contentId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const contentDiv = document.getElementById(contentId);
    if (!contentDiv) return;

    // Create toolbar if not exists
    let toolbar = modal.querySelector('.rich-text-toolbar');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'rich-text-toolbar mb-2';
        toolbar.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.execCommand('bold', false, null); focusContent('${contentId}');" title="Bold">B</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="document.execCommand('italic', false, null); focusContent('${contentId}');" title="Italic">I</button>
        `;
        contentDiv.parentNode.insertBefore(toolbar, contentDiv);
    }
}

function focusContent(contentId) {
    document.getElementById(contentId).focus();
}

// Context pre-populate for modals
function prePopulateContext() {
    // For change modal on plans page
    if (window.location.pathname.startsWith('/plans/')) {
        const planId = window.location.pathname.split('/').pop();
        const changePlanSelect = document.getElementById('changePlan');
        if (changePlanSelect && planId) {
            changePlanSelect.value = planId;
        }
    }
    // Add similar logic for other pages if needed (e.g., default plan on index)
}

async function loadThoughtsForSelection() {
    try {
        const thoughts = await TPCApi.getThoughts();
        const selectElement = document.getElementById('planThoughts');
        
        if (selectElement) {
            selectElement.innerHTML = '';
            thoughts.forEach(thought => {
                const option = document.createElement('option');
                option.value = thought.id;
                option.textContent = thought.content.substring(0, 50) + (thought.content.length > 50 ? '...' : '');
                selectElement.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading thoughts:', error);
    }
}

// Creation functions
async function createThought() {
    const submitBtn = document.querySelector('#createThoughtModal .btn-primary');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const contentDiv = document.getElementById('thoughtContent');
    const content = contentDiv.innerHTML.trim();
    const planSelect = document.getElementById('thoughtPlans');
    const planIds = Array.from(planSelect.selectedOptions).map(option => option.value);
    
    // Validation
    if (!content || content.length < 10) {
        alert('Thought content must be at least 10 characters long');
        contentDiv.focus();
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    if (planSelect && planSelect.hasAttribute('required') && planIds.length === 0) {
        alert('Please select at least one plan if required');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    
    try {
        const result = await TPCApi.createThought(content, planIds);
        if (result.error) {
            alert('Error creating thought: ' + result.error);
        } else {
            alert('Thought created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createThoughtModal')).hide();
            contentDiv.innerHTML = '';
            if (planSelect) planSelect.selectedIndex = -1;
            // Refresh current page if on thoughts page
            if (window.location.pathname === '/thoughts') {
                const urlParams = new URLSearchParams(window.location.search);
                const page = parseInt(urlParams.get('page')) || 1;
                const limit = 10;
                const data = await TPCApi.getThoughts(page, limit);
                const container = document.querySelector('.row');
                const generateCard = (thought) => `
                    <div class="col-md-6 mb-3">
                        <div class="card expandable">
                            <div class="card-header d-flex justify-content-between align-items-start">
                                <h6 class="mb-0">${thought.content.substring(0, 50)}${thought.content.length > 50 ? '...' : ''}</h6>
                                <button class="btn btn-sm btn-outline-secondary expand-btn">Expand</button>
                            </div>
                            <div class="card-body collapsed">
                                <p>${thought.content}</p>
                                <div class="metadata">
                                    <small class="text-muted">Created: ${new Date(thought.created_at).toLocaleString()} | By: ${thought.agent_signature}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML = data.map(generateCard).join('');
            }
            // Trigger poll for refresh
            if (window.updater) window.updater.pollUpdates();
        }
    } catch (error) {
        alert('Error creating thought: ' + error.message);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function createPlan() {
    const submitBtn = document.querySelector('#createPlanModal .btn-primary');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const title = document.getElementById('planTitle').value.trim();
    const descriptionDiv = document.getElementById('planDescription');
    const description = descriptionDiv.innerHTML.trim();
    const thoughtSelect = document.getElementById('planThoughts');
    const thoughtIds = Array.from(thoughtSelect.selectedOptions).map(option => option.value);
    
    // Validation
    if (!title) {
        alert('Please enter plan title');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    if (!description || description.length < 10) {
        alert('Plan description must be at least 10 characters long');
        descriptionDiv.focus();
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    
    try {
        const result = await TPCApi.createPlan(title, description, thoughtIds);
        if (result.error) {
            alert('Error creating plan: ' + result.error);
        } else {
            alert('Plan created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createPlanModal')).hide();
            document.getElementById('planTitle').value = '';
            descriptionDiv.innerHTML = '';
            if (thoughtSelect) thoughtSelect.selectedIndex = -1;
            // Refresh current page if on plans page
            if (window.location.pathname === '/plans') {
                const urlParams = new URLSearchParams(window.location.search);
                const page = parseInt(urlParams.get('page')) || 1;
                const limit = 10;
                const data = await TPCApi.getPlans(page, limit);
                const container = document.querySelector('.row');
                const generateCard = (plan) => `
                    <div class="col-md-6 mb-4">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-start">
                                <input type="checkbox" class="bulk-select" value="${plan.id}">
                                <h5 class="card-title mb-0 ms-2">${plan.title}</h5>
                            </div>
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">
                                    Version ${plan.version} | Status: <span class="badge bg-${plan.status === 'active' ? 'success' : 'warning'}">${plan.status}</span>
                                </h6>
                                <p class="card-text">${plan.description.substring(0, 200)}${plan.description.length > 200 ? '...' : ''}</p>
                                <a href="/plans/${plan.id}" class="card-link">View Details</a>
                            </div>
                            <div class="card-footer text-muted">
                                Created by ${plan.agent_signature} on ${new Date(plan.created_at).toLocaleString()}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML = data.map(generateCard).join('');
            }
            if (window.updater) window.updater.pollUpdates();
        }
    } catch (error) {
        alert('Error creating plan: ' + error.message);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function createChange() {
    const submitBtn = document.querySelector('#createChangeModal .btn-primary');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const descriptionDiv = document.getElementById('changeDescription');
    const description = descriptionDiv.innerHTML.trim();
    const planId = document.getElementById('changePlan').value;
    
    // Validation
    if (!description || description.length < 10) {
        alert('Change description must be at least 10 characters long');
        descriptionDiv.focus();
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    if (!planId) {
        alert('Please select a plan');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return;
    }
    
    try {
        const result = await TPCApi.createChange(description, planId);
        if (result.error) {
            alert('Error creating change: ' + result.error);
        } else {
            alert('Change created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createChangeModal')).hide();
            descriptionDiv.innerHTML = '';
            document.getElementById('changePlan').selectedIndex = 0;
            // Refresh current page if on changes page
            if (window.location.pathname === '/changes') {
                const urlParams = new URLSearchParams(window.location.search);
                const page = parseInt(urlParams.get('page')) || 1;
                const limit = 10;
                const data = await TPCApi.getChanges(page, limit);
                const container = document.querySelector('.row');
                const generateCard = (change) => `
                    <div class="col-md-6 mb-3">
                        <div class="card expandable">
                            <div class="card-header d-flex justify-content-between align-items-start">
                                <input type="checkbox" class="bulk-select" value="${change.id}">
                                <h6 class="mb-0 ms-2">${change.description.substring(0, 50)}${change.description.length > 50 ? '...' : ''}</h6>
                                <button class="btn btn-sm btn-outline-secondary expand-btn">Expand</button>
                            </div>
                            <div class="card-body collapsed">
                                <p>${change.description}</p>
                                ${change.plan_id ? `<p class="text-muted">Related to Plan: ${change.plan_title}</p>` : ''}
                                <div class="metadata">
                                    <small class="text-muted">Created: ${new Date(change.created_at).toLocaleString()} | By: ${change.agent_signature}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML = data.map(generateCard).join('');
            }
            if (window.updater) window.updater.pollUpdates();
        }
    } catch (error) {
        alert('Error creating change: ' + error.message);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

// Bulk operations
let selectedItems = [];

function initBulkOperations() {
    // Track selected items
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('bulk-select')) {
            const id = e.target.value;
            if (e.target.checked) {
                if (!selectedItems.includes(id)) {
                    selectedItems.push(id);
                }
            } else {
                selectedItems = selectedItems.filter(item => item !== id);
            }
            updateSelectedCount();
        }
    });

    // Bulk delete
    document.getElementById('bulkDelete')?.addEventListener('click', async function() {
        if (selectedItems.length === 0) {
            alert('Please select items to delete');
            return;
        }
        if (!confirm(`Delete ${selectedItems.length} selected items?`)) return;

        this.classList.add('loading');
        this.disabled = true;

        try {
            const token = await getAuthToken();
            const pathname = window.location.pathname;
            let endpoint;
            if (pathname === '/plans') endpoint = '/api/plans/bulk-delete';
            else if (pathname === '/thoughts') endpoint = '/api/thoughts/bulk-delete';
            else if (pathname === '/changes') endpoint = '/api/changes/bulk-delete';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: selectedItems })
            });

            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                selectedItems = [];
                updateSelectedCount();
                // Refresh page
                window.location.reload();
            } else {
                alert('Error: ' + result.detail);
            }
        } catch (error) {
            alert('Error deleting items: ' + error.message);
        } finally {
            this.classList.remove('loading');
            this.disabled = false;
        }
    });

    // Bulk export
    document.getElementById('bulkExport')?.addEventListener('click', async function() {
        if (selectedItems.length === 0) {
            alert('Please select items to export');
            return;
        }

        const format = confirm('Export as CSV? (Cancel for JSON)') ? 'csv' : 'json';

        this.classList.add('loading');
        this.disabled = true;

        try {
            const token = await getAuthToken();
            const pathname = window.location.pathname;
            let endpoint;
            if (pathname === '/plans') endpoint = '/api/plans/bulk-export';
            else if (pathname === '/thoughts') endpoint = '/api/thoughts/bulk-export';
            else if (pathname === '/changes') endpoint = '/api/changes/bulk-export';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: selectedItems, format: format })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.headers.get('content-disposition')?.split('filename=')[1] || `export.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } else {
                const result = await response.json();
                alert('Error: ' + result.detail);
            }
        } catch (error) {
            alert('Error exporting items: ' + error.message);
        } finally {
            this.classList.remove('loading');
            this.disabled = false;
        }
    });

    // Bulk assign
    document.getElementById('bulkAssign')?.addEventListener('click', async function() {
        if (selectedItems.length === 0) {
            alert('Please select items to assign');
            return;
        }

        const pathname = window.location.pathname;
        if (pathname === '/plans') {
            alert('Assign not available for plans');
            return;
        }

        // Get available plans
        const plans = await TPCApi.getPlans();
        if (plans.length === 0) {
            alert('No plans available for assignment');
            return;
        }

        const planOptions = plans.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
        const planId = prompt(`Select plan to assign ${selectedItems.length} items to:\n` +
            plans.map(p => `${p.id}: ${p.title}`).join('\n'));

        if (!planId) return;

        this.classList.add('loading');
        this.disabled = true;

        try {
            const token = await getAuthToken();
            let endpoint;
            if (pathname === '/thoughts') endpoint = '/api/thoughts/bulk-associate';
            else if (pathname === '/changes') endpoint = '/api/changes/bulk-associate';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ source_ids: selectedItems, target_ids: [planId] })
            });

            const result = await response.json();
            if (response.ok) {
                alert(result.message);
                selectedItems = [];
                updateSelectedCount();
                // Refresh page
                window.location.reload();
            } else {
                alert('Error: ' + result.detail);
            }
        } catch (error) {
            alert('Error assigning items: ' + error.message);
        } finally {
            this.classList.remove('loading');
            this.disabled = false;
        }
    });
}

function updateSelectedCount() {
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = `${selectedItems.length} selected`;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize real-time updater
    window.updater = new RealTimeUpdater();
    window.updater.start();

    // Initialize search manager
    const searchManager = new SearchManager();

    // Load data for modal selections
    loadPlansForSelection();
    loadThoughtsForSelection();

    // Listen for update events
    document.addEventListener('tpc-update', (event) => {
        console.log('New updates received:', event.detail);
        // Refresh selections when updates occur
        loadPlansForSelection();
        loadThoughtsForSelection();
    });

    // Pagination logic
    document.addEventListener('click', async function(e) {
        if (e.target.classList.contains('page-link') && e.target.dataset.page) {
            e.preventDefault();
            const page = parseInt(e.target.dataset.page);
            const limit = 10; // default
            const link = e.target;
            link.classList.add('loading');
            link.style.pointerEvents = 'none';

            try {
                let data, container, generateCard;
                const pathname = window.location.pathname;

                if (pathname === '/thoughts') {
                    data = await TPCApi.getThoughts(page, limit);
                    container = document.querySelector('.row');
                    generateCard = (thought) => `
                        <div class="col-md-6 mb-3">
                            <div class="card expandable">
                                <div class="card-header d-flex justify-content-between align-items-start">
                                    <input type="checkbox" class="bulk-select" value="${thought.id}">
                                    <h6 class="mb-0 ms-2">${thought.content.substring(0, 50)}${thought.content.length > 50 ? '...' : ''}</h6>
                                    <button class="btn btn-sm btn-outline-secondary expand-btn">Expand</button>
                                </div>
                                <div class="card-body collapsed">
                                    <p>${thought.content}</p>
                                    <div class="metadata">
                                        <small class="text-muted">Created: ${new Date(thought.created_at).toLocaleString()} | By: ${thought.agent_signature}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (pathname === '/plans') {
                    data = await TPCApi.getPlans(page, limit);
                    container = document.querySelector('.row');
                    generateCard = (plan) => `
                        <div class="col-md-6 mb-4">
                            <div class="card">
                                <div class="card-header d-flex justify-content-between align-items-start">
                                    <input type="checkbox" class="bulk-select" value="${plan.id}">
                                    <h5 class="card-title mb-0 ms-2">${plan.title}</h5>
                                </div>
                                <div class="card-body">
                                    <h6 class="card-subtitle mb-2 text-muted">
                                        Version ${plan.version} | Status: <span class="badge bg-${plan.status === 'active' ? 'success' : 'warning'}">${plan.status}</span>
                                    </h6>
                                    <p class="card-text">${plan.description.substring(0, 200)}${plan.description.length > 200 ? '...' : ''}</p>
                                    <a href="/plans/${plan.id}" class="card-link">View Details</a>
                                </div>
                                <div class="card-footer text-muted">
                                    Created by ${plan.agent_signature} on ${new Date(plan.created_at).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    `;
                } else if (pathname === '/changes') {
                    data = await TPCApi.getChanges(page, limit);
                    container = document.querySelector('.row');
                    generateCard = (change) => `
                        <div class="col-md-6 mb-3">
                            <div class="card expandable">
                                <div class="card-header d-flex justify-content-between align-items-start">
                                    <input type="checkbox" class="bulk-select" value="${change.id}">
                                    <h6 class="mb-0 ms-2">${change.description.substring(0, 50)}${change.description.length > 50 ? '...' : ''}</h6>
                                    <button class="btn btn-sm btn-outline-secondary expand-btn">Expand</button>
                                </div>
                                <div class="card-body collapsed">
                                    <p>${change.description}</p>
                                    ${change.plan_id ? `<p class="text-muted">Related to Plan: ${change.plan_title}</p>` : ''}
                                    <div class="metadata">
                                        <small class="text-muted">Created: ${new Date(change.created_at).toLocaleString()} | By: ${change.agent_signature}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                if (data && container && generateCard) {
                    container.innerHTML = data.map(generateCard).join('');
                    // Update URL without reload
                    const url = new URL(window.location);
                    url.searchParams.set('page', page);
                    window.history.replaceState({}, '', url);
                    // Update pagination active state
                    document.querySelectorAll('.page-item').forEach(li => li.classList.remove('active'));
                    document.querySelector(`[data-page="${page}"]`).parentElement.classList.add('active');
                }
            } catch (error) {
                console.error('Error loading page:', error);
                alert('Failed to load page');
            } finally {
                link.classList.remove('loading');
                link.style.pointerEvents = 'auto';
            }
        }
    });

    // Add modal show event listeners to refresh data and setup rich text
    document.getElementById('createThoughtModal').addEventListener('show.bs.modal', function() {
        loadPlansForSelection();
        addRichTextToolbar('createThoughtModal', 'thoughtContent');
        prePopulateContext();
    });
    document.getElementById('createPlanModal').addEventListener('show.bs.modal', function() {
        loadThoughtsForSelection();
        addRichTextToolbar('createPlanModal', 'planDescription');
        prePopulateContext();
    });
    document.getElementById('createChangeModal').addEventListener('show.bs.modal', function() {
        loadPlansForSelection();
        addRichTextToolbar('createChangeModal', 'changeDescription');
        prePopulateContext();
    });

    // Enhanced detail views: Expandable cards
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('expand-btn') || e.target.closest('.card-header')) {
            const card = e.target.closest('.card.expandable');
            const body = card.querySelector('.card-body');
            const btn = card.querySelector('.expand-btn');
            if (body && btn) {
                body.classList.toggle('collapsed');
                btn.textContent = body.classList.contains('collapsed') ? 'Expand' : 'Collapse';
            }
        }
    });

    // Relationship visualization for plan_detail
    if (document.getElementById('relationshipTree')) {
        renderRelationshipTree();
    }

    // Bulk operations logic
    initBulkOperations();
});

// Simple relationship tree rendering (vanilla JS canvas)
function renderRelationshipTree() {
    const treeContainer = document.getElementById('relationshipTree');
    if (!treeContainer) return;

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    canvas.style.border = '1px solid #ccc';
    canvas.style.display = 'block';
    canvas.style.margin = '20px 0';
    treeContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get data from global or data attrs - for demo, hardcode; in real, use window.planData or fetch
    const plan = { id: '{{ plan.id }}', title: '{{ plan.title }}', x: 400, y: 50 };
    const thoughts = window.planData.thoughts || [];
    const changes = window.planData.changes || [];

    // Draw nodes
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(plan.x, plan.y, 20, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(plan.title, plan.x, plan.y - 25);

    thoughts.forEach(t => {
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(t.title, t.x, t.y - 20);
    });

    changes.forEach(c => {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText(c.title, c.x, c.y - 20);
    });

    // Draw edges
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Plan to thoughts
    thoughts.forEach(t => {
        ctx.moveTo(plan.x, plan.y + 20);
        ctx.lineTo(t.x, t.y - 15);
    });
    // Plan to changes
    changes.forEach(c => {
        ctx.moveTo(plan.x, plan.y + 20);
        ctx.lineTo(c.x, c.y - 15);
    });
    ctx.stroke();
}