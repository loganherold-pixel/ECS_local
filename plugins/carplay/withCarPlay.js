/**
 * withCarPlay — Expo Config Plugin for Apple CarPlay Support
 *
 * This plugin modifies the iOS project during `expo prebuild` to:
 *
 *   1. Add the CarPlay entitlement to the app
 *   2. Add the CarPlay scene configuration to Info.plist
 *   3. Link the CarPlay framework
 *   4. Copy native Swift source files into the iOS project
 *   5. Create the bridging header for Swift/Obj-C interop
 *
 * Usage in app.json:
 *   "plugins": [
 *     "./plugins/carplay/withCarPlay"
 *   ]
 *
 * The plugin supports the NAVIGATION category, allowing ECS to appear
 * as a navigation-capable app on CarPlay.
 *
 * Vehicle display screens:
 *   - ECSCarPlayMapScreen (default/root)
 *   - ECSCarPlayStatusScreen
 *   - ECSCarPlayWeatherScreen
 *   - ECSCarPlayActionsScreen
 */

const {
  withInfoPlist,
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── 1. Add CarPlay Entitlement ──────────────────────────────

function withCarPlayEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    // Add CarPlay navigation entitlement
    if (!mod.modResults['com.apple.developer.carplay-maps']) {
      mod.modResults['com.apple.developer.carplay-maps'] = true;
      console.log('[withCarPlay] Added CarPlay maps entitlement');
    }

    // Add app group for shared UserDefaults
    if (!mod.modResults['com.apple.security.application-groups']) {
      mod.modResults['com.apple.security.application-groups'] = [];
    }
    const groups = mod.modResults['com.apple.security.application-groups'];
    if (!groups.includes('group.ecs.carplay')) {
      groups.push('group.ecs.carplay');
      console.log('[withCarPlay] Added app group: group.ecs.carplay');
    }

    return mod;
  });
}

// ── 2. Add CarPlay Scene Configuration to Info.plist ────────

function withCarPlayInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    const plist = mod.modResults;

    // Add UIApplicationSceneManifest for CarPlay scene
    if (!plist.UIApplicationSceneManifest) {
      plist.UIApplicationSceneManifest = {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: {},
      };
    }

    const manifest = plist.UIApplicationSceneManifest;
    if (!manifest.UISceneConfigurations) {
      manifest.UISceneConfigurations = {};
    }

    const configs = manifest.UISceneConfigurations;

    // Add CarPlay scene configuration
    if (!configs.CPTemplateApplicationSceneSessionRoleApplication) {
      configs.CPTemplateApplicationSceneSessionRoleApplication = [
        {
          UISceneConfigurationName: 'ECS CarPlay',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).ECSCarPlaySceneDelegate',
        },
      ];
      console.log('[withCarPlay] Added CarPlay scene configuration to Info.plist');
    }

    // Add CarPlay to supported external accessories protocols (if needed)
    if (!plist.UISupportedExternalAccessoryProtocols) {
      plist.UISupportedExternalAccessoryProtocols = [];
    }

    return mod;
  });
}

// ── 3. Copy Native Source Files ─────────────────────────────

function withCarPlaySourceFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');

      // Determine the project name from app.json
      const appJson = require(path.join(projectRoot, 'app.json'));
      const projectName = appJson.expo?.name?.replace(/\s+/g, '') || 'App';

      // Target directory for CarPlay source files
      const targetDir = path.join(iosDir, projectName, 'CarPlay');
      fs.mkdirSync(targetDir, { recursive: true });

      // Source files to copy
      const sourceDir = path.join(projectRoot, 'plugins', 'carplay', 'src');
      const sourceFiles = [
        'ECSCarPlayConstants.swift',
        'ECSCarPlaySceneDelegate.swift',
        'ECSCarPlayInterfaceController.swift',
        'ECSCarPlayMapScreen.swift',
        'ECSCarPlayStatusScreen.swift',
        'ECSCarPlayWeatherScreen.swift',
        'ECSCarPlayActionsScreen.swift',
        'ECSCarPlayModule.swift',
        'ECSCarPlayModuleBridge.m',
      ];

      for (const file of sourceFiles) {
        const srcPath = path.join(sourceDir, file);
        const destPath = path.join(targetDir, file);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`[withCarPlay] Copied ${file}`);
        } else {
          console.warn(`[withCarPlay] Source file not found: ${srcPath}`);
        }
      }

      return mod;
    },
  ]);
}

// ── 4. Add Files to Xcode Project ───────────────────────────

function withCarPlayXcodeProject(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const appJson = require(path.join(mod.modRequest.projectRoot, 'app.json'));
    const projectName = appJson.expo?.name?.replace(/\s+/g, '') || 'App';

    // Get the main group
    const mainGroup = project.getFirstProject().firstProject.mainGroup;

    // Find or create CarPlay group
    let carplayGroupKey = null;
    const groups = project.hash.project.objects.PBXGroup;

    for (const key in groups) {
      if (typeof groups[key] === 'object' && groups[key].name === 'CarPlay') {
        carplayGroupKey = key;
        break;
      }
    }

    if (!carplayGroupKey) {
      // Create the CarPlay group
      const groupUuid = project.generateUuid();
      project.hash.project.objects.PBXGroup[groupUuid] = {
        isa: 'PBXGroup',
        children: [],
        name: 'CarPlay',
        sourceTree: '"<group>"',
        path: 'CarPlay',
      };
      project.hash.project.objects.PBXGroup[groupUuid + '_comment'] = 'CarPlay';

      // Add to main project group
      const projectGroupKey = Object.keys(groups).find(
        (k) =>
          typeof groups[k] === 'object' &&
          groups[k].name === projectName
      );

      if (projectGroupKey) {
        if (!groups[projectGroupKey].children) {
          groups[projectGroupKey].children = [];
        }
        groups[projectGroupKey].children.push({
          value: groupUuid,
          comment: 'CarPlay',
        });
      }

      carplayGroupKey = groupUuid;
      console.log('[withCarPlay] Created CarPlay group in Xcode project');
    }

    // Add source files to the project
    const sourceFiles = [
      'ECSCarPlayConstants.swift',
      'ECSCarPlaySceneDelegate.swift',
      'ECSCarPlayInterfaceController.swift',
      'ECSCarPlayMapScreen.swift',
      'ECSCarPlayStatusScreen.swift',
      'ECSCarPlayWeatherScreen.swift',
      'ECSCarPlayActionsScreen.swift',
      'ECSCarPlayModule.swift',
      'ECSCarPlayModuleBridge.m',
    ];

    for (const file of sourceFiles) {
      try {
        const filePath = `CarPlay/${file}`;
        project.addSourceFile(filePath, null, carplayGroupKey);
        console.log(`[withCarPlay] Added ${file} to Xcode project`);
      } catch (e) {
        // File may already exist in project
        console.log(`[withCarPlay] ${file} may already be in project`);
      }
    }

    // Add CarPlay framework
    try {
      project.addFramework('CarPlay.framework', { weak: false });
      console.log('[withCarPlay] Added CarPlay.framework');
    } catch (e) {
      console.log('[withCarPlay] CarPlay.framework may already be linked');
    }

    return mod;
  });
}

// ── Compose all modifications ───────────────────────────────

function withCarPlay(config) {
  config = withCarPlayEntitlement(config);
  config = withCarPlayInfoPlist(config);
  config = withCarPlaySourceFiles(config);
  config = withCarPlayXcodeProject(config);
  return config;
}

module.exports = createRunOncePlugin(
  withCarPlay,
  'ecs-carplay',
  '1.0.0'
);
