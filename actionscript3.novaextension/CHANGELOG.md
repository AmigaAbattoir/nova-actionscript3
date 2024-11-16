## Version 0.7.3

* Added some more modern device options (made Google Sheet https://docs.google.com/spreadsheets/d/1RlsuMwYp-ANTerziv12LxxH47GIsoeeBSdaEUdCDY5E/edit?gid=0#gid=0)
* Using AS3MXML V 1.21.1
* More work on getting AS3MXML integrated
* Started added clips and completions
* Make Exporting Release rely more on values in Tasks, making them different tasks per device

## Version 0.7.2

* Got completions working from the completion XMLs.
* Added completions for AIR Descriptor XMLs.

## Version 0.7.1

* Made each Task have it's own build/packaging setting.

## Version 0.7.0

* Removed other XML parser stuff and updated code to use NS3X2J for parsing FlashBuilder's XML files.

## Version 0.6.1

* Builds projects with ANEs
* Restructured code

## Version 0.6.0

* Attempts to get packaging an AIR package
* Replaced syntaxes with regex syntaxes from older version of Nova and modified. Seems to work better
* Changed structure of tasks to call functions to handle building and running from Nova.

## Version 0.5.1

* Converted configs for Tasks to be part of workspace configs

## Version 0.5.0

* Started implementing Tasks to clean/build/run project

## Version 0.4.1

* Minor changes to the AS3 syntax
* Added some tests to see if hover and code actions are working

## Version 0.4.0

* Setup configuration for the extension based on that of the VSCode one, even if they don't seem like they will work in Nova (like the SDK picker)
* Using V1.17.0 of Bowler Hat's AS3MXML language-server

## Version 0.3.0

* No longer using a bash script to start the LSP

## Version 0.2.0

* Using hard coded bash script to start LSP
* Warning/Errors pop up now under issues view!
* Folding of AS3 code blocks and comments working, however, classes and function not properly parsed

## Version 0.1.0

First commit - not working
