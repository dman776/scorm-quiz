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
    /** Rejected SetValue calls, for tests: { el, val, code }. */
    this.errors = [];
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
      const code = checkInteraction(this.interactions, i, m[2], String(val));
      if (code !== '0') {
        this.errorCode = code;
        this.errors.push({ el, val, code });
        this._record('SetValue', [el, val], 'false');
        return 'false';
      }
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
      '351': 'General set failure', '391': 'General commit failure', '401': 'Undefined data model element',
      '406': 'Data model element type mismatch', '408': 'Data model dependency not established' };
    return map[String(code)] || 'Unknown error';
  }
  GetDiagnostic(code) { return `diagnostic:${code}`; }
}

export function installMockLMS(win = /** @type {any} */ (globalThis).window) {
  const lms = new MockLMS();
  win.API_1484_11 = lms;
  return lms;
}

/* ------------- cmi.interactions validation (SCORM 2004 4th Ed RTE 4.2.9) ------------- */
const INTERACTION_TYPES = ['true-false', 'choice', 'fill-in', 'long-fill-in', 'likert', 'matching',
  'performance', 'sequencing', 'numeric', 'other'];
const RESULTS = ['correct', 'incorrect', 'unanticipated', 'neutral'];
const REAL = /^-?\d+(\.\d+)?$/;
const IDENT = /^[^\s[\]]{1,250}$/;
const TIMESTAMP = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2}(\.\d{1,2})?)?)?(Z|[+-]\d{2}(:\d{2})?)?)?)?)?$/;
const DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d{1,2})?S)?)?$/;

/** Response pattern check by interaction type. Returns true if well formed. */
function validResponse(type, val) {
  const list = (v) => v.split('[,]');
  switch (type) {
    case 'true-false': return val === 'true' || val === 'false';
    case 'choice': case 'sequencing': {
      const ids = list(val);
      return ids.every((x) => IDENT.test(x)) && (type === 'sequencing' || new Set(ids).size === ids.length);
    }
    case 'matching': return list(val).every((p) => { const [s, t, extra] = p.split('[.]'); return IDENT.test(s || '') && IDENT.test(t || '') && extra === undefined; });
    case 'numeric': return REAL.test(val);
    default: return true;
  }
}
function validCorrectPattern(type, val) {
  if (type === 'numeric') return /^(-?\d+(\.\d+)?)?\[:\](-?\d+(\.\d+)?)?$/.test(val);
  return validResponse(type, val);
}

/** SCORM error code for setting `field` of interaction `i` to `val` ('0' = ok). */
function checkInteraction(interactions, i, field, val) {
  if (i > interactions.length) return '351'; // indexes must be contiguous
  const rec = interactions[i];
  if (field === 'id') return IDENT.test(val) ? '0' : '406';
  if (!rec || !rec.id) return '408'; // id must be set first
  if (field === 'type') return INTERACTION_TYPES.includes(val) ? '0' : '406';
  if (field === 'timestamp') return TIMESTAMP.test(val) ? '0' : '406';
  if (field === 'latency') return DURATION.test(val) ? '0' : '406';
  if (field === 'weighting') return REAL.test(val) ? '0' : '406';
  if (field === 'result') return RESULTS.includes(val) || REAL.test(val) ? '0' : '406';
  if (field === 'description') return val.length <= 250 ? '0' : '406';
  if (/^objectives\.\d+\.id$/.test(field)) return IDENT.test(val) ? '0' : '406';
  if (field === 'learner_response' || /^correct_responses\.\d+\.pattern$/.test(field)) {
    if (!rec.type) return '408'; // format depends on type
    const ok = field === 'learner_response' ? validResponse(rec.type, val) : validCorrectPattern(rec.type, val);
    return ok ? '0' : '406';
  }
  return '401';
}
