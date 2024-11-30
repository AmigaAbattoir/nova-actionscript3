# Changelog

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Started added clips and completions
- Added some more modern device options (made Google Sheet https://docs.google.com/spreadsheets/d/1RlsuMwYp-ANTerziv12LxxH47GIsoeeBSdaEUdCDY5E/edit?gid=0#gid=0)
- More work on getting AS3MXML integrated
- Prompts to import Flash Builder projects when opening
- If extension preference is set, opening a project will ask if you want to Import Flash Builder project.
- Also check Flash Builder project for sources file to exclude when building Flash projects
- If there are more than one Task when Exporting Release Build, it will prompt you for which one to build.
- Add Timestamp option, so you can specify a different RFC3161-compliant timestamp server to use

### Changed

- Using AS3MXML V 1.21.1
- Make Exporting Release rely more on values in Tasks, making them different tasks per device
- Changed to a format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
