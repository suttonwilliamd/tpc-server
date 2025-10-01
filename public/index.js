document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize sql.js
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    });

    // Fetch the database file
    const response = await fetch('/tpc.db');
    if (!response.ok) {
      throw new Error('Failed to fetch database');
    }
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    // Query plans
    const plansRes = db.exec("SELECT * FROM plans ORDER BY created_at ASC");
    const plansList = document.getElementById('plans-list');
    if (plansRes.length > 0 && plansRes[0].values.length > 0) {
      const plans = plansRes[0].values.map(row => ({
        id: row[0],
        title: row[1],
        description: row[2],
        status: row[3],
        changelog: row[4],
        timestamp: row[5],
        created_at: row[6]
      }));
      plansList.innerHTML = plans.map(plan => 
        `<li><strong>${plan.title}</strong> (${plan.status})</li>`
      ).join('');
    } else {
      plansList.innerHTML = '<li>No plans yet</li>';
    }

    // Query thoughts
    const thoughtsRes = db.exec("SELECT * FROM thoughts ORDER BY timestamp ASC");
    const thoughtsList = document.getElementById('thoughts-list');
    if (thoughtsRes.length > 0 && thoughtsRes[0].values.length > 0) {
      const thoughts = thoughtsRes[0].values.map(row => ({
        id: row[0],
        timestamp: row[1],
        content: row[2],
        plan_id: row[3]
      }));
      thoughtsList.innerHTML = thoughts.map(thought => 
        `<li>${thought.content} <small>(${thought.timestamp})</small>${thought.plan_id ? ` (Plan: ${thought.plan_id})` : ''}</li>`
      ).join('');
    } else {
      thoughtsList.innerHTML = '<li>No thoughts yet</li>';
    }

    // Close the database
    db.close();
  } catch (error) {
    console.error('Error loading database:', error);
    document.getElementById('plans-list').innerHTML = '<li>Error loading data</li>';
    document.getElementById('thoughts-list').innerHTML = '<li>Error loading data</li>';
  }
});