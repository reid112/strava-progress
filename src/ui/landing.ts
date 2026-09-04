export function renderLanding(root: HTMLElement, onFile: (f: File) => void, error?: string) {
  root.innerHTML = `
  <div class="landing">
    <h1>Your running, from your Strava export.</h1>
    <p class="lede">Drop in the zip Strava emails you and get a progress page: how far you've come, records, volume, habits, the other sports, and a projection of where it could go.</p>
    ${error ? `<div class="err">${error}</div>` : ''}
    <label class="drop" id="drop">
      <strong>Drop your export_&lt;id&gt;.zip here</strong>
      <span>or click to choose it. A few hundred megabytes is normal; it never uploads. A page-data JSON saved from here works too.</span>
      <input type="file" id="file" accept=".zip,.json,application/zip,application/json">
    </label>
    <div class="privacy">
      <h3>Nothing leaves your browser</h3>
      <p>The export holds your email, weight, GPS traces of your home and heart-rate data. All parsing and rendering happens on this page, in your browser. There is no upload, no server, no analytics on your activities. Close the tab and it's gone.</p>
    </div>
    <div class="howto">
      <h3>How to get your export</h3>
      <ol>
        <li>On strava.com, open <em>Settings → My Account → Download or Delete Your Account</em>.</li>
        <li>Under <em>Download Request</em>, click <em>Get Started</em>, then <em>Request Your Archive</em>.</li>
        <li>Strava emails a link to <code>export_&lt;your id&gt;.zip</code>, usually within an hour. Bring it here.</li>
      </ol>
      <p class="fine">Works with your Strava export. Not affiliated with Strava. Handles FIT, GPX and TCX files, gzipped or not, and builds everything from the activities.csv inside the zip.</p>
    </div>
  </div>`;
  const drop = root.querySelector('#drop') as HTMLElement;
  const input = root.querySelector('#file') as HTMLInputElement;
  input.addEventListener('change', () => { if (input.files?.[0]) onFile(input.files[0]); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); });
}
