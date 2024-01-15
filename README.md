# ActionScript 3 Extension for Nova's Panic

Extension for ActionScript 3 and MXML in [Nova's Panic](https://nova.app/) using [Bowler Hat's AS3MXML](https://github.com/BowlerHatLLC/vscode-as3mxml) as an LSP and tasks for building/running.

More details about AS3MXML are in the [as3mxml.novaextension README.md](as3mxml.novaextension/README.md)

Currently a work in progress. Issues work, and some features like Jump to Definition work occasionally.

I think the Syntax is not to Nova's liking and doesn't fully recognize things, need to reworked.

## Notes

About [AIR Building](https://help.adobe.com/en_US/air/build/index.html)

About [AIR ADL command line](https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html)

## FlashBuilder migration

The [Pure JavaScript XML (pjxml)](https://github.com/smeans/pjxml) is used to help migrate some of the FlashBuilder setting to Nova.

Still working on having it automagically add tasks from the Flash Build project.

**@TODO**
 * Need to be able to add tasks
 * Need to change settings in the Task

For now, you need to manually add a Task, and then run the command from the menu command will log to console what the settings should be.

### .flexProperties

Only using this to set if the project's Default Syntax is either MXML or ActionScript 3.

### .actionScriptProperties

Used to grab some things used for a task like:

 * Main application path
 * Source dirs
 * Lib dirs
 * Additional compiler args

@TODO - Better parsing and automagically make a task

### .flexLibProperties

Not read yet.

### .project

It will read this and rename the Nova project to the same name as the FlashBuilder project.

@TODO: If there is a tag of `<linkedResources>` with a `<type>` of 2, then warn the user that these types of links are not supported.
