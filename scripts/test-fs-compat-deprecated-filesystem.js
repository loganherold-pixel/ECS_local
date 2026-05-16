const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const fsCompatPath = path.join(root, 'lib', 'fsCompat.ts');
const source = fs.readFileSync(fsCompatPath, 'utf8').replace(/\r\n/g, '\n');

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

for (const deprecatedModernAccess of [
  '(mod as any)?.readAsStringAsync',
  '(mod as any)?.writeAsStringAsync',
  '(mod as any)?.getInfoAsync',
  '(mod as any)?.makeDirectoryAsync',
  '(mod as any)?.deleteAsync',
  '(mod as any)?.downloadAsync',
  '(mod as any)?.readDirectoryAsync',
  '(mod as any)?.getFreeDiskStorageAsync',
  '(mod as any).getTotalDiskCapacityAsync',
  'mod?.documentDirectory',
]) {
  assertNotIncludes(
    deprecatedModernAccess,
    `fsCompat must not access deprecated ${deprecatedModernAccess} from expo-file-system.`,
  );
}

function loadFsCompatWithMocks() {
  const originalLoad = Module._load;
  const calls = [];
  const legacyWrites = [];
  const modernAccesses = [];

  Module._load = function patchedLoad(request, parent, isMain) {
    calls.push(request);
    if (request === 'react-native') {
      return { Platform: { OS: 'ios' } };
    }
    if (request.endsWith('/ecsLogger') || request.endsWith('\\ecsLogger') || request === './ecsLogger') {
      return { ecsLog: { debug: () => undefined } };
    }
    if (request === 'expo-file-system/legacy') {
      return {
        documentDirectory: 'file:///legacy-documents/',
        EncodingType: { UTF8: 'utf8', Base64: 'base64' },
        readAsStringAsync: async (uri, options) => `legacy-read:${uri}:${options.encoding}`,
        writeAsStringAsync: async (uri, content, options) => {
          legacyWrites.push({ uri, content, encoding: options.encoding });
        },
      };
    }
    if (request === 'expo-file-system') {
      return new Proxy(
        {
          Paths: { document: { uri: 'file:///modern-documents/' } },
          File: class MockFile {},
          Directory: class MockDirectory {},
        },
        {
          get(target, prop) {
            modernAccesses.push(String(prop));
            if (
              [
                'readAsStringAsync',
                'writeAsStringAsync',
                'getInfoAsync',
                'makeDirectoryAsync',
                'deleteAsync',
                'downloadAsync',
                'readDirectoryAsync',
                'getFreeDiskStorageAsync',
                'getTotalDiskCapacityAsync',
                'documentDirectory',
              ].includes(String(prop))
            ) {
              throw new Error(`deprecated modern API accessed: ${String(prop)}`);
            }
            return target[prop];
          },
        },
      );
    }
    return originalLoad(request, parent, isMain);
  };

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fsCompatPath,
  });
  const mod = new Module(fsCompatPath, module);
  mod.filename = fsCompatPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fsCompatPath));
  mod._compile(transpiled.outputText, fsCompatPath);

  return {
    api: mod.exports,
    calls,
    legacyWrites,
    modernAccesses,
    restore() {
      Module._load = originalLoad;
    },
  };
}

(async () => {
  const harness = loadFsCompatWithMocks();
  try {
    assert.strictEqual(
      await harness.api.getDocumentDirectory(),
      'file:///legacy-documents/',
      'Document directory should preserve the legacy durable path when available.',
    );
    assert.strictEqual(
      await harness.api.fsReadString('file:///legacy-documents/test.gpx'),
      'legacy-read:file:///legacy-documents/test.gpx:utf8',
      'fsReadString should preserve legacy read behavior.',
    );
    await harness.api.fsWriteString('file:///legacy-documents/test.gpx', '<gpx />');
    assert.deepStrictEqual(
      harness.legacyWrites,
      [{ uri: 'file:///legacy-documents/test.gpx', content: '<gpx />', encoding: 'utf8' }],
      'fsWriteString should preserve legacy write behavior.',
    );
    assert.ok(
      !harness.calls.includes('expo-file-system') || !harness.modernAccesses.some((prop) => prop.endsWith('Async') || prop === 'documentDirectory'),
      'fsCompat should not access deprecated async methods from expo-file-system.',
    );
  } finally {
    harness.restore();
  }

  console.log('fsCompat deprecated FileSystem checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
