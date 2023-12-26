# AS3MXML - ActionScript 3 & MXML Extension for Nova's Panic

Extension for ActionScript 3 and MXML in [Nova's Panic](https://nova.app/) using [Bowler Hat's AS3MXML](https://github.com/BowlerHatLLC/vscode-as3mxml) LSP.

More details in the [as3mxml.novaextension README.md](as3mxml.novaextension/README.md)

Currently a work in progress. Issues work, and some features like Jump to Definition work occasionally. I think the Syntax is not to Nova's liking and doesn't fully recognise things.


## Todo

Migration from FlashBuilder:

### .actionScriptProperties

Read/parse, change setting for building etc.

### .project

Read these and see:

* '<name>' should be Project name, ask if they want to change this?

* If there is a tag of `<linkedResources>`, then warn the user, that they need to use symbolic links or copy the files.

### .settings

Not needed