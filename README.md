# ActionScript 3 Extension for Panic's Nova

Extension for ActionScript 3 and MXML in [Panic's Nova](https://nova.app/) using [Bowler Hat's AS3MXML](https://github.com/BowlerHatLLC/vscode-as3mxml) as an LSP (which only works if there's an `asconfig.json` in the directory).

And uses Panic Nova's tasks cleaning/building/running, which can be pull in from Flash Builder configuration files.

More details about ActionScript 3 for Nova are in the [actionscript3.novaextension README.md](actionscript3.novaextension/README.md)

Currently a work in progress. Issues work, and some features like Jump to Definition work occasionally.

# Syntax check

The syntax provided with the AS3MXML is not to Nova's liking and doesn't fully recognize things, needs to reworked.

I stared working on using the Syntax XML from Panic's Javascript extensions, and have made a bit of progress.

* May need to check variable names. Think JS doesn't allow $ in the name, but AS3 does

## Notes

About [AIR Building](https://help.adobe.com/en_US/air/build/index.html)

About [AIR ADL command line](https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html)

## FlashBuilder migration

A lot of the settings from Flash Builder can be imported to the Nova project's workspace settings.

**@TODO**
 * Import Flash Builder project when opening a project for the first time.
 * Make an "Export Build" look for tasks and allow you to select which ones to build.

### .flexProperties

Only using this to set if the project's Default Syntax is either MXML or ActionScript 3.

### .actionScriptProperties

Used to grab some things used for a task like:

 * Main application path
 * Source dirs
 * Lib dirs
 * Additional compiler args

### .flexLibProperties

Not read yet.

### .project

It will read this and rename the Nova project to the same name as the FlashBuilder project.

If there is a tag of `<linkedResources>` with a `<type>` of 2, then warn the user that these types of links are not supported in Nova.

