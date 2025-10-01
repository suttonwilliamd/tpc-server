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
        `<li><strong>${plan.title}</strong> (${plan.status})</li>`
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

  } catch (error) {
    console.error('Error loading data:', error);
    plansList.innerHTML = '<li>Failed to load</li>';
    thoughtsList.innerHTML = '<li>Failed to load</li>';
  }
});