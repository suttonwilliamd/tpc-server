document.addEventListener('DOMContentLoaded', async () => {
  const plansList = document.getElementById('plans-list');
  const thoughtsList = document.getElementById('thoughts-list');

  // Set loading state
  plansList.innerHTML = '<li>Loading...</li>';
  thoughtsList.innerHTML = '<li>Loading...</li>';

  try {
    // Fetch plans and thoughts in parallel
    const [plansResponse, thoughtsResponse] = await Promise.all([
      fetch('/plans'),
      fetch('/thoughts')
    ]);

    if (!plansResponse.ok) {
      throw new Error(`Failed to fetch plans: ${plansResponse.status}`);
    }
    if (!thoughtsResponse.ok) {
      throw new Error(`Failed to fetch thoughts: ${thoughtsResponse.status}`);
    }

    const plans = await plansResponse.json();
    const thoughts = await thoughtsResponse.json();

    // Render plans
    if (plans.length > 0) {
      plansList.innerHTML = plans.map(plan =>
        `<li data-plan-id="${plan.id}"><strong>${plan.title}</strong> (${plan.status})</li>`
      ).join('');
    } else {
      plansList.innerHTML = '<li>No plans yet</li>';
    }

    // Render thoughts
    if (thoughts.length > 0) {
      thoughtsList.innerHTML = thoughts.map(thought =>
        `<li>${thought.content} <small>(${thought.timestamp})</small>${thought.plan_id ? ` (Plan: ${thought.plan_id})` : ''}</li>`
      ).join('');
    } else {
      thoughtsList.innerHTML = '<li>No thoughts yet</li>';
    }

    // Add click listeners for plans
    document.querySelectorAll('#plans-list li[data-plan-id]').forEach(li => {
      li.style.cursor = 'pointer';
      li.addEventListener('click', async () => {
        const planId = li.dataset.planId;
        
        // Hide main sections
        document.querySelectorAll('section').forEach(section => {
          section.style.display = 'none';
        });
        
        // Show detail panel
        const detailPanel = document.getElementById('detail-panel');
        detailPanel.style.display = 'block';
        
        // Set loading state
        document.getElementById('plan-title').textContent = 'Loading...';
        document.getElementById('plan-description').textContent = '';
        document.getElementById('plan-status').textContent = '';
        document.getElementById('changelog-list').innerHTML = '<li>Loading...</li>';
        document.getElementById('thoughts-list-detail').innerHTML = '<li>Loading...</li>';
        
        try {
          // Fetch plan details
          const planResponse = await fetch(`/plans/${planId}`);
          if (!planResponse.ok) {
            throw new Error(`Failed to fetch plan: ${planResponse.status}`);
          }
          const plan = await planResponse.json();
          
          // Render plan info
          document.getElementById('plan-title').textContent = plan.title;
          const descElement = document.getElementById('plan-description');
          if (typeof marked !== 'undefined' && plan.description) {
            descElement.innerHTML = marked.parse(plan.description);
          } else {
            descElement.textContent = plan.description || 'No description';
          }
          document.getElementById('plan-status').textContent = plan.status;
          
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
          
          const thoughtsDetailList = document.getElementById('thoughts-list-detail');
          if (linkedThoughts.length > 0) {
            thoughtsDetailList.innerHTML = linkedThoughts.map(thought =>
              `<li>${thought.content} <small>(${thought.timestamp})</small></li>`
            ).join('');
          } else {
            thoughtsDetailList.innerHTML = '<li>No linked thoughts</li>';
          }
          
        } catch (error) {
          console.error('Error loading plan details:', error);
          document.getElementById('plan-title').textContent = 'Error loading plan details';
          document.getElementById('plan-description').textContent = error.message;
          document.getElementById('changelog-list').innerHTML = '<li>Error loading changelog</li>';
          document.getElementById('thoughts-list-detail').innerHTML = '<li>Error loading thoughts</li>';
        }
      });
    });
    
    // Back button functionality
    document.getElementById('back-button').addEventListener('click', () => {
      document.getElementById('detail-panel').style.display = 'none';
      document.querySelectorAll('section').forEach(section => {
        section.style.display = 'block';
      });
    });

  } catch (error) {
    console.error('Error loading data:', error);
    plansList.innerHTML = '<li>Failed to load</li>';
    thoughtsList.innerHTML = '<li>Failed to load</li>';
  }
});