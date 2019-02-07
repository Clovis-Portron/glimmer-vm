// @ts-check

const { normalizeAll, buildEnum, buildMetas, strip } = require('../dist/@glimmer/debug');
const fs = require('fs');
const path = require('path');
const toml = require('toml');
const tslint = require('tslint');

function parse(file) {
  let opcodes = fs.readFileSync(file, { encoding: 'utf8' });
  let raw = toml.parse(opcodes);
  return normalizeAll(raw);
}

let parsed = parse('./packages/@glimmer/vm/lib/opcodes.toml');

let machine = buildEnum('MachineOp', parsed.machine, 0, 15);
let syscall = buildEnum('Op', parsed.syscall, 16);

write(
  './packages/@glimmer/vm/lib/opcodes.ts',
  `import { Op, MachineOp } from '@glimmer/interfaces';\n\n` +
    machine.predicate +
    '\n' +
    syscall.predicate
);
write(
  './packages/@glimmer/interfaces/lib/vm-opcodes.d.ts',
  machine.enumString + '\n\n' + syscall.enumString
);

let debugMetadata = strip`
  import { MachineOp, Op, Option } from '@glimmer/interfaces';
  import { fillNulls } from '@glimmer/util';
  import { NormalizedMetadata } from '@glimmer/debug';

  export function opcodeMetadata(op: MachineOp | Op, isMachine: 0 | 1): Option<NormalizedMetadata> {
    let value = isMachine ? MACHINE_METADATA[op] : METADATA[op];

    return value || null;
  }

  const METADATA: Option<NormalizedMetadata>[] = fillNulls(Op.Size);
  const MACHINE_METADATA: Option<NormalizedMetadata>[] = fillNulls(MachineOp.Size);
`;

debugMetadata += buildMetas('MACHINE_METADATA', parsed.machine);
debugMetadata += buildMetas('METADATA', parsed.syscall);

write('./packages/@glimmer/debug/lib/opcode-metadata.ts', debugMetadata);

function write(file, contents) {
  console.log(`Generating ${file}`);

  format(
    file,
    strip`
/* This file is generated by build/debug.js */

${contents}
  `
  );
}

function format(file, contents) {
  let linter = new tslint.Linter({ fix: true });
  let config = tslint.Configuration.findConfiguration(
    path.resolve(__dirname, '..', 'tslint.json'),
    __filename
  );
  linter.lint(file, contents, config.results);
  linter.getResult();
}
