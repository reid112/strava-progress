import './fonts';
import './legacy/report.css';
import body from './legacy/report.body.html?raw';
import { renderReport } from './legacy/report';

/**
 * Phase 1, step 2: render the reference page from the fixture.
 * In dev, `?fixture` loads reference/data.json straight from the project root.
 */
async function main() {
  const app = document.getElementById('app')!;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
    const res = await fetch('/reference/data.json');
    const D = await res.json();
    app.innerHTML = body;
    renderReport(D);
    return;
  }
  app.innerHTML = '<p style="padding:24px">Open with <code>?fixture</code> in dev to render the reference data.</p>';
}
main();
