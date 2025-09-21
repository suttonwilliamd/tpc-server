/**
 * TPC Server Interface - Client-side JavaScript
 * Enhanced with real-time updates and search functionality
 */

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

    static async getThoughts() {
        try {
            const response = await fetch('/api/thoughts');
            return await response.json();
        } catch (error) {
            console.error('Error fetching thoughts:', error);
            return [];
        }
    }

    static async getPlans() {
        try {
            const response = await fetch('/api/plans');
            return await response.json();
        } catch (error) {
            console.error('Error fetching plans:', error);
            return [];
        }
    }

    static async getChanges() {
        try {
            const response = await fetch('/api/changes');
            return await response.json();
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
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content, plan_ids: planIds })
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating thought:', error);
            return { error: 'Failed to create thought' };
        }
    }

    static async createPlan(title, description, thoughtIds = []) {
        try {
            const response = await fetch('/api/plans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, description, thought_ids: thoughtIds })
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating plan:', error);
            return { error: 'Failed to create plan' };
        }
    }

    static async createChange(description, planId) {
        try {
            const response = await fetch('/api/changes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ description, plan_id: planId })
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating change:', error);
            return { error: 'Failed to create change' };
        }
    }
}

// Real-time update polling
class RealTimeUpdater {
    constructor(updateInterval = 5000) {
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize real-time updater
    const updater = new RealTimeUpdater();
    updater.start();

    // Initialize search manager
    const searchManager = new SearchManager();

    // Listen for update events
    document.addEventListener('tpc-update', (event) => {
        console.log('New updates received:', event.detail);
        // You can add custom handling for updates here
        // For example, refresh the current page content
    });

    // Add any additional initialization here
});