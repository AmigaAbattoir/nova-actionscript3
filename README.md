# ActionScript 3 Extension for Panic's Nova

Extension for ActionScript 3 and MXML in [Panic's Nova](https://nova.app/) using [Bowler Hat's AS3MXML](https://github.com/BowlerHatLLC/vscode-as3mxml) as an LSP (which only works if there's an `asconfig.json` in the directory).

And uses Panic Nova's tasks cleaning/building/running.

More details about AS3MXML are in the [actionscript3.novaextension README.md](actionscript3.novaextension/README.md)

Currently a work in progress. Issues work, and some features like Jump to Definition work occasionally.

# Syntax check

The syntax provided with the AS3MXML is not to Nova's liking and doesn't fully recognize things, need to reworked.

I stared working on using the Syntax XML from Panic's Javascript extensions, and have made a bit of progress.

* May need to check variable names. Think JS doesn't allow $ in the name, but AS3 does

## Notes

About [AIR Building](https://help.adobe.com/en_US/air/build/index.html)

About [AIR ADL command line](https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html)

## FlashBuilder migration

A lot of the settings from Flash Builder can be imported to the Nova project's workspace settings. (Task may be added too)

**@TODO**
 * Import Flash Builder project when opening the first time.
 * Try to automatically add a task to the project (based on AIR/Mobile/Web)

For now, you need to manually add a Task, and then run the command from the menu command will log to console what the settings should be.

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
