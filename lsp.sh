#!/bin/zsh

echo "Attempting to start AS3MXML from terminal!"
java -Droyalelib='/Applications/Apache Flex/SDKs/4.16.1-AIR32/frameworks' -Dfile.encoding=UTF8 -cp "/Users/abattoir/Documents/ActualWork/Programs/Nova/AS3MXML.novaextension/language-server/bundled-compiler/*:/Users/abattoir/Documents/ActualWork/Programs/Nova/AS3MXML.novaextension/language-server/bin/*" com.as3mxml.vscode.Main