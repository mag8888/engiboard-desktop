// EngiBoard · Performance seed script
// Paste this entire file into the DevTools Console of a running EngiBoard app.
// Generates 50 synthetic tasks across the 3 demo projects.
// Useful for L-06 (50 tasks render smoothly) and L-07 (PDF < 10s).

(function seedTasks() {
  if (typeof TASKS === 'undefined' || typeof PROJECTS === 'undefined') {
    console.error('TASKS or PROJECTS not in scope — open this in EngiBoard app DevTools.');
    return;
  }

  const titles = [
    'Frame weld at junction', 'Bearing replacement', 'V-belt tension check',
    'Servo motor calibration', 'Cable routing', 'Pneumatic line leak test',
    'Sensor alignment', 'Hydraulic pressure check', 'Encoder zero point reset',
    'Limit switch trigger test', 'Emergency stop verification', 'PLC ladder logic update',
    'Robot arm dry run', 'Tool changer calibration', 'Welding gas flow test',
    'Conveyor belt tracking', 'Roller bearing greasing', 'Coupling alignment',
    'Vibration baseline measurement', 'Thermal imaging scan',
  ];

  const statuses = [0, 1, 1, 1, 3, 4, 5, 6, 6, 7]; // weighted toward Done/InProgress
  const weeks = ['26W15', '26W16', '26W17', '26W18'];
  const projectIds = PROJECTS.map(p => p.id);
  const startCount = TASKS.length;

  for (let i = 1; i <= 50; i++) {
    const title = titles[Math.floor(Math.random() * titles.length)];
    const id = 'bench_' + Date.now() + '_' + i;
    TASKS.push({
      id,
      proj: projectIds[Math.floor(Math.random() * projectIds.length)],
      w: weeks[Math.floor(Math.random() * weeks.length)],
      s: statuses[Math.floor(Math.random() * statuses.length)],
      n: `${title} #${i} — auto-generated for benchmark`,
    });
  }

  if (typeof render === 'function') {
    const t0 = performance.now();
    render();
    const t1 = performance.now();
    console.log(`✓ Seeded 50 tasks. Render took ${(t1 - t0).toFixed(1)}ms (target: < 200ms for L-06)`);
  }

  if (typeof updateHeader === 'function') updateHeader();

  console.log(`Tasks now: ${TASKS.length} (was ${startCount})`);
  console.log('Run exportPDF() to time PDF export. Target: < 10000ms for L-07.');

  // Auto-time PDF export if user wants
  if (confirm('Run exportPDF() now and time it?')) {
    const t0 = performance.now();
    exportPDF()?.then?.(() => {
      const t1 = performance.now();
      console.log(`✓ PDF exported in ${((t1 - t0) / 1000).toFixed(2)}s (target: <10s for L-07)`);
    });
  }
})();

// To clean up:
// TASKS = TASKS.filter(t => !t.id.startsWith('bench_')); render();
