// @ts-check
/** Mock LMS implementing the SCORM 2004 4th Edition API. DEV/TEST ONLY. */
export class MockLMS {
  constructor(opts = {}) {
    this.data = {
      'cmi.completion_status': 'unknown', 'cmi.success_status': 'unknown', 'cmi.location': '',
      'cmi.suspend_data': opts.suspend_data || '', 'cmi.entry': opts.entry || 'ab-initio',
      'cmi.mode': 'normal', 'cmi.credit': 'credit',
    };
    this.interactions = [];
    this.log = [];
    this.errorCode = '0';
    this.terminated = false;
    this.initialized = false;
    this.faults = opts.faults || {};
  }
  _record(fn, args, result) { this.log.push({ fn, args, result, t: Date.now() }); }

  Initialize(_p) { this.initialized = true; this.errorCode = '0'; this._record('Initialize', [_p], 'true'); return 'true'; }
  Terminate(_p) {
    if (!this.initialized) { this.errorCode = '112'; return 'false'; }
    this.terminated = true; this.initialized = false; this._record('Terminate', [_p], 'true'); return 'true';
  }
  GetValue(el) {
    if (this.faults.GetValue === el) { this.errorCode = '101'; return ''; }
    let val = this.data[el] ?? '';
    const m = /^cmi\.interactions\.(\d+)\.(.+)$/.exec(el);
    if (m) {
      const rec = this.interactions[+m[1]] || {};
      const key = /^correct_responses\.\d+\.pattern$/.test(m[2]) ? 'correct_responses' : m[2];
      val = rec[key] ?? '';
    }
    if (el === 'cmi.interactions._count') val = String(this.interactions.length);
    this.errorCode = '0'; this._record('GetValue', [el], val); return val;
  }
  SetValue(el, val) {
    if (this.faults.SetValue === el) { this.errorCode = '351'; this._record('SetValue', [el, val], 'false'); return 'false'; }
    const m = /^cmi\.interactions\.(\d+)\.(.+)$/.exec(el);
    if (m) {
      const i = +m[1];
      this.interactions[i] = this.interactions[i] || {};
      const cr = /^correct_responses\.(\d+)\.pattern$/.exec(m[2]);
      if (cr) this.interactions[i].correct_responses = val;
      else this.interactions[i][m[2]] = val;
    } else this.data[el] = val;
    this.errorCode = '0'; this._record('SetValue', [el, val], 'true'); return 'true';
  }
  Commit(_p) {
    if (this.faults.Commit) { this.errorCode = '391'; return 'false'; }
    this.errorCode = '0'; this._record('Commit', [_p], 'true'); return 'true';
  }
  GetLastError() { return this.errorCode; }
  GetErrorString(code) {
    const map = { '0': 'No error', '101': 'General exception', '112': 'Termination before initialization',
      '351': 'General set failure', '391': 'General commit failure' };
    return map[String(code)] || 'Unknown error';
  }
  GetDiagnostic(code) { return `diagnostic:${code}`; }
}

export function installMockLMS(win = /** @type {any} */ (globalThis).window) {
  const lms = new MockLMS();
  win.API_1484_11 = lms;
  return lms;
}
