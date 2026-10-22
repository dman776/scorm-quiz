// Launch script for the packaged SCO. External (not inline) so the CSP can forbid inline script.
import { AssessmentPlayer } from './player.js';
import assessment from '../../assessment.data.js';
const params = new URLSearchParams(location.search);
const preview = params.get('preview') === '1';
let logger = undefined;
if (params.get('debug') === '1') {
  try {
    const mod = await import('../../mock-lms.js');
    if (!window.API_1484_11) mod.installMockLMS(window);
  } catch (_e) {}
  const panel = document.createElement('pre');
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText = 'position:fixed;bottom:0;right:0;max-height:40vh;width:420px;overflow:auto;background:#111;color:#0f0;font:11px monospace;padding:8px;z-index:9999;';
  document.body.append(panel);
  logger = (e) => { panel.textContent += `${e.fn}(${(e.args||[]).join(', ').slice(0,80)}) => ${e.result ?? ''}${e.error ? ' ERR:'+e.error : ''}\n`; panel.scrollTop = panel.scrollHeight; };
}
const player = new AssessmentPlayer({ root: document.getElementById('sqb-main'), assessment, logger, preview });
window.addEventListener('beforeunload', () => { try { player.adapter.commit(); } catch (_e) {} });
player.start();
