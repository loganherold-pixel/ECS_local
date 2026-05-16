const Module = require('module');

if (!global.__ECS_CAMPOPS_RN_TEST_SHIM__) {
  global.__ECS_CAMPOPS_RN_TEST_SHIM__ = true;
  const originalLoad = Module._load;

  Module._load = function patchedCampOpsLoad(request, parent, isMain) {
    if (request === 'react-native') {
      return {
        Platform: { OS: 'web', select: (values) => values?.web ?? values?.default },
        StyleSheet: { create(styles) { return styles; } },
      };
    }
    if (request === 'expo-constants') {
      return { default: { expoConfig: { extra: {} }, manifest: { extra: {} } } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}
