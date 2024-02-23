# ActionScript 3 for Nova

Is an **Experimental/ _(kinda not)_ Work _(ing)_ In Progress** extension that uses the ActionScript & MXML language server.

It currently provides for ActionScript 3 files:

 * **Symbols** - *NOTE:* Not correctly showing it in the hierarchy properly

 * **Language intelligence**
   * Issues (*Note:* needs an `asconfig.json` file to work)

 * **Tasks** -  *NOTE:* Limited support for using Nova's Clean/Build/Run for AIR Desktop apps. Looking into mobile, and web (maybe with Ruffle too at some point)

 * **Exporting AIR Packages** - *NOTE:* Currently, limited to desktop/extendedDesktop AIR builds

## Notes

The LSP used to gather issues is [BowlerHatLLC/vscode-as3mxml](https://github.com/BowlerHatLLC/vscode-as3mxml) V1.20.1. V1.20.1.

Started setting up LSP using the [How to use the ActionScript and MXML language server with Sublime Text](https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text) from the repo's Wiki.

Also, took some stuff from [BowlerHatLLC/eclipse-as3mxml](https://github.com/BowlerHatLLC/eclipse-as3mxml/blob/master/language-configurations/actionscript.configuration.json)

`.tmLanguage` files converted using the converter [Nova Mate](https://github.com/gredman/novamate)

I don't think its syntaxes work with Nova well. I am in the process of reworking to so that Nova will give the correct symbols.

Cleaning/Building/Running are done by using `mxmlc` for compiling, packaging and running with `adt` from an (Harman) Adobe Air or Flex SDK.

## Requirements

ActionScript 3 requires the following to be installed on your Mac:

* Java

* (Harman) Adobe Air or Flex SDK

  * Default location looked for is at `~/Applications/AIRSDK`, if you have others, your will need to change the extension settings.

## Usage

Cross your fingers and hope it runs!

### Configuration

To configure global preferences, open **Extensions → Extension Library...** then select ActionScript 3's **Preferences** tab. Some work, some do not.

You can also configure preferences on a per-project basis in **Project → Project Settings...**, also, some work some do not.

## Syntax Testing

For quick testing, I found [tszarzynski/ISampleInterface.as](https://gist.github.com/tszarzynski/3525530) which gives a fairly complete AS3 Class/Interface, which works nice for testing.
I included the files in the Example Code from [SampleClass/Event/Interface](https://gist.github.com/
https://codeload.github.com/gist/3525530/zip/94b4abd8d01b8eb2d5e4d55db66db16545f757e1)