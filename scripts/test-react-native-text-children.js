const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');

const TARGET_FILES = [
  path.join(repoRoot, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  path.join(repoRoot, 'app', '(tabs)', 'discover.tsx'),
  path.join(repoRoot, 'app', '(tabs)', 'navigate.tsx'),
];

const TARGET_DIRS = [
  path.join(repoRoot, 'components', 'discover'),
  path.join(repoRoot, 'components', 'navigate'),
];

const TEXT_COMPONENT_NAME = /(^|\.)Text$/;

function listTsxFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.tsx'))
    .map((fileName) => path.join(dir, fileName));
}

function jsxNameText(name) {
  if (!name) return '';
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) {
    return `${jsxNameText(name.expression)}.${name.name.text}`;
  }
  return name.getText();
}

function elementName(node) {
  if (!node) return 'Fragment';
  if (ts.isJsxElement(node)) return jsxNameText(node.openingElement.tagName);
  if (ts.isJsxSelfClosingElement(node)) return jsxNameText(node.tagName);
  return '';
}

function hasTextAncestor(node) {
  let parent = node.parent;
  while (parent) {
    if (
      (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
      TEXT_COMPONENT_NAME.test(elementName(parent))
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function lineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current)))
  ) {
    current = current.expression;
  }
  return current;
}

function expressionCanRenderString(expression) {
  const node = unwrapExpression(expression);
  if (!node) return false;

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
    return true;
  }

  if (ts.isConditionalExpression(node)) {
    return expressionCanRenderString(node.whenTrue) || expressionCanRenderString(node.whenFalse);
  }

  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return expressionCanRenderString(node.right);
    }
    if (operator === ts.SyntaxKind.PlusToken) {
      return expressionCanRenderString(node.left) || expressionCanRenderString(node.right);
    }
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some(expressionCanRenderString);
  }

  return false;
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reports = [];

  function report(node, kind, parentName, text) {
    reports.push({
      filePath,
      line: lineNumber(sourceFile, node),
      kind,
      parentName,
      text: text.replace(/\s+/g, ' ').trim().slice(0, 180),
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
      if (text && !hasTextAncestor(node)) {
        report(node, 'JSX text', elementName(node.parent), text);
      }
    }

    const isRenderedExpressionChild =
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent));

    if (isRenderedExpressionChild && !hasTextAncestor(node) && expressionCanRenderString(node.expression)) {
      report(node, 'string expression', elementName(node.parent), node.expression.getText(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return reports;
}

const files = Array.from(new Set([...TARGET_FILES, ...TARGET_DIRS.flatMap(listTsxFiles)]));
const reports = files.flatMap(scanFile);

if (reports.length > 0) {
  console.error('React Native raw text children found outside <Text>:');
  reports.forEach((report) => {
    console.error(
      `${path.relative(repoRoot, report.filePath)}:${report.line} ${report.kind} under <${report.parentName}>: ${report.text}`,
    );
  });
  process.exit(1);
}

console.log(`React Native text-child regression checks passed for ${files.length} files.`);
