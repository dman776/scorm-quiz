// @ts-check
/**
 * SCORM 2004 4th Edition runtime adapter. Discovers API_1484_11, walks parent/
 * opener windows with cross-origin + loop protection, standalone fallback.
 */
const MAX_WALK = 20;

function safeGet(win, prop) {
  try { return win[prop]; } catch (_e) { return undefined; }
}
function findInChain(startWin, next) {
  let win = startWin, depth = 0;
  while (win && depth < MAX_WALK) {
    const api = safeGet(win, 'API_1484_11');
    if (api) return api;
    const parent = safeGet(win, next);
    if (!parent || parent === win) break;
    win = parent; depth++;
  }
  return null;
}
export function findAPI(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return null;
  return (
    findInChain(win, 'parent') ||
    (safeGet(win, 'opener') ? findInChain(safeGet(win, 'opener'), 'parent') : null) ||
    (safeGet(win, 'top') ? safeGet(safeGet(win, 'top'), 'API_1484_11') : null) ||
    null
  );
}

export class ScormAdapter {
  constructor(opts = {}) {
    this.api = opts.api || findAPI();
    this.logger = opts.logger || (() => {});
    this.initialized = false;
    this.standalone = !this.api;
  }
  _log(fn, args, result, error) {
    this.logger({ fn, args, result, error: error ? String(error) : undefined, t: Date.now() });
  }
  get connected() { return !!this.api && this.initialized; }

  initialize() {
    if (this.standalone) { this._log('Initialize', [''], 'STANDALONE'); return false; }
    try {
      const r = this.api.Initialize('');
      this.initialized = r === 'true' || r === true;
      this._log('Initialize', [''], r);
      return this.initialized;
    } catch (e) { this._log('Initialize', [''], null, e); return false; }
  }
  getValue(el) {
    if (!this.connected) { this._log('GetValue', [el], '(standalone)'); return ''; }
    try { const v = this.api.GetValue(el); this._log('GetValue', [el], v); return v; }
    catch (e) { this._log('GetValue', [el], null, e); return ''; }
  }
  setValue(el, val) {
    if (!this.connected) { this._log('SetValue', [el, val], '(standalone)'); return false; }
    try {
      const r = this.api.SetValue(el, String(val));
      const ok = r === 'true' || r === true;
      const err = ok ? undefined : this.lastError();
      this._log('SetValue', [el, val], r, err && err.code !== '0' ? err.string : undefined);
      return ok;
    } catch (e) { this._log('SetValue', [el, val], null, e); return false; }
  }
  commit() {
    if (!this.connected) { this._log('Commit', [''], '(standalone)'); return false; }
    try { const r = this.api.Commit(''); this._log('Commit', [''], r); return r === 'true' || r === true; }
    catch (e) { this._log('Commit', [''], null, e); return false; }
  }
  terminate() {
    if (!this.connected) { this._log('Terminate', [''], '(standalone)'); this.initialized = false; return false; }
    try {
      const r = this.api.Terminate('');
      this.initialized = false;
      this._log('Terminate', [''], r);
      return r === 'true' || r === true;
    } catch (e) { this._log('Terminate', [''], null, e); return false; }
  }
  lastError() {
    try {
      const code = this.api.GetLastError();
      return { code: String(code), string: this.api.GetErrorString(code), diagnostic: this.api.GetDiagnostic(code) };
    } catch (e) { return { code: '-1', string: 'adapter error', diagnostic: String(e) }; }
  }
  writeInteractions(interactions) {
    interactions.forEach((it, i) => {
      const base = `cmi.interactions.${i}.`;
      this.setValue(base + 'id', it.id);
      this.setValue(base + 'type', it.type);
      this.setValue(base + 'timestamp', it.timestamp);
      this.setValue(base + 'weighting', it.weighting);
      if (it.correct_response !== '') this.setValue(base + 'correct_responses.0.pattern', it.correct_response);
      this.setValue(base + 'learner_response', it.learner_response);
      this.setValue(base + 'result', it.result);
      this.setValue(base + 'latency', it.latency);
      this.setValue(base + 'description', it.description);
    });
  }
}
