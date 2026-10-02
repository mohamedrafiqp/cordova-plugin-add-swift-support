/*
* This hook adds all the needed config to implement a Cordova plugin with Swift.
*
*  - It adds a Bridging header importing Cordova/CDV.h if it's not already
*    the case. Else it concats all the bridging headers in one single file.
*
*    /!\ Please be sure not naming your bridging header file 'Bridging-Header.h'
*    else it won't be supported.
*
*  - It puts the ios deployment target to 7.0 in case your project would have a
*    lesser one.
*
*  - It updates the ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES build setting to YES.
*
*  - It updates the SWIFT_VERSION to 4.0.
*
*  - Fork of 2.0.2 (https://github.com/akofman/cordova-plugin-add-swift-support):
*    the Xcode project is resolved from disk instead of being derived from the
*    app name in config.xml, so the hook also works with the `App.xcodeproj`
*    layout shipped by cordova-ios 7 and above. The platform list is read from
*    the file system as well, so the hook no longer depends on internals of
*    cordova-lib.
*/

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');
const childProcess = require('child_process');
const semver = require('semver');
const glob = require('glob');

module.exports = context => {
  const projectRoot = context.opts.projectRoot;

  // This script has to be executed depending on the command line arguments, not
  // on the hook execution cycle.
  if ((context.hook === 'after_platform_add' && context.cmdLine.includes('platform add')) ||
    (context.hook === 'after_prepare' && context.cmdLine.includes('prepare')) ||
    (context.hook === 'after_plugin_add' && context.cmdLine.includes('plugin add'))) {
    getPlatformVersionsFromFileSystem(context, projectRoot).then(platformVersions => {
      const IOS_MIN_DEPLOYMENT_TARGET = '7.0';
      const platformPath = path.join(projectRoot, 'platforms', 'ios');
      const config = getConfigParser(context, path.join(projectRoot, 'config.xml'));

      let bridgingHeaderPath;
      let bridgingHeaderContent;
      let projectName;
      let projectPath;
      let pluginsPath;
      let iosPlatformVersion;
      let pbxprojPath;
      let xcodeProject;

      const COMMENT_KEY = /_comment$/;
      let buildConfigs;
      let buildConfig;
      let configName;

      platformVersions.forEach((platformVersion) => {
        if (platformVersion.platform === 'ios') {
          iosPlatformVersion = platformVersion.version;
        }
      });

      if (!iosPlatformVersion) {
        return;
      }

      const projectLayout = getProjectLayout(platformPath, config);

      if (!projectLayout) {
        console.error('cordova-plugin-add-swift-support: no Xcode project found in ' + platformPath + ', skipping.');
        return;
      }

      projectName = projectLayout.projectName;
      projectPath = projectLayout.projectPath;
      pbxprojPath = projectLayout.pbxprojPath;
      xcodeProject = xcode.project(pbxprojPath);
      pluginsPath = path.join(projectPath, 'Plugins');

      // cordova-ios 7+ ships Swift ready to use: the project template already
      // sets SWIFT_VERSION, SWIFT_OBJC_BRIDGING_HEADER, the runpath and the
      // deployment target. Only the bridging header and the plugin headers it
      // may import are left to do, the legacy build settings below would
      // otherwise downgrade an up to date project.
      const isLegacyLayout = semver.lt(iosPlatformVersion, '7.0.0');

      xcodeProject.parseSync();

      bridgingHeaderPath = getBridgingHeaderPath(projectPath, iosPlatformVersion);

      try {
        fs.statSync(bridgingHeaderPath);
      } catch (err) {
        // If the bridging header doesn't exist, we create it with the minimum
        // Cordova/CDV.h import.
        bridgingHeaderContent = ['//',
          '//  Use this file to import your target\'s public headers that you would like to expose to Swift.',
          '//',
          '#import <Cordova/CDV.h>'];
        fs.writeFileSync(bridgingHeaderPath, bridgingHeaderContent.join('\n'), { encoding: 'utf-8', flag: 'w' });
        xcodeProject.addHeaderFile('Bridging-Header.h');
      }

      buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();

      const bridgingHeaderProperty = '"$(PROJECT_DIR)/$(PROJECT_NAME)' + bridgingHeaderPath.split(projectPath)[1] + '"';

      for (configName in buildConfigs) {
        if (!COMMENT_KEY.test(configName)) {
          buildConfig = buildConfigs[configName];
          const currentBridgingHeader = xcodeProject.getBuildProperty('SWIFT_OBJC_BRIDGING_HEADER', buildConfig.name);
          // The cordova-ios 7+ template already wires the bridging header up
          // with `$(TARGET_NAME)`, rewriting it would only churn the project.
          const needsUpdate = currentBridgingHeader !== bridgingHeaderProperty &&
            (isLegacyLayout || typeof currentBridgingHeader === 'undefined');

          if (needsUpdate) {
            xcodeProject.updateBuildProperty('SWIFT_OBJC_BRIDGING_HEADER', bridgingHeaderProperty, buildConfig.name);
            console.log('Update IOS build setting SWIFT_OBJC_BRIDGING_HEADER to:', bridgingHeaderProperty, 'for build configuration', buildConfig.name);
          }
        }
      }

      // Look for any bridging header defined in the plugin
      glob('**/*Bridging-Header*.h', { cwd: pluginsPath }, (error, files) => {
        const bridgingHeader = path.basename(bridgingHeaderPath);
        const headers = files.map((filePath) => path.basename(filePath));

        // if other bridging headers are found, they are imported in the
        // one already configured in the project.
        let content = fs.readFileSync(bridgingHeaderPath, 'utf-8');

        if (error) throw new Error(error);

        headers.forEach((header) => {
          if (header !== bridgingHeader && !~content.indexOf(header)) {
            if (content.charAt(content.length - 1) !== '\n') {
              content += '\n';
            }
            content += '#import "' + header + '"\n';
            console.log('Importing', header, 'into', bridgingHeaderPath);
          }
        });
        fs.writeFileSync(bridgingHeaderPath, content, 'utf-8');

        if (isLegacyLayout) {
          for (configName in buildConfigs) {
            if (!COMMENT_KEY.test(configName)) {
              buildConfig = buildConfigs[configName];
              if (parseFloat(xcodeProject.getBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', buildConfig.name)) < parseFloat(IOS_MIN_DEPLOYMENT_TARGET)) {
                xcodeProject.updateBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', IOS_MIN_DEPLOYMENT_TARGET, buildConfig.name);
                console.log('Update IOS project deployment target to:', IOS_MIN_DEPLOYMENT_TARGET, 'for build configuration', buildConfig.name);
              }

              if (xcodeProject.getBuildProperty('ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES', buildConfig.name) !== 'YES') {
                xcodeProject.updateBuildProperty('ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES', 'YES', buildConfig.name);
                console.log('Update IOS build setting ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES to: YES', 'for build configuration', buildConfig.name);
              }

              if (xcodeProject.getBuildProperty('LD_RUNPATH_SEARCH_PATHS', buildConfig.name) !== '"@executable_path/Frameworks"') {
                xcodeProject.updateBuildProperty('LD_RUNPATH_SEARCH_PATHS', '"@executable_path/Frameworks"', buildConfig.name);
                console.log('Update IOS build setting LD_RUNPATH_SEARCH_PATHS to: @executable_path/Frameworks', 'for build configuration', buildConfig.name);
              }

              if (typeof xcodeProject.getBuildProperty('SWIFT_VERSION', buildConfig.name) === 'undefined') {
                if (config.getPreference('UseLegacySwiftLanguageVersion', 'ios')) {
                  xcodeProject.updateBuildProperty('SWIFT_VERSION', '2.3', buildConfig.name);
                  console.log('Use legacy Swift language version', buildConfig.name);
                } else if (config.getPreference('UseSwiftLanguageVersion', 'ios')) {
                  const swiftVersion = config.getPreference('UseSwiftLanguageVersion', 'ios');
                  xcodeProject.updateBuildProperty('SWIFT_VERSION', swiftVersion, buildConfig.name);
                  console.log('Use Swift language version', buildConfig.name);
                } else {
                  xcodeProject.updateBuildProperty('SWIFT_VERSION', '4.0', buildConfig.name);
                  console.log('Update SWIFT version to 4.0', buildConfig.name);
                }
              }

              if (buildConfig.name === 'Debug') {
                if (xcodeProject.getBuildProperty('SWIFT_OPTIMIZATION_LEVEL', buildConfig.name) !== '"-Onone"') {
                  xcodeProject.updateBuildProperty('SWIFT_OPTIMIZATION_LEVEL', '"-Onone"', buildConfig.name);
                  console.log('Update IOS build setting SWIFT_OPTIMIZATION_LEVEL to: -Onone', 'for build configuration', buildConfig.name);
                }
              }
            }
          }
        }

        // Only touch the project file when something actually changed, so that a
        // `prepare` on an already configured project is a no-op.
        const serializedProject = xcodeProject.writeSync();

        if (serializedProject !== fs.readFileSync(pbxprojPath, 'utf-8')) {
          fs.writeFileSync(pbxprojPath, serializedProject);
        }
      });
    }).catch((err) => {
      console.error('cordova-plugin-add-swift-support: ' + (err && err.message ? err.message : err));
    });
  }
};

const getConfigParser = (context, configPath) => {
  let ConfigParser;

  if (semver.lt(context.opts.cordova.version, '5.4.0')) {
    ConfigParser = context.requireCordovaModule('cordova-lib/src/ConfigParser/ConfigParser');
  } else {
    ConfigParser = context.requireCordovaModule('cordova-common/src/ConfigParser/ConfigParser');
  }

  return new ConfigParser(configPath);
};

/**
 * Resolves the Xcode project and the source folder that goes with it.
 *
 * Up to cordova-ios 6 the project was named after the app and generated as
 * `platforms/ios/<app name>.xcodeproj`, with the sources sitting in the
 * sibling `platforms/ios/<app name>/` folder. cordova-ios 7 and above always
 * generate `platforms/ios/App.xcodeproj` with the sources in
 * `platforms/ios/App/`, so the name has to be read from disk: relying on
 * `config.name()` makes the hook fail with ENOENT on modern cordova-ios.
 */
const getProjectLayout = (platformPath, config) => {
  const xcodeproj = fs.existsSync(platformPath)
    ? fs.readdirSync(platformPath).find((entry) => path.extname(entry) === '.xcodeproj')
    : null;

  if (xcodeproj) {
    const projectName = path.basename(xcodeproj, '.xcodeproj');
    const projectPath = path.join(platformPath, projectName);
    const pbxprojPath = path.join(platformPath, xcodeproj, 'project.pbxproj');

    if (fs.existsSync(pbxprojPath) && fs.existsSync(projectPath)) {
      return { projectName, projectPath, pbxprojPath };
    }
  }

  // Fall back to the legacy layout, for projects not created with cordova-ios 7+.
  const projectName = config.name();
  const projectPath = path.join(platformPath, projectName);
  const pbxprojPath = path.join(platformPath, projectName + '.xcodeproj', 'project.pbxproj');

  if (fs.existsSync(pbxprojPath)) {
    return { projectName, projectPath, pbxprojPath };
  }

  return null;
};

const getBridgingHeaderPath = (projectPath, iosPlatformVersion) => {
  let bridgingHeaderPath;

  if (semver.lt(iosPlatformVersion, '4.0.0')) {
    bridgingHeaderPath = path.posix.join(projectPath, 'Plugins', 'Bridging-Header.h');
  } else {
    bridgingHeaderPath = path.posix.join(projectPath, 'Bridging-Header.h');
  }

  return bridgingHeaderPath;
};

const getPlatformVersionsFromFileSystem = (context, projectRoot) => {
  const platformsPath = path.join(projectRoot, 'platforms');
  const platformsOnFs = listPlatforms(platformsPath);
  const platformVersions = platformsOnFs.map(platform => {
    const script = path.join(platformsPath, platform, 'cordova', 'version');
    return new Promise((resolve, reject) => {
      childProcess.exec('"' + script + '"', {}, (error, stdout, _) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    }).then(result => {
      const version = result.replace(/\r?\n|\r/g, '');
      return { platform, version };
    }, (error) => {
      console.log(error);
      process.exit(1);
    });
  });

  return Promise.all(platformVersions);
};

/**
 * Mirrors `cordova-lib`'s `listPlatforms`, without depending on cordova-lib
 * internals that move between Cordova releases.
 */
const listPlatforms = (platformsPath) => {
  if (!fs.existsSync(platformsPath)) {
    return [];
  }

  return fs.readdirSync(platformsPath).filter(platform => {
    try {
      return fs.statSync(path.join(platformsPath, platform)).isDirectory();
    } catch (err) {
      return false;
    }
  });
};
