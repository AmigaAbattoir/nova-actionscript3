# Changelog

The format is based on [Keep a Changelog 1.1](http://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning 2.0](http://semver.org/spec/v2.0.0.html).

## [0.11.0] - Unreleased

### Changed

- Now uses a list of installed SDKs instead of one line for entering the location
  - This will move the "Default AIR SDK" to the first "Installed SDKs" automatically if updating from an older version
- Task like `AIR`, `Flash`, `AIR - iOS` and `AIR - Android` can have a different SDK used for building
- Modified how the `-app.xml` is changed so it should work if you have a mix of Flex and ActionScript tasks and want to use the same project
- Android and iOS device simulators are stored in a JSON file (so eventually we can modify it)
- Update NS3X2J to match Ant extension's code base

### Added

- Warns that code intelligence may not work when open ActionScript files outside of a project
- Android and iOS Tasks can detect devices and store them (still need to implement running on the device...)

### Fixed

- Exporting a package with an empty custom ANEs would fail
- Exporting with ANEs would try to include unpacked ANEs instead
- Does not ask to import Flash Builder if a file is opened outside of a project
- Creating new Flex Mobile projects

## [0.10.1] - 2025-07-01

### Added

- When building for desktop, if the descriptor doesn't have icons for 16x16, 32x32, 48x48, and 128x128, warn that the app icon will be an empty, default Mac icon

### Fixed

- If packaging failed, no notice would show up

## [0.10.0] - 2025-06-01

### Added

- Added initial support for debugging
- Added note about AIR flair option in Android build
- ANEs are packaged with export project

### Changed

- Includes DPI to simulator devices
- ANEs are extracted to a temp directory

### Fixed

- `determineProjectUUID()` used nova.crypto which was only available in Nova 10, added check and alternate way to generate uuid for Nova 9 and below
- Import Flash Builder adds ANEs correctly to Tasks.
- If using an different AIRSDK for a Task, the descriptor would check the project's AIRSDK version instead of the one for the Task.

## [0.9.0] - 2025-04-13

### Fixed

- Variable without declarations broke syntax highlighting
- When exporting, sometime the workspace's path would be appended twice

### Added

- MXML now has CSS highlighting style block
- Can now have custom build/run folder per task
- Can create new ActionScript and Flex projects
- Added options for new projects and an import Flash Builder to set build on run and show output on run options

## [0.8.1] - 2025-03-02

### Fixed

- Storing password in keychain for certificates

### Added

- Includes homepage and repo in extension

## [0.8.0] - 2025-02-25

### Added

- More work on getting AS3MXML integrated
- More documentation in README.md
- Added "Clips" for completion of AS3/MXML content (would have liked to do it through Completions XMLs, but they would not show up properly)
- Added building and running Flash projects.
- Added building of Library projects.
- Prompts to import Flash Builder projects when opening
- Extension preference, to suppress asking to import Flash Builder project.
- Checks Flash Builder project for sources file to exclude when building Flash projects
- Prompts to automatically update an existing `asconfig.json` file
- Will generate an `asconfig.json` file if one is not in the project
- If there are more than one Task when Exporting Release Build, it will prompt you for which one to build.
- Add Timestamp option, so you can specify a different RFC3161-compliant timestamp server to use
- Added options for stand alone Flash Player, Ruffle and an old web browser to use for launching. (Preferably Chrome <88)
- Added some more modern device options (made Google Sheet https://docs.google.com/spreadsheets/d/1RlsuMwYp-ANTerziv12LxxH47GIsoeeBSdaEUdCDY5E/edit?gid=0#gid=0) to launching simulator
- Can store or clear stored passwords for certificates from menu
- Can store certificate password for just the session
- When exporting a release package, it will verify the password before trying to build the package
- Adds warning if using an old Flex/AIR SDK
- Checks the AIR descriptor to see if it matches what's being used to build
- Added option to force Halo theme for projects (still need work on Themes from FB)

### Changed

- Using AS3MXML V 1.22.0
- Make Exporting Release rely more on values in Tasks, making them different tasks per device
- Import Flash Builder handles libraries better (still needs work)
- Changed images to adhere to Panic's sizing and folder layout
- Changed this changelog to a format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and that this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.2] - 2024-10-06

### Changed

- Got completions working from the completion XMLs.

### Added

- Added completions for AIR Descriptor XMLs.

## [0.7.1] - 2024-09-27

### Changed

- Made each Task have it's own build/packaging setting.

## [0.7.0] - 2024-07-06

### Changed

- Replaced other XML parser stuff and updated code to use NS3X2J for parsing FlashBuilder's XML files.

## [0.6.1] - 2024-02-24

### Added

- Builds projects with ANEs.

### Changed

- Restructured code.

## [0.6.0] - 2024-02-22

### Added

- Attempts to get packaging an AIR package.

### Changed

- Replaced syntaxes with regex syntaxes from older version of Nova and modified. Seems to work better.
- Changed structure of tasks to call functions to handle building and running from Nova.

## [0.5.1] - 2024-01-27

### Changed

- Converted configs for Tasks to be part of workspace configs.

## [0.5.0] - 2024-01-14

### Added

- Started implementing Tasks to clean/build/run project.

## [0.4.1] - 2023-09-16

### Changed

- Minor changes to the AS3 syntax.
- Added some tests to see if hover and code actions are working.

## [0.4.0] - 2023-05-21

### Changed

- Setup configuration for the extension based on that of the VSCode one, even if they don't seem like they will work in Nova (like the SDK picker).
- Using V1.17.0 of Bowler Hat's AS3MXML language-server.

## [0.3.0] - 2023-01-27

### Changed

- No longer using a bash script to start the LSP.

## [0.2.0] - 2023-01-12

### Changed

- Using hard coded bash script to start LSP.
- Warning/Errors pop up now under issues view!
- Folding of AS3 code blocks and comments working, however, classes and function not properly parsed

## [0.1.0] - 2022-12-27

First commit - not working.
