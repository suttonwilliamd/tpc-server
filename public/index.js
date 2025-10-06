document.addEventListener('DOMContentLoaded', async () => {
  // Initialize components
  if (window.ButtonComponent) new window.ButtonComponent();
  if (window.InputComponent) new window.InputComponent();
  if (window.CardComponent) new window.CardComponent();

  const plansList = document.getElementById('plans-list');
  const thoughtsList = document.getElementById('thoughts-list');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const tagFilterInput = document.getElementById('tag-filter');
  const clearSearchBtn = document.getElementById('clear-search');
  const clearFilterBtn = document.getElementById('clear-filter');

  let currentSearch = '';
  let currentTagFilter = '';
  let currentPlanId = null;
  let currentThoughtId = null;
  let currentTags = [];

  // Theme management
  const themeToggle = document.createElement('button');
  themeToggle.id = 'theme-toggle';
  themeToggle.setAttribute('data-component', 'button');
  themeToggle.setAttribute('data-variant', 'ghost');
  themeToggle.textContent = 'Toggle Theme';
  document.body.appendChild(themeToggle);

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.textContent = newTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  initTheme();
  themeToggle.addEventListener('click', toggleTheme);

  // Media query listener for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      themeToggle.textContent = e.matches ? 'Light Mode' : 'Dark Mode';
    }
  });

  // Function to load lists with optional tag filter
  async function loadLists(tagFilter = '') {
    console.log('loadLists called with tagFilter:', tagFilter);
    const url = tagFilter ? `/plans?tags=${encodeURIComponent(tagFilter)}` : '/plans';
    const thoughtsUrl = tagFilter ? `/thoughts?tags=${encodeURIComponent(tagFilter)}` : '/thoughts';
    console.log('Fetching from:', url, thoughtsUrl);
  
    // Set loading state
    plansList.innerHTML = '<div data-component="card"><div class="card-body">Loading...</div></div>';
    thoughtsList.innerHTML = '<div data-component="card"><div class="card-body">Loading...</div></div>';
  
    try {
      console.log('Starting Promise.all fetch');
      const [plansResponse, thoughtsResponse] = await Promise.all([
        fetch(url),
        fetch(thoughtsUrl)
      ]);
      console.log('Fetch completed. Plans response ok:', plansResponse.ok, 'status:', plansResponse.status);
      console.log('Thoughts response ok:', thoughtsResponse.ok, 'status:', thoughtsResponse.status);
  
      if (!plansResponse.ok) {
        throw new Error(`Failed to fetch plans: ${plansResponse.status}`);
      }
      if (!thoughtsResponse.ok) {
        throw new Error(`Failed to fetch thoughts: ${thoughtsResponse.status}`);
      }
  
      console.log('Parsing JSON for plans');
      const plans = await plansResponse.json();
      console.log('Plans parsed, length:', plans.length, 'first plan:', plans[0]);
      console.log('Parsing JSON for thoughts');
      const thoughts = await thoughtsResponse.json();
      console.log('Thoughts parsed, length:', thoughts.length, 'first thought:', thoughts[0]);
  
      // Render plans as cards
      console.log('Rendering plans');
      if (plans.length > 0) {
        const planHtml = plans.map(plan => {
          const tagsStr = plan.tags && plan.tags.length > 0 ? plan.tags.join(', ') : '';
          return `
            <div data-component="card" 
                 data-type="plan" 
                 data-title="${plan.title}" 
                 data-status="${plan.status}" 
                 data-tags="${tagsStr}" 
                 data-description="${(plan.description || '').substring(0, 100)}..." 
                 data-plan-id="${plan.id}"
                 tabindex="0"
                 role="button"
                 aria-label="View plan: ${plan.title}">
              <!-- Card structure will be initialized by Card component -->
            </div>
          `;
        }).join('');
        plansList.innerHTML = planHtml;
      } else {
        plansList.innerHTML = '<div data-component="card"><div class="card-body">No plans yet</div></div>';
      }
  
      // Render thoughts as cards
      console.log('Rendering thoughts');
      if (thoughts.length > 0) {
        const thoughtHtml = thoughts.map(thought => {
          const tagsStr = thought.tags && thought.tags.length > 0 ? thought.tags.join(', ') : '';
          const shortContent = (thought.content || '').substring(0, 100) + '...';
          return `
            <div data-component="card" 
                 data-type="thought" 
                 data-title="${thought.content.substring(0, 50)}..." 
                 data-description="${shortContent}" 
                 data-tags="${tagsStr}" 
                 data-thought-id="${thought.id}"
                 data-plan-id="${thought.plan_id || ''}"
                 tabindex="0"
                 role="button"
                 aria-label="View thought: ${thought.content.substring(0, 50)}">
              <!-- Card structure will be initialized by Card component -->
            </div>
          `;
        }).join('');
        thoughtsList.innerHTML = thoughtHtml;
      } else {
        thoughtsList.innerHTML = '<div data-component="card"><div class="card-body">No thoughts yet</div></div>';
      }
  
      // Initialize components after rendering
      if (window.CardComponent) new window.CardComponent();
  
      console.log('Adding click listeners');
      // Add click listeners for plans and thoughts
      document.querySelectorAll('#plans-list [data-plan-id]').forEach(el => addPlanClickListener(el));
      document.querySelectorAll('#thoughts-list [data-thought-id]').forEach(el => addThoughtClickListener(el));
      console.log('Listeners added. Plans count:', document.querySelectorAll('#plans-list [data-plan-id]').length);
  
    } catch (error) {
      console.error('Error loading data details:', error.message);
      if (error.stack) console.error('Stack:', error.stack);
      plansList.innerHTML = '<div data-component="card"><div class="card-body">Failed to load</div></div>';
      thoughtsList.innerHTML = '<div data-component="card"><div class="card-body">Failed to load</div></div>';
    }
  }

  // Initial load
  loadLists();

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
      currentSearch = e.target.value.trim();
      if (currentSearch.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`/search?q=${encodeURIComponent(currentSearch)}&type=all&limit=20`);
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        const results = await response.json();

        if (results.length > 0) {
          const searchHtml = results.map(result => {
            const tagsStr = result.tags.join(', ');
            const shortContent = (result.content || '').substring(0, 100) + '...';
            const title = result.title || result.content.substring(0, 50) + '...';
            return `
              <div data-component="card" 
                   data-type="${result.type}" 
                   data-title="${title}" 
                   data-description="${shortContent}" 
                   data-tags="${tagsStr}" 
                   ${result.type === 'plan' ? `data-plan-id="${result.id}"` : `data-thought-id="${result.id}"`}
                   tabindex="0"
                   role="button"
                   aria-label="View ${result.type}: ${title}">
              </div>
            `;
          }).join('');
          searchResults.innerHTML = searchHtml;
          searchResults.style.display = 'block';
          // Initialize components
          if (window.CardComponent) new window.CardComponent();
          // Add click listeners for search results
          document.querySelectorAll('#search-results [data-plan-id]').forEach(el => addPlanClickListener(el));
          document.querySelectorAll('#search-results [data-thought-id]').forEach(el => addThoughtClickListener(el));
        } else {
          searchResults.innerHTML = '<div data-component="card"><div class="card-body">No results found</div></div>';
          searchResults.style.display = 'block';
        }
      } catch (error) {
        console.error('Search error:', error);
        searchResults.innerHTML = '<div data-component="card"><div class="card-body">Search failed</div></div>';
        searchResults.style.display = 'block';
      }
    });
  }

  // Tag filter functionality
  if (tagFilterInput) {
    tagFilterInput.addEventListener('input', (e) => {
      currentTagFilter = e.target.value.trim();
      if (currentTagFilter) {
        loadLists(currentTagFilter);
      } else {
        loadLists();
      }
    });
  }

  // Clear buttons
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchResults.style.display = 'none';
      currentSearch = '';
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      if (tagFilterInput) tagFilterInput.value = '';
      loadLists();
      currentTagFilter = '';
    });
  }

  // Function to add plan click listener
  function addPlanClickListener(el) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', async () => {
      const planId = el.dataset.planId;
      
      // Hide main sections and search
      document.querySelectorAll('main section').forEach(section => {
        section.style.display = 'none';
      });
      searchResults.style.display = 'none';
      
      // Show detail panel
      const detailPanel = document.getElementById('detail-panel');
      detailPanel.style.display = 'block';
      document.getElementById('detail-type').textContent = 'Plan';
      
      // Set loading state
      loadPlanDetails(planId);
    });

    // Keyboard support
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  }

  // Function to add thought click listener
  function addThoughtClickListener(el) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', async () => {
      const thoughtId = el.dataset.thoughtId;
      
      // Hide main sections and search
      document.querySelectorAll('main section').forEach(section => {
        section.style.display = 'none';
      });
      searchResults.style.display = 'none';
      
      // Show detail panel
      const detailPanel = document.getElementById('detail-panel');
      detailPanel.style.display = 'block';
      document.getElementById('detail-type').textContent = 'Thought';
      
      // Set loading state
      loadThoughtDetails(thoughtId);
    });

    // Keyboard support
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  }

  // Function to load plan details
  async function loadPlanDetails(planId) {
    document.getElementById('detail-title').textContent = 'Loading...';
    document.getElementById('detail-content').textContent = '';
    document.getElementById('detail-status').textContent = '';
    document.getElementById('changelog-list').innerHTML = '<li>Loading...</li>';
    document.getElementById('linked-thoughts-list').innerHTML = '<li>Loading...</li>';
    document.getElementById('tags-list').innerHTML = '<li>Loading...</li>';
    document.getElementById('add-tag-input').value = '';
    
    try {
      // Fetch plan details
      const planResponse = await fetch(`/plans/${planId}`);
      if (!planResponse.ok) {
        throw new Error(`Failed to fetch plan: ${planResponse.status}`);
      }
      const plan = await planResponse.json();
      
      // Render plan info
      document.getElementById('detail-title').textContent = plan.title;
      const contentElement = document.getElementById('detail-content');
      if (typeof marked !== 'undefined' && plan.description) {
        contentElement.innerHTML = marked.parse(plan.description);
      } else {
        contentElement.textContent = plan.description || 'No description';
      }
      const statusEl = document.getElementById('detail-status').querySelector('span');
      statusEl.textContent = plan.status;
      document.getElementById('detail-status').style.display = 'block';
      
      currentPlanId = planId;
      currentTags = plan.tags || [];
      
      // Render tags
      const tagsList = document.getElementById('tags-list');
      if (plan.tags && plan.tags.length > 0) {
        const tagsHtml = plan.tags.map(tag =>
          `<span class="tag"><span class="tag-text">${tag}</span><button data-component="button" data-variant="ghost" data-size="sm" class="remove-tag" data-tag="${tag}" aria-label="Remove tag ${tag}">×</button></span>`
        ).join(' ');
        tagsList.innerHTML = tagsHtml;
        // Initialize buttons
        if (window.ButtonComponent) new window.ButtonComponent();
        // Add remove listeners
        document.querySelectorAll('.remove-tag').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tag = e.target.dataset.tag;
            await updateTags(planId, 'plan', { remove: [tag] });
            loadPlanDetails(planId); // Reload
          });
        });
      } else {
        tagsList.innerHTML = '<li>No tags</li>';
      }
      
      // Render changelog
      const changelogList = document.getElementById('changelog-list');
      if (plan.changelog && plan.changelog.length > 0) {
        changelogList.innerHTML = plan.changelog.map(change =>
          `<li>${change.change} <small>(${change.timestamp})</small></li>`
        ).join('');
      } else {
        changelogList.innerHTML = '<li>No changelog entries</li>';
      }
      
      // Fetch and render linked thoughts
      const thoughtsResponse = await fetch(`/plans/${planId}/thoughts`);
      if (!thoughtsResponse.ok) {
        throw new Error(`Failed to fetch thoughts: ${thoughtsResponse.status}`);
      }
      const linkedThoughts = await thoughtsResponse.json();
      
      const linkedThoughtsList = document.getElementById('linked-thoughts-list');
      if (linkedThoughts.length > 0) {
        const thoughtsHtml = linkedThoughts.map(thought =>
          `<li data-thought-id="${thought.id}">${thought.content} <small>(${thought.timestamp})</small> ${thought.tags && thought.tags.length > 0 ? `<small>Tags: ${thought.tags.join(', ')}</small>` : ''}</li>`
        ).join('');
        linkedThoughtsList.innerHTML = thoughtsHtml;
        // Add click listeners for linked thoughts
        document.querySelectorAll('#linked-thoughts-list li[data-thought-id]').forEach(li => addThoughtClickListener(li));
      } else {
        linkedThoughtsList.innerHTML = '<li>No linked thoughts</li>';
      }
      
    } catch (error) {
      console.error('Error loading plan details:', error);
      document.getElementById('detail-title').textContent = 'Error loading plan details';
      document.getElementById('detail-content').textContent = error.message;
      document.getElementById('changelog-list').innerHTML = '<li>Error loading changelog</li>';
      document.getElementById('linked-thoughts-list').innerHTML = '<li>Error loading thoughts</li>';
      document.getElementById('tags-list').innerHTML = '<li>Error loading tags</li>';
    }
  }

  // Function to load thought details
  async function loadThoughtDetails(thoughtId) {
    document.getElementById('detail-title').textContent = 'Loading...';
    document.getElementById('detail-content').textContent = '';
    document.getElementById('detail-status').style.display = 'none';
    document.getElementById('changelog-list').innerHTML = '<li>N/A for thoughts</li>';
    document.getElementById('linked-thoughts-list').innerHTML = '<li>N/A for thoughts</li>';
    document.getElementById('tags-list').innerHTML = '<li>Loading...</li>';
    document.getElementById('add-tag-input').value = '';
    
    try {
      const response = await fetch(`/thoughts/${thoughtId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch thought: ${response.status}`);
      }
      const thought = await response.json();
      
      // Render thought info
      document.getElementById('detail-title').textContent = 'Thought';
      const contentElement = document.getElementById('detail-content');
      if (typeof marked !== 'undefined' && thought.content) {
        contentElement.innerHTML = marked.parse(thought.content);
      } else {
        contentElement.textContent = thought.content || 'No content';
      }
      document.getElementById('detail-status').style.display = 'none';
      
      currentThoughtId = thoughtId;
      currentTags = thought.tags || [];
      
      // Render tags
      const tagsList = document.getElementById('tags-list');
      if (thought.tags && thought.tags.length > 0) {
        const tagsHtml = thought.tags.map(tag =>
          `<span class="tag"><span class="tag-text">${tag}</span><button data-component="button" data-variant="ghost" data-size="sm" class="remove-tag" data-tag="${tag}" aria-label="Remove tag ${tag}">×</button></span>`
        ).join(' ');
        tagsList.innerHTML = tagsHtml;
        // Initialize buttons
        if (window.ButtonComponent) new window.ButtonComponent();
        // Add remove listeners
        document.querySelectorAll('.remove-tag').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tag = e.target.dataset.tag;
            await updateTags(thoughtId, 'thought', { remove: [tag] });
            loadThoughtDetails(thoughtId); // Reload
          });
        });
      } else {
        tagsList.innerHTML = '<li>No tags</li>';
      }
      
      document.getElementById('changelog-list').innerHTML = '<li>No changelog for thoughts</li>';
      document.getElementById('linked-thoughts-list').innerHTML = '<li>No linked items for thoughts</li>';
      
    } catch (error) {
      console.error('Error loading thought details:', error);
      document.getElementById('detail-title').textContent = 'Error loading thought details';
      document.getElementById('detail-content').textContent = error.message;
      document.getElementById('tags-list').innerHTML = '<li>Error loading tags</li>';
    }
  }

  // Function to update tags
  async function updateTags(id, type, body) {
    const url = type === 'plan' ? `/plans/${id}/tags` : `/thoughts/${id}/tags`;
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(`Failed to update tags: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error updating tags:', error);
      alert('Failed to update tags');
    }
  }

  // Add tag functionality
  document.getElementById('add-tag-btn').addEventListener('click', async () => {
    const input = document.getElementById('add-tag-input');
    const newTag = input.value.trim().toLowerCase();
    if (newTag && !currentTags.includes(newTag)) {
      const type = document.getElementById('detail-type').textContent.toLowerCase();
      const id = type === 'plan' ? currentPlanId : currentThoughtId;
      await updateTags(id, type, { add: [newTag] });
      input.value = '';
      if (type === 'plan') {
        loadPlanDetails(id);
      } else {
        loadThoughtDetails(id);
      }
    }
  });

  // Back button functionality
  document.getElementById('back-button').addEventListener('click', () => {
    document.getElementById('detail-panel').style.display = 'none';
    document.querySelectorAll('main section').forEach(section => {
      section.style.display = 'block';
    });
    searchResults.style.display = 'none';
    loadLists(currentTagFilter);
  });

  // Re-initialize components on dynamic updates if needed
  document.addEventListener('DOMContentLoaded', () => {
    if (window.ButtonComponent) new window.ButtonComponent();
    if (window.InputComponent) new window.InputComponent();
    if (window.CardComponent) new window.CardComponent();
  });
});