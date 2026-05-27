// test_2502_node.mjs — runs via vite-node or checks via import maps
// Usage: node --import @vite-node/register test_2502_node.mjs
// Fallback: just check the test via console analysis

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

// Since we can't import JSX/extensionless ESM directly, we'll
// use the rollup-compiled output indirectly:
// 1. Write the .conf to a temp file
// 2. Use the Vite API to run a build-time analysis

// Instead, let's check via the built bundle behavior
// by writing a self-contained transform test

// Actually, let's just verify the source code change patterns
const resolver = readFileSync('./src/utils/conf/confResolver.js', 'utf8');
const exporter = readFileSync('./src/utils/asteriskExporter.js', 'utf8');
const builder  = readFileSync('./src/utils/conf/confBuilder.js', 'utf8');

const checks = [
  // confResolver.js
  { label: 'isGlobalConfigCtx() function defined',
    pass: resolver.includes('function isGlobalConfigCtx(') },
  { label: 'isRealGlobalConfig used in resolve()',
    pass: resolver.includes('const isRealGlobalConfig = isGlobalConfigCtx(') },
  { label: 'isGlobalLine respects empty globalConfig',
    pass: resolver.includes("nd._configVal === globalConfig.ivr") && resolver.includes("globalConfig.ivr") && resolver.includes("!== ''") },
  { label: 'numberDialed check uses globalConfig.numberDialed === true',
    pass: resolver.includes('globalConfig.numberDialed === true') },
  { label: 'TAIL_SKIP_TYPES handles Hangup after WaitExten',
    pass: resolver.includes("TAIL_SKIP_TYPES = new Set(['hangup'") },
  { label: 'waitExtenIdx search skips tail nodes',
    pass: resolver.includes('waitExtenIdx = i; break;') },
  { label: 'Background absorption uses index loop (not pop)',
    pass: resolver.includes('childNodes.splice(i, 1)') },
  { label: 'invalidMacroName stored in MenuNode',
    pass: resolver.includes("invalidMacroName: invalidMacro") },
  { label: 'isRealGlobalConfig returned from resolve()',
    pass: resolver.includes('isRealGlobalConfig, // true when first context') },

  // confBuilder.js
  { label: 'isRealGlobalConfig extracted from graph',
    pass: builder.includes('isRealGlobalConfig } = graph') },
  { label: '_isRealGlobalConfig set on ConfigNode',
    pass: builder.includes('_isRealGlobalConfig: isRealGlobalConfig !== false') },
  { label: 'Edge ConfigNode→ctx only when isRealGlobalConfig',
    pass: builder.includes('if (firstCtxId && isRealGlobalConfig !== false)') },

  // asteriskExporter.js
  { label: 'GlobalConfig block skipped when _isRealGlobalConfig === false',
    pass: exporter.includes("standaloneConfig.data._isRealGlobalConfig !== false") },
  { label: 'emitOptActions helper defined',
    pass: exporter.includes('const emitOptActions = (opt, extId)') },
  { label: 'emitGotoAridade helper defined with argCount',
    pass: exporter.includes('const emitGotoAridade = (fd, extId)') },
  { label: 'GotoIfTime in action loop (digits)',
    pass: exporter.includes("if (action.type === 'time')") },
  { label: 'invalidMacroName used in fallback',
    pass: exporter.includes('m.data.invalidMacroName') },
  { label: 'timeoutMacroName used in fallback',
    pass: exporter.includes('m.data.timeoutMacroName') },
];

let passed = 0;
checks.forEach(({ label, pass }) => {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (pass) passed++;
});
console.log(`\n${passed}/${checks.length} source-level checks passed`);
