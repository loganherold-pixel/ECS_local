const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const activityIndicatorProps = [];
const viewProps = [];
let videoPlayerHookCount = 0;
let videoViewCount = 0;

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return typeof style === 'object' ? style : {};
}

function hostComponent(name, capture) {
  return function MockHostComponent({ children, style, testID, ...props }) {
    const flattenedStyle = flattenStyle(style);
    capture?.({ ...props, style: flattenedStyle, testID });
    return React.createElement(
      name,
      {
        'data-testid': testID,
        'data-style': JSON.stringify(flattenedStyle),
        role: props.accessibilityRole,
        'aria-label': props.accessibilityLabel,
      },
      children,
    );
  };
}

const View = hostComponent('mock-view', (props) => viewProps.push(props));
const Image = hostComponent('mock-image');
const ActivityIndicator = function MockActivityIndicator(props) {
  activityIndicatorProps.push(props);
  return React.createElement('mock-activity-indicator', {
    'data-testid': props.testID,
    'data-animating': String(props.animating),
    'data-size': String(props.size),
  });
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      ActivityIndicator,
      Image,
      Platform: { OS: 'android' },
      StyleSheet: {
        absoluteFillObject: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
        create: (styles) => styles,
      },
      View,
    };
  }
  if (request === 'expo-status-bar') {
    return { StatusBar: () => null };
  }
  if (request === 'expo-video') {
    return {
      VideoView: () => {
        videoViewCount += 1;
        return React.createElement('mock-video-view');
      },
      useVideoPlayer: () => {
        videoPlayerHookCount += 1;
        return {};
      },
    };
  }
  if (request === './legal/LegalFooter') {
    return { __esModule: true, default: () => React.createElement('mock-legal-footer') };
  }
  if (request === '../lib/theme') {
    return { TACTICAL: { amber: '#F5B942' } };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.tsx'] = function compileTsx(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
require.extensions['.png'] = (module, filename) => {
  module.exports = filename;
};
require.extensions['.mp4'] = (module, filename) => {
  module.exports = filename;
};

const LoadingTransitionVideo = require(path.join(root, 'components', 'LoadingTransitionVideo.tsx')).default;
ReactDOMServer.renderToStaticMarkup(React.createElement(LoadingTransitionVideo));

assert.equal(
  activityIndicatorProps.length,
  1,
  'Android startup must mount one native ActivityIndicator instead of a static spinner segment.',
);
assert.equal(activityIndicatorProps[0].animating, true, 'Android startup indicator must animate explicitly.');
assert.equal(activityIndicatorProps[0].size, 'large', 'Android startup indicator must render as a complete visible wheel.');
assert.equal(
  activityIndicatorProps[0].testID,
  'ecs-startup-loading-spinner',
  'Android startup indicator must retain a stable behavioral test identity.',
);

const loadingFrame = viewProps.find((props) => props.testID === 'ecs-startup-loading-indicator');
assert.ok(loadingFrame, 'Android startup must mount the loading indicator frame.');
assert.equal(loadingFrame.accessible, true);
assert.equal(loadingFrame.accessibilityRole, 'progressbar');
assert.equal(loadingFrame.accessibilityLabel, 'Loading Expedition Command System');
assert.deepEqual(loadingFrame.accessibilityState, { busy: true });
assert.equal(activityIndicatorProps[0].accessible, false, 'The child spinner must not create duplicate screen-reader focus.');
assert.deepEqual(
  {
    position: loadingFrame.style.position,
    top: loadingFrame.style.top,
    right: loadingFrame.style.right,
    bottom: loadingFrame.style.bottom,
    left: loadingFrame.style.left,
    alignItems: loadingFrame.style.alignItems,
    justifyContent: loadingFrame.style.justifyContent,
  },
  {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  'Android startup indicator must remain centered in an unclipped full-screen frame.',
);
assert.equal(videoPlayerHookCount, 0, 'Android startup must preserve the no-video-player performance safeguard.');
assert.equal(videoViewCount, 0, 'Android startup must not mount VideoView.');

console.log('Android startup loading indicator behavior checks passed.');
