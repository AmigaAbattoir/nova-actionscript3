# ActionScript 3 and MXML Extension for Panic's Nova

*(Currently a work in progress)*

Extension for ActionScript 3 and MXML in [Nova](https://nova.app/) using [Bowler Hat's AS3MXML](https://github.com/BowlerHatLLC/vscode-as3mxml) as the LSP.

It uses Tasks for cleaning/building/running, which can be set for either Flash, AIR, Android, or iOS.

It can import Flash Builder projects and generate these Tasks automatically, which then can be used to export release from these projects.

More details about ActionScript 3 for Nova are in the [actionscript3.novaextension README.md](actionscript3.novaextension/README.md)

---

## Developer Notes

I started setting up LSP using the [How to use the ActionScript and MXML language server with Sublime Text](https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text) from the repo's Wiki.

Also, took some stuff from [BowlerHatLLC/eclipse-as3mxml](https://github.com/BowlerHatLLC/eclipse-as3mxml/blob/master/language-configurations/actionscript.configuration.json)

`.tmLanguage` files converted using the converter [Nova Mate](https://github.com/gredman/novamate). However, the syntax provided with the AS3MXML is not to Nova's liking and didn't really catch everything. I ended up using the Syntax XML from Panic's Javascript extensions and making modifications from that.

### Syntax Testing

For quick testing, I found [tszarzynski/ISampleInterface.as](https://gist.github.com/tszarzynski/3525530) which gives a fairly complete AS3 Class/Interface, which works nice for testing. I included the files in the Example Code from [SampleClass/Event/Interface](https://gist.github.com/
https://codeload.github.com/gist/3525530/zip/94b4abd8d01b8eb2d5e4d55db66db16545f757e1)

## Flash Builder migration

This extension tried to read the configuration files from an Adobe Flash Builder project files (`.flexProperties`, `.flexLibProperties`, `.actionScriptProperties`,`.project`) and convert it into things that can be used in Nova. It will read a lot of the settings from those files and adjust the Nova project's workspace settings. It will also generate Tasks for each build target that there was in the Flash Builder project and set their preferences.

*NOTES:*

 * There are additional setting in the Tasks that you may need to set, depending on how you want to export them, since it seems that the Flash Builder project files do not store the type of export in the project files (or maybe I couldn't find it).

 * Some options like Modules and Workers are currently not implemented (I didn't have any projects that used it to test with).

Here's some notes on the files read from a Flash Builder project:

### .project

It will read this and rename the Nova project to the same name as the FlashBuilder project.

If there is a tag of `<linkedResources>` with a `<type>` of 2, then warn the user that these types of links are not supported in Nova. But you could probably just make a symlink (or maybe the extension could do that at some point).

### .flexProperties

Only using this to set if the project's **Default Syntax** is either *MXML* or *ActionScript 3*.

### .flexLibProperties

Only used to see if this is a library project, and will assign a AS3 Library Task to the project

### .actionScriptProperties

Here's were most of the setting for the project come. It should pull most of these to help setup the Tasks like:

 * Main application path
 * Source dirs
 * Lib dirs
 * Additional compiler args

*NOTE:* Still need to check if there are variables in the path values

## AIR Notes

It appears that prior to AIR 20, was the first fully 64bit SDK. Prior to that, may run into problems trying to run applications. Building should be okay.