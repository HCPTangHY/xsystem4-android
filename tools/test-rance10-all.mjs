// Run the core Rance 10 regression suites; device gameplay is a separate check.
// Array generates a shared C harness, so dependent suites run sequentially.
for (const name of ['vm','vm-refs','calls','array','mainex','assets','savedata','messages','message-entry','controllers','ordering','layout','input','format','string','error-report','ui-resources','save-paths','stale-input','regex','hll-exports']) {
  await import(`./test-rance10-${name}.mjs`);
}
console.log('PASS: all 21 core Rance 10 local regression suites. Android gameplay still requires device verification.');
