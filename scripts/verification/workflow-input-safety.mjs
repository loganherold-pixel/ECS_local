import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const DEFAULT_MAX_LENGTH = 512;
const EXPECTED_TYPES = new Set(['any', 'file', 'directory']);

function fail(message) {
  throw new Error(`Invalid ECS workflow artifact path: ${message}`);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateWorkflowArtifactPathInput(value, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const expectedType = options.expectedType ?? 'any';
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (!EXPECTED_TYPES.has(expectedType)) fail('expectedType must be file, directory, or any.');
  if (typeof value !== 'string' || !value.length) fail('a repository-relative path is required.');
  if (value.length > maxLength) fail(`path length must not exceed ${maxLength} characters.`);
  if (value !== value.trim()) fail('leading or trailing whitespace is not allowed.');
  if (CONTROL_CHARACTER_PATTERN.test(value)) fail('control characters are not allowed.');
  if (URI_SCHEME_PATTERN.test(value)) fail('URL and URI schemes are not allowed.');
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    fail('absolute paths are not allowed.');
  }

  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('empty, current-directory, and parent-directory segments are not allowed.');
  }
  if (segments[0]?.startsWith('~')) fail('home-directory aliases are not allowed.');

  const absolutePath = path.resolve(rootDir, ...segments);
  if (!isInside(rootDir, absolutePath)) fail('path must remain inside the repository root.');
  if (!fs.existsSync(absolutePath)) fail('path does not exist.');

  const rootRealPath = fs.realpathSync(rootDir);
  const realPath = fs.realpathSync(absolutePath);
  if (!isInside(rootRealPath, realPath)) fail('resolved path must remain inside the repository root.');

  const stat = fs.statSync(realPath);
  if (expectedType === 'file' && !stat.isFile()) fail('path must identify a file.');
  if (expectedType === 'directory' && !stat.isDirectory()) fail('path must identify a directory.');
  if (expectedType === 'any' && !stat.isFile() && !stat.isDirectory()) {
    fail('path must identify a regular file or directory.');
  }

  return Object.freeze({
    relativePath: normalized,
    absolutePath,
    realPath,
    type: stat.isDirectory() ? 'directory' : 'file',
  });
}

export function findDirectWorkflowInputInterpolations(source, options = {}) {
  const document = YAML.parse(String(source ?? ''));
  const findings = [];
  const visit = (value, keys = []) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childKeys = [...keys, key];
      if (key === 'run' && typeof child === 'string'
        && child.includes('${{')
        && /\b(?:inputs|github\.event\.inputs)\s*(?:\.|\[)/.test(child)) {
        findings.push({
          file: options.file ?? 'workflow',
          path: childKeys.join('.'),
        });
      }
      visit(child, childKeys);
    }
  };
  visit(document);
  return findings;
}
