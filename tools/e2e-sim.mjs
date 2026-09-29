// @ts-check
/** Headless full learner-attempt simulation writing all CMI via the mock LMS. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAssessment } from '../packages/engine/src/scoring.js';
import { buildInteractions } from '../packages/scorm-runtime/src/interactions.js';
import { ScormAdapter } from '../packages/scorm-runtime/src/adapter.js';
import { serializeState, deserializeState } from '../packages/scorm-runtime/src/state.js';
import { MockLMS } from '../packages/mock-lms/mock-lms.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const a = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../examples/demo-assessment.json'), 'utf8'));
const responses = { 'q1-topology': 'a', 'q2-media': 'fiber', 'q3-osi': ['phys','trans','app'],
  'q4-secure-ports': ['https','ssh'], 'q5-poe': 'true',
  'q6-match-ports': { HTTPS:'443', SSH:'22', DNS:'53', HTTP:'80' },
  'q7-seq-osi': ['l1','l2','l3','l4'], 'q8-subnet': 254, 'q9-shortanswer': 'NAT' };
const lms = new MockLMS();
const adapter = new ScormAdapter({ api: lms });
adapter.initialize();
const midState = { order: a.questions.map(q=>q.id), answers: {'q1-topology':'a'}, flagged: [], index: 3, submitted:false, attempt:1, remainingTime:null, answerOrder:null };
adapter.setValue('cmi.suspend_data', serializeState(midState));
adapter.setValue('cmi.completion_status','incomplete');
adapter.commit();
const resumed = deserializeState(lms.GetValue('cmi.suspend_data'));
console.log('Resume -> index:', resumed.index, '| answers kept:', Object.keys(resumed.answers).length);
const scored = scoreAssessment(a.questions, responses, { passingPercent: a.settings.passingPercent });
adapter.setValue('cmi.score.raw', String(scored.raw));
adapter.setValue('cmi.score.min', String(scored.min));
adapter.setValue('cmi.score.max', String(scored.max));
adapter.setValue('cmi.score.scaled', String(scored.scaled));
adapter.setValue('cmi.completion_status','completed');
adapter.setValue('cmi.success_status', scored.passed?'passed':'failed');
adapter.setValue('cmi.session_time','PT4M12S');
const resultsById = Object.fromEntries(scored.results.map(r=>[r.questionId,r]));
adapter.writeInteractions(buildInteractions(a.questions, responses, resultsById, {}));
adapter.setValue('cmi.exit','normal');
adapter.commit(); adapter.terminate();
console.log('\ncompletion:', lms.GetValue('cmi.completion_status'), '| success:', lms.GetValue('cmi.success_status'));
console.log('score.raw/max:', lms.GetValue('cmi.score.raw'), '/', lms.GetValue('cmi.score.max'), '| scaled:', lms.GetValue('cmi.score.scaled'));
console.log('interactions:', lms.GetValue('cmi.interactions._count'), '| API calls:', lms.log.length, '| rejected:', lms.errors.length);
for (let i = 0; i < lms.interactions.length; i++) console.log(`  ${i}: ${lms.GetValue(`cmi.interactions.${i}.id`)} -> ${lms.GetValue(`cmi.interactions.${i}.learner_response`)} (${lms.GetValue(`cmi.interactions.${i}.result`)})`);
console.log('Percent:', scored.percent + '%', '| Passed:', scored.passed);
