const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const toastSource = fs.readFileSync(path.join(root, 'components', 'Toast.tsx'), 'utf8');
const appContextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.tsx'), 'utf8');
const readinessToastSource = fs.readFileSync(path.join(root, 'components', 'readiness', 'ReadinessAlertToast.tsx'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

includes(toastSource, "import { Animated, Easing, Text, StyleSheet, type ViewStyle } from 'react-native';", 'Toast should use Animated for global fade transitions.');
includes(toastSource, "import { useReducedMotion, useStableAnimatedValue } from '../lib/ecsAnimations';", 'Toast should use shared ECS animation/reduced-motion helpers.');
includes(toastSource, 'const TOAST_FADE_IN_MS = 220;', 'Toast should define a gentle fade-in duration.');
includes(toastSource, 'const TOAST_FADE_OUT_MS = 260;', 'Toast should define a gentle fade-out duration.');
includes(toastSource, 'const [displayMsg, setDisplayMsg] = useState<string | null>(toastMsg);', 'Toast should keep the last message mounted for fade-out.');
includes(toastSource, 'displayMsgRef.current = toastMsg;', 'Toast should preserve the visible message independently of provider clearing.');
includes(toastSource, 'latestToastRef.current = toastMsg;', 'Toast should guard fade-out callbacks against newer messages.');
includes(toastSource, 'mountedRef.current = false;', 'Toast should avoid state updates after unmount.');
includes(toastSource, 'opacity.stopAnimation();', 'Toast should stop active animations during lifecycle changes.');
includes(toastSource, 'Animated.timing(opacity,', 'Toast should animate opacity.');
includes(toastSource, 'duration: TOAST_FADE_IN_MS,', 'Toast should apply the fade-in duration.');
includes(toastSource, 'duration: TOAST_FADE_OUT_MS,', 'Toast should apply the fade-out duration.');
includes(toastSource, 'useNativeDriver: true,', 'Toast fade should use the native animation driver.');
includes(toastSource, 'if (reducedMotion)', 'Toast should respect reduced motion.');
includes(toastSource, '<Animated.View', 'Toast should render an Animated.View surface.');
includes(toastSource, '{ opacity }', 'Toast should bind animated opacity to the surface.');
includes(appContextSource, 'toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000);', 'Toast provider timing should remain unchanged.');
includes(readinessToastSource, 'const opacity = useRef(new Animated.Value(0)).current;', 'Readiness notifications should fade in even when an alert is already active at mount.');
includes(readinessToastSource, 'const reducedMotion = useReducedMotion();', 'Readiness notifications should respect reduced motion.');
includes(readinessToastSource, 'duration: READINESS_TOAST_FADE_IN_MS,', 'Readiness notifications should keep a fade-in phase.');
includes(readinessToastSource, 'duration: READINESS_TOAST_FADE_OUT_MS,', 'Readiness notifications should keep a fade-out phase.');

console.log('Toast animation checks passed.');
