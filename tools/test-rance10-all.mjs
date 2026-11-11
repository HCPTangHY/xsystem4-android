// Run the core Rance 10 regression suites; device gameplay is a separate check.
// Array generates a shared C harness, so dependent suites run sequentially.
const suites=['vm','vm-refs','calls','array','mainex','assets','savedata','messages','message-entry','controllers','ordering','layout','input','format','string','error-report','ui-resources','save-paths','stale-input','regex','hll-exports','atomic-save','load-input','delegates'];
for (const name of suites) {
  await import(`./test-rance10-${name}.mjs`);
}
console.log(`PASS: all ${suites.length} core Rance 10 local regression suites. Android gameplay still requires device verification.`);
