/**
 * TPC Server Interface - Client-side JavaScript
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Add any additional initialization here
});