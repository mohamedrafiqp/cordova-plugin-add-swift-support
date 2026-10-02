[![npm version](https://badge.fury.io/js/cordova-plugin-add-swift-support.svg)](https://badge.fury.io/js/cordova-plugin-add-swift-support) [![Build Status](https://travis-ci.org/akofman/cordova-plugin-add-swift-support.svg?branch=master)](https://travis-ci.org/akofman/cordova-plugin-add-swift-support) [![npm](https://img.shields.io/npm/dm/cordova-plugin-add-swift-support.svg)]()

# cordova-plugin-add-swift-support

![swift-128x128](https://cloud.githubusercontent.com/assets/579922/15999501/79196b48-3146-11e6-836e-061a7ef53571.png)

This [Cordova plugin](https://www.npmjs.com/package/cordova-plugin-add-swift-support) adds the Swift support to your iOS project.

## Fork: cordova-ios 7+ support

This is a fork of `2.0.2`, which fails on any project generated with cordova-ios 7 or
above, including cordova-ios 8:

```
Error: ENOENT: no such file or directory, open
'platforms/ios/<app name>.xcodeproj/project.pbxproj'
```

`2.0.2` derives the Xcode project name from the app name in `config.xml`, while
cordova-ios 7+ always generates `platforms/ios/App.xcodeproj` with the sources in
`platforms/ios/App/`.

What changed in `2.0.3`:

- The Xcode project and its source folder are resolved from the file system, so both
  the legacy (`<app name>.xcodeproj` + `<app name>/`) and the modern (`App.xcodeproj` +
  `App/`) layouts are supported.
- On cordova-ios 7+ the hook only makes sure the bridging header exists and that
  plugin bridging headers are imported into it. The project template of cordova-ios 7+
  already sets `SWIFT_VERSION`, `SWIFT_OBJC_BRIDGING_HEADER`,
  `LD_RUNPATH_SEARCH_PATHS` and `IPHONEOS_DEPLOYMENT_TARGET`, so the legacy build
  setting updates are skipped instead of downgrading a current project.
- The project file is only rewritten when something actually changed, which makes
  `cordova prepare` a no-op on an already configured project.
- The platform list is read from `platforms/` instead of
  `cordova-lib/src/cordova/util`, an internal that is not part of the public API.
- Hook failures are logged instead of crashing the build with an unhandled rejection.

The plugin is still required by `cordova-plugin-chooser`, which declares
`<dependency id="cordova-plugin-add-swift-support" version="*" />`. Install this fork
as a top level plugin so that dependency resolves to it:

```
cordova plugin add github:<owner>/cordova-plugin-add-swift-support --save
```

## Installation

You can add this plugin directly to your project:

`cordova plugin add cordova-plugin-add-swift-support --save`

Or add it as a dependency into your own plugin:

`<dependency id="cordova-plugin-add-swift-support" version="2.0.2"/>`

By default, the Swift 4 support is added but the legacy version (2.3) can still be configured as a preference, inside the project's `config.xml`, within the `<platform name="ios">` section:

`<preference name="UseLegacySwiftLanguageVersion" value="true" />`

Or it is possible to specify the version as following, inside the project's `config.xml`, within the `<platform name="ios">` section:

`<preference name="UseSwiftLanguageVersion" value="5" />`

If needed, add a prefixed Bridging-Header file in your plugin in order to import frameworks (MyPlugin-Bridging-Header.h for instance).
As an example you can have a look at this [plugin](https://github.com/akofman/cordova-plugin-permissionScope).

If the `cordova-plugin-add-swift-support` plugin is already installed to your project, then you can add your own Swift plugin as usual, its prefixed Bridging-Header will be automatically found and merged.

## Contributing

The src folder contains ECMAScript 2015 source files, the minimum Node.js version is `6` (Boron).

## License

MIT
