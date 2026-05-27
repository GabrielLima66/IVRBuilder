// test_roundtrip_2502.mjs — quick round-trip smoke test for vcm-ivr-2502.conf
import { readFileSync } from 'fs';
import { lex }           from './src/utils/conf/confLexer.js';
import { map }           from './src/utils/conf/confMapper.js';
import { resolve }       from './src/utils/conf/confResolver.js';
import { generateDialplan } from './src/utils/asteriskExporter.js';
import { build }         from './src/utils/conf/confBuilder.js';
import { calculateLayout } from './src/utils/conf/confLayout.js';

const src = readFileSync('./vcm-ivr-2502.conf.txt', 'utf8');

// --- Import ---
const tokens  = lex(src);
const rawCtxs = map(tokens);
const graph   = resolve(rawCtxs);

console.log('\n=== RESOLVE STATS ===');
console.log('isRealGlobalConfig:', graph.isRealGlobalConfig);
console.log('suggestedName:', graph.suggestedName);
console.log('contexts:', graph.contexts.length);
graph.contexts.forEach((c) => {
  const menuNode = c.childNodes.find((n) => n.type === 'menu');
  const bgNodes  = c.childNodes.filter((n) => n.type === 'background');
  console.log(`  [${c.name}]  children=${c.childNodes.length}  menu=${!!menuNode}  bg=${bgNodes.length}`);
  if (menuNode) {
    console.log(`    audioFiles: [${menuNode.data.audioFiles?.join(', ')}]`);
    console.log(`    invalidMacroName: ${menuNode.data.invalidMacroName}`);
    console.log(`    timeoutMacroName: ${menuNode.data.timeoutMacroName}`);
    const d1 = menuNode.data.digits.find((d) => d.id === '1');
    if (d1) {
      console.log(`    digit[1] logIvrLabel: ${d1.logIvrLabel}`);
      console.log(`    digit[1] actions: ${d1.actions.map(a => a.type + '(' + (a.data?.name || a.data?.assignment || a.data?.script || '') + ')').join(', ')}`);
      console.log(`    digit[1] finalDest: ${JSON.stringify(d1.finalDestination)}`);
    }
  }
  if (bgNodes.length) console.log(`    standalone BG: ${bgNodes.map(b => b.data._label || '(no label)').join(', ')}`);
});

// --- Build canvas ---
const layout = calculateLayout(graph);
const { nodes, edges } = build(graph, layout);

const configNode = nodes.find((n) => n.type === 'config');
console.log('\n=== CONFIG NODE ===');
console.log('_isRealGlobalConfig:', configNode.data._isRealGlobalConfig);
console.log('soundPath:', configNode.data.soundPath);
console.log('ivr:', configNode.data.ivr);

const cfgEdge = edges.find((e) => e.source === configNode.id);
console.log('edge from ConfigNode:', cfgEdge ? `→ ${cfgEdge.target}` : 'NONE (expected)');

// --- Export ---
const out = generateDialplan(nodes, edges, { includeSectionComments: false });

// --- Checks ---
const checks = [
  // BUG 1: no extra [orpen-ivr-2502] block
  { label: 'No [orpen-ivr-2502] block',  pass: !out.includes('[orpen-ivr-2502]') },
  // BUG 1 cont: first block is [ura-principal-sac]
  { label: '[ura-principal-sac] first',  pass: out.trimStart().startsWith('[ura-principal-sac]') },
  // BUG 2: CPFCLI preserved
  { label: 'Set(CPFCLI=...) preserved',  pass: out.includes('Set(CPFCLI=${SIP_HEADER(X-CPF)})') },
  // BUG 3: standalone bv + menu backgrounds
  { label: 'Background(bv) as separate line with label',
    pass: out.includes('exten => s,n(bv),Background(${SOUND_PATH}/7401_anuncio_opcoesura)') },
  { label: 'Background(menu) has 5 audio files',
    pass: out.includes('7401_menu_05_elogios') && out.includes('exten => s,n(menu),Background') },
  // BUG 4: macro names preserved
  { label: 'Macro(menu-invalid-sac-2502)',  pass: out.includes('Macro(menu-invalid-sac-2502)') },
  { label: 'Macro(menu-timeout-sac-2502)',  pass: out.includes('Macro(menu-timeout-sac-2502)') },
  // BUG 5: GotoIfTime/ExecIfTime inside DTMF
  { label: 'ExecIfTime inside DTMF',
    pass: out.includes('exten => 2,n,ExecIfTime(16:00-17:00,fri,*,*?Dial(SIP/FLUX_SABEMI/1128238339,120)') },
  { label: 'GotoIfTime inside DTMF',
    pass: out.includes('exten => 5,n,GotoIfTime(08:00-17:55,mon-fri,*,*?rcx-queue,7310,1)') },
  // BUG 7: Goto(s,menu) 2 args
  { label: 'Goto(s,menu) — 2 args, no ,1',  pass: out.includes('Goto(s,menu)') && !out.includes('Goto(s,menu,1)') },
  // BUG 8: Goto with label as 3rd arg
  { label: 'Goto(ura-principal-sac,s,menu)',  pass: out.includes('Goto(ura-principal-sac,s,menu)') },
  // Other
  { label: 'Agi(beeInb/beeInb.php,...) preserved',  pass: out.includes('Agi(beeInb/beeInb.php,setCallData,') },
];

console.log('\n=== ROUND-TRIP CHECKS ===');
let passed = 0;
checks.forEach(({ label, pass }) => {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (pass) passed++;
});
console.log(`\n${passed}/${checks.length} checks passed`);

// Show first 60 lines of output
console.log('\n=== OUTPUT (first 80 lines) ===');
out.split('\n').slice(0, 80).forEach((l, i) => console.log(`${String(i+1).padStart(3)}: ${l}`));
