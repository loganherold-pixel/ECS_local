/**
 * withAndroidAuto — Expo Config Plugin for Android Auto Support
 *
 * This plugin modifies the Android project during `expo prebuild` to:
 *
 *   1. Add the CarAppService declaration to AndroidManifest.xml
 *   2. Add the automotive_app_desc.xml metadata resource
 *   3. Add the androidx.car.app dependency to build.gradle
 *   4. Copy native Kotlin source files into the Android project
 *   5. Register the ECSAndroidAutoPackage in MainApplication
 *
 * Usage in app.json:
 *   "plugins": [
 *     "./plugins/android-auto/withAndroidAuto"
 *   ]
 *
 * The plugin supports the NAVIGATION category, allowing ECS to appear
 * as a navigation-capable app in Android Auto.
 *
 * Vehicle display screens:
 *   - ECSVehicleMapScreen (default/root)
 *   - ECSVehicleStatusScreen
 *   - ECSVehicleWeatherScreen
 *   - ECSVehicleActionsScreen
 */

const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  createRunOncePlugin,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ── Package name for the Android Auto module ────────────────
const AA_PACKAGE = 'com.ecs.androidauto';
const AA_SERVICE_CLASS = `${AA_PACKAGE}.ECSCarAppService`;

// ── 1. Modify AndroidManifest.xml ───────────────────────────

function withAndroidAutoManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn('[withAndroidAuto] No <application> found in manifest');
      return mod;
    }

    // Ensure service array exists
    if (!application.service) {
      application.service = [];
    }

    // Check if ECSCarAppService is already declared
    const existing = application.service.find(
      (s) => s.$?.['android:name'] === AA_SERVICE_CLASS
    );

    if (!existing) {
      // Add the CarAppService declaration
      application.service.push({
        $: {
          'android:name': AA_SERVICE_CLASS,
          'android:exported': 'true',
          'android:enabled': 'true',
          'android:label': 'ECS Navigation',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'androidx.car.app.CarAppService',
                },
              },
            ],
            category: [
              {
                $: {
                  'android:name': 'androidx.car.app.category.NAVIGATION',
                },
              },
            ],
          },
        ],
      });

      console.log('[withAndroidAuto] Added ECSCarAppService to AndroidManifest.xml');
    }

    // Add meta-data for minimum Car API level
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    const minApiMeta = application['meta-data'].find(
      (m) => m.$?.['android:name'] === 'androidx.car.app.minCarApiLevel'
    );

    if (!minApiMeta) {
      application['meta-data'].push({
        $: {
          'android:name': 'androidx.car.app.minCarApiLevel',
          'android:value': '1',
        },
      });
      console.log('[withAndroidAuto] Added minCarApiLevel meta-data');
    }

    // Add automotive_app_desc meta-data
    const autoDescMeta = application['meta-data'].find(
      (m) => m.$?.['android:name'] === 'com.google.android.gms.car.application'
    );

    if (!autoDescMeta) {
      application['meta-data'].push({
        $: {
          'android:name': 'com.google.android.gms.car.application',
          'android:resource': '@xml/automotive_app_desc',
        },
      });
      console.log('[withAndroidAuto] Added automotive_app_desc meta-data');
    }

    return mod;
  });
}

// ── 2. Modify build.gradle ──────────────────────────────────

function withAndroidAutoGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    const buildGradle = mod.modResults.contents;

    // Add the car app library dependency
    const carAppDep = "implementation 'androidx.car.app:app:1.4.0'";

    if (!buildGradle.includes('androidx.car.app:app')) {
      // Find the dependencies block and add our dependency
      const depBlockRegex = /dependencies\s*\{/;
      if (depBlockRegex.test(buildGradle)) {
        mod.modResults.contents = buildGradle.replace(
          depBlockRegex,
          `dependencies {\n    ${carAppDep}`
        );
        console.log('[withAndroidAuto] Added androidx.car.app:app dependency');
      } else {
        console.warn('[withAndroidAuto] Could not find dependencies block in build.gradle');
      }
    }

    return mod;
  });
}

// ── 3. Copy native source files ─────────────────────────────

function withAndroidAutoSourceFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android');

      // Determine the package directory
      const packageDir = path.join(
        androidDir,
        'app',
        'src',
        'main',
        'java',
        'com',
        'ecs',
        'androidauto'
      );

      // Create the package directory
      fs.mkdirSync(packageDir, { recursive: true });

      // Source files to copy — all vehicle display screens + infrastructure
      const sourceDir = path.join(projectRoot, 'plugins', 'android-auto', 'src');
      const sourceFiles = [
        'ECSCarAppService.kt',
        'ECSCarSession.kt',
        'ECSVehicleMapScreen.kt',
        'ECSVehicleStatusScreen.kt',
        'ECSVehicleWeatherScreen.kt',
        'ECSVehicleActionsScreen.kt',
        'ECSAndroidAutoConstants.kt',
        'ECSAndroidAutoModule.kt',
        'ECSAndroidAutoPackage.kt',
      ];

      for (const file of sourceFiles) {
        const srcPath = path.join(sourceDir, file);
        const destPath = path.join(packageDir, file);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`[withAndroidAuto] Copied ${file}`);
        } else {
          console.warn(`[withAndroidAuto] Source file not found: ${srcPath}`);
        }
      }

      // Create automotive_app_desc.xml resource
      const xmlDir = path.join(androidDir, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });

      const automotiveAppDesc = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="navigation" />
</automotiveApp>
`;

      fs.writeFileSync(
        path.join(xmlDir, 'automotive_app_desc.xml'),
        automotiveAppDesc,
        'utf-8'
      );
      console.log('[withAndroidAuto] Created automotive_app_desc.xml');

      return mod;
    },
  ]);
}

// ── 4. Register the NativeModule package ────────────────────

function withAndroidAutoPackageRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, 'android');

      // Find MainApplication.kt or MainApplication.java
      const mainAppDir = path.join(androidDir, 'app', 'src', 'main', 'java');

      // We need to find the actual MainApplication file
      // In Expo projects, it's typically at the package root
      const appJson = require(path.join(projectRoot, 'app.json'));
      const slug = appJson.expo?.slug || 'app';

      // Try to find MainApplication by walking the directory
      const findMainApplication = (dir) => {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const result = findMainApplication(fullPath);
            if (result) return result;
          } else if (
            entry.name === 'MainApplication.kt' ||
            entry.name === 'MainApplication.java'
          ) {
            return fullPath;
          }
        }
        return null;
      };

      const mainAppPath = findMainApplication(mainAppDir);

      if (mainAppPath) {
        let content = fs.readFileSync(mainAppPath, 'utf-8');

        // Check if our package is already registered
        if (!content.includes('ECSAndroidAutoPackage')) {
          // Add import
          const importLine = 'import com.ecs.androidauto.ECSAndroidAutoPackage';
          if (!content.includes(importLine)) {
            // Add import after the last import statement
            const lastImportIdx = content.lastIndexOf('import ');
            if (lastImportIdx !== -1) {
              const lineEnd = content.indexOf('\n', lastImportIdx);
              content =
                content.slice(0, lineEnd + 1) +
                importLine +
                '\n' +
                content.slice(lineEnd + 1);
            }
          }

          // Add package to getPackages()
          // Look for the packages list pattern
          if (content.includes('getPackages()')) {
            // Kotlin style: add to the packages list
            content = content.replace(
              /override fun getPackages\(\).*?=.*?listOf\(/s,
              (match) => match + '\n                ECSAndroidAutoPackage(),'
            );
          } else if (content.includes('PackageList')) {
            // Try adding after PackageList().packages
            content = content.replace(
              /PackageList\(this\)\.packages/,
              (match) => match + '.apply { add(ECSAndroidAutoPackage()) }'
            );
          }

          fs.writeFileSync(mainAppPath, content, 'utf-8');
          console.log('[withAndroidAuto] Registered ECSAndroidAutoPackage in MainApplication');
        }
      } else {
        console.warn(
          '[withAndroidAuto] MainApplication not found — package registration may need manual setup'
        );
      }

      return mod;
    },
  ]);
}

// ── Compose all modifications ───────────────────────────────

function withAndroidAuto(config) {
  config = withAndroidAutoManifest(config);
  config = withAndroidAutoGradle(config);
  config = withAndroidAutoSourceFiles(config);
  config = withAndroidAutoPackageRegistration(config);
  return config;
}

module.exports = createRunOncePlugin(
  withAndroidAuto,
  'ecs-android-auto',
  '1.0.0'
);
