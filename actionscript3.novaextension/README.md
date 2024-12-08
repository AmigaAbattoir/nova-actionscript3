# ActionScript 3 and MXML for Nova

Is a **Work In Progress** extension for ActionScript 3 & MXML.

It currently provides:

 * **Syntax Highlighting**

 * **Code Folding**

 * **Symbols** - *Note:* MXML children nodes not alway correct in the hierarchy.

 * **Issues** - (*Note:* needs an `asconfig.json` file to work)

 * **Language intelligence** - (*Note:* needs an `asconfig.json` file to work)

 * **Completions** for the following:
   * **ActionScript 3** - (*Note:* needs an `asconfig.json` file to work)
   * **MXML** - *Note:* Still wonky and also needs an `asconfig.json` file to work for
   * **AIR Descriptor XML** - Include descriptions on some of the AIR Descriptors tags.

 * **Clips** - *Note:* Still way early in progress.

 * **Tasks** - *Note:* Limited support for using Nova's Clean/Build/Run for AIR Desktop and Mobile (through Desktop). Also, limitted support for ANEs. Still looking into some mobile, and web (maybe with Ruffle too at some point).

 * **Exporting AIR Packages** - *Note:* Currently, limited to desktop/extendedDesktop AIR Bundle and Android .

## Notes

The LSP used is [BowlerHatLLC/vscode-as3mxml](https://github.com/BowlerHatLLC/vscode-as3mxml) V1.21.1 but Cleaning/Building/Running are done by the extension using `mxmlc` for compiling, packaging and running with `adt` from an (Harman) Adobe Air or Flex SDK.

I started setting up LSP using the [How to use the ActionScript and MXML language server with Sublime Text](https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text) from the repo's Wiki.

Also, took some stuff from [BowlerHatLLC/eclipse-as3mxml](https://github.com/BowlerHatLLC/eclipse-as3mxml/blob/master/language-configurations/actionscript.configuration.json)

`.tmLanguage` files converted using the converter [Nova Mate](https://github.com/gredman/novamate). However, the syntax provided with the AS3MXML is not to Nova's liking and didn't really catch everything. I stared ended up using the Syntax XML from Panic's Javascript extensions and making modifications from that.

## Requirements

ActionScript 3 requires the following to be installed on your Mac:

* Java

  * You may need JDK 11+ to avoid problems with ANEs. Sometime mxmlc will return "Error: null" when using Java 1.8.

* (Harman) Adobe Air or Flex SDK

  * Default location looked for is at `~/Applications/AIRSDK`, if you have others, your will need to change the extension settings.

## Usage

Cross your fingers and hope it runs! :-)

It should work if you open a files *.as, or *.mxml. If you open a folder that contains a Flash Builder project, it will ask if you want to change your project's settings (unless you change the extensions settings).

Currently, it requires an `asconfig.json` in the directory of the project for much of the completion and issues to work. (Looking into making that happen automatically).

### Configuration

To configure global preferences, open **Extensions → Extension Library...** then select ActionScript 3's **Preferences** tab.

You can also configure preferences on a per-project basis in **Project → Project Settings...**.

## FlashBuilder migration

A lot of the settings from Flash Builder can be imported to the Nova project's workspace settings. It will also generate Tasks for each build target there was in the Flash Builder project and set their preferences.

*NOTE:* Some options like Modules and Workers not implemented

### .flexProperties

Only using this to set if the project's Default Syntax is either MXML or ActionScript 3.

### .actionScriptProperties

Here's were most of the setting for the project come. It should pull most of these to help setup the Tasks like:

 * Main application path
 * Source dirs
 * Lib dirs
 * Additional compiler args

*NOTE:* Still need to check if there are variables in the Path

### .flexLibProperties

*NOTE:* Not read yet

### .project

It will read this and rename the Nova project to the same name as the FlashBuilder project.

If there is a tag of `<linkedResources>` with a `<type>` of 2, then warn the user that these types of links are not supported in Nova. But you could probably just make a symlink (or maybe the extension could do that at some point).

## Syntax Testing

For quick testing, I found [tszarzynski/ISampleInterface.as](https://gist.github.com/tszarzynski/3525530) which gives a fairly complete AS3 Class/Interface, which works nice for testing.
I included the files in the Example Code from [SampleClass/Event/Interface](https://gist.github.com/
https://codeload.github.com/gist/3525530/zip/94b4abd8d01b8eb2d5e4d55db66db16545f757e1)
