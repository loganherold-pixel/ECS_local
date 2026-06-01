const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

require(path.join(__dirname, '..', 'tests', 'release', 'dispersedCampingReleaseChecks.test.ts'));

console.log('Dispersed camping release/readiness checks passed.');
