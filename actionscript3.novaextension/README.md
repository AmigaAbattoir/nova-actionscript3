# ActionScript 3 and MXML for Nova

Is a **Work In Progress** extension for ActionScript 3 & MXML.

The goal was to be able to have a replacement for my old Flash Build projects, where I wouldn't need to change settings and the extension would do all the lifting. Ideally, it will just grab the old Flash Builder settings, and set everything up for me, and it's pretty close to that, but not really complete with all the abilities of Flash Builder.

It currently provides:

 * **Syntax Highlighting**

 * **Code Folding**

 * **Symbols** - *Note:* MXML children nodes do not show up correctly in the hierarchy.

 * **Issues**

 * **Language intelligence**

 * **Completions** for the following:
   * **ActionScript 3**
   * **MXML** - *Note:* Still wonky
   * **AIR Descriptor XML** - Include descriptions on most of the AIR Descriptors tags.

 * **Clips** - *Note:* Still way early in progress.

 * **Tasks** - *Note:* Limited support for using Nova's Clean/Build/Run for AIR Desktop and Mobile (through Desktop). Also, limited support for ANEs. Still looking into some mobile, and web (maybe with Ruffle too at some point).

 * **Exporting AIR Packages** - *Note:* Currently, limited to desktop/extendedDesktop AIR Bundle and Android projects.

## Todo

 * Building iOS
 * Launching on device
 * Building AS3 Libs

## Notes

The LSP used is [BowlerHatLLC/vscode-as3mxml](https://github.com/BowlerHatLLC/vscode-as3mxml) V1.21.1 but Cleaning/Building/Running are done by the extension using `mxmlc` for compiling, packaging and running with `adt` from an (Harman) Adobe Air or Flex SDK.

For the Issues, language intelligence and completions to work, it requires an `asconfig.json` in the project folder. The extension will attempt to auto-generate one. If you have used the VSCode extension, you can disable the automatic generation in the configurations.

## Requirements

ActionScript 3 requires the following to be installed on your Mac:

* Java

  * You may need JDK 11+ to avoid problems with ANEs. Sometime mxmlc will return "Error: null" when using Java 1.8.

* (Harman) Adobe Air or Flex SDK

  * Default location looked for is at `~/Applications/AIRSDK`, if you have others, your will need to change the extension settings.

## Optional

* Flash Player

 * You can still use a standalone Flash Player to launch Flash projects

* Ruffle

 * You can use Ruffle if you want to launch a Flash project, instead of Flash Player

* Old version of Chrome and PPAPI Flash Player

 * If you really want to live dangerously, why not throw on an old version of Chrome or Chromium and an old version (not like there's a new one) of the PPAPI Flash Player.

## Usage

It should work if you open a files `*.as`, or `*.mxml`.

If you open a folder that contains a Flash Builder project (and has `.actionScriptProperties`, `.flexProperies`, and `.project`), it will ask if you want to import the Flash Builder project and change your Nova project's settings. If you want, you can also change this setting in the **Extensions → Settings → Additional Options...**. Also, you can use the menu option **Extensions → ActionScript 3 → Import FlashBuilder settings...** to change your project's settings to those used by a Flash Builder project at your request.

Since the LSP AS3MXML requires requires an `asconfig.json` for most of the code intelligence and completions, the extension will ask if you want to have it generate one and automatically update it. If you select update, it should only change options that are needed in this extension. Building options are not changed in the `asconfig.json` and not used by this extension.

*NOTE:* If building a Flash project, and using the Ruffle template, you will need to use Nova's External Preview since Ruffle does not allow the use of "file:" protocol for loading SWFs.

## Configuration

To configure global preferences, open **Extensions → Extension Library...** then select ActionScript 3's **Preferences** tab.

You can also configure preferences on a per-project basis in **Project → Project Settings...**.

Tasks also have a bunch of options too! Don't miss out on **Project → Tasks → Edit Task...**

## FlashBuilder migration

A lot of the settings from Flash Builder can be imported to the Nova project's workspace settings. It will also generate Tasks for each build target there was in the Flash Builder project and set their preferences.

*NOTE:* Some options like Modules and Workers are currently not implemented (I didn't have any projects that used it to test with).

### .flexProperties

Only using this to set if the project's **Default Syntax** is either *MXML* or *ActionScript 3*.

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

---

## Developer Notes

I started setting up LSP using the [How to use the ActionScript and MXML language server with Sublime Text](https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text) from the repo's Wiki.

Also, took some stuff from [BowlerHatLLC/eclipse-as3mxml](https://github.com/BowlerHatLLC/eclipse-as3mxml/blob/master/language-configurations/actionscript.configuration.json)

`.tmLanguage` files converted using the converter [Nova Mate](https://github.com/gredman/novamate). However, the syntax provided with the AS3MXML is not to Nova's liking and didn't really catch everything. I ended up using the Syntax XML from Panic's Javascript extensions and making modifications from that.

### Syntax Testing

For quick testing, I found [tszarzynski/ISampleInterface.as](https://gist.github.com/tszarzynski/3525530) which gives a fairly complete AS3 Class/Interface, which works nice for testing. I included the files in the Example Code from [SampleClass/Event/Interface](https://gist.github.com/
https://codeload.github.com/gist/3525530/zip/94b4abd8d01b8eb2d5e4d55db66db16545f757e1)
