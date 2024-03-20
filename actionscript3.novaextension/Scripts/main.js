const { ActionScript3TaskAssistant } = require("./task-assistant.js");
const { showNotification, consoleLogObject, rangeToLspRange } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, determineFlexSDKBase } = require("./config-utils.js");

var langserver = null;
var taskprovider = null;

exports.activate = function() {
    langserver = new AS3MXMLLanguageServer();
    taskprovider = new ActionScript3TaskAssistant();

    nova.assistants.registerTaskAssistant(taskprovider, {
        identifier: "actionscript",
    });

    //                                          [ Nova stuff...                     ][ Our params to pass]
	nova.commands.register("actionscript.clean",(workspace, workspacePath, sourcePath, outputPath) => {
        //                 [ Nova stuff...          ][ Our params...]
		taskprovider.clean(workspacePath, sourcePath, outputPath);
	});

	nova.commands.register("actionscript.run",(workspace, workspacePath, sourcePath, flexSDKBase, profile, destDir, appXMLName) => {
		taskprovider.run(workspace, workspacePath, sourcePath, flexSDKBase, profile, destDir, appXMLName);
	});

	nova.commands.register("actionscipt.importFBSettings",() => {
		taskprovider.importFlashBuilderSettings();
	});

	nova.commands.register("actionscipt.clearExportPassword",() => {
		var projectUUID =  nova.workspace.config.get("as3.application.projectUUID");
		try {
			nova.credentials.removePassword(projectUUID,"release-build");
			showNotification("Remove Password", "Successfully removed password from your keychain!")
		} catch(error) {
			nova.workspace.showErrorMessage("Remove Password Failedn\n\nEither the Project's UUID is wrong, or there was no password");
		}
	});

	nova.commands.register("actionscipt.exportRelease",() => {
		taskprovider.packageBuild();
	});

	nova.commands.register("actionscript3.paneltest", (editor) => {
		if (nova.inDevMode()) { console.log("Called... actionscript3.paneltest"); }

		/*
		// Lookie at https://docs.nova.app/api-reference/workspace/#showinputpalettemessage-options-callback
		nova.workspace.showErrorMessage("ERROR!!!\n\n You failed! There is a serious problem with the this and that!");
		nova.workspace.showWarningMessage("WARNING!!! Do not take candy from strangers!");
		nova.workspace.showInformativeMessage("INFO!!! Your a nice person! I thought you should know that.");
		*/

		/*
		nova.workspace.showActionPanel("Messages here", { buttons: [ "Save","This Time","Cancel"] },
			(something) => {
				console.log(" SOMETHNG: " + something);
			}
		);

		nova.workspace.showChoicePalette(["Messages","here","dafsdf"], { buttons: [ "Save","This Time","Cancel"] },
			(something) => {
				console.log(" SOMETHNG: " + something);
			}
		);

		// Try replacing them, may be better for Release building!
		nova.workspace.showInputPanel('Enter new <b> asdlomsdom  </b> **SODSD** _SDJS_ \n This is the filename:',
			{ label: "Password", prompt: "Do it now!", secure: true, choices: ["this","that"], checkbox: true },
			async (newFileName) => {
				if (newFileName) {
					// Execute your task with the new filename
					await this.renameFile(newFileName);
				} else {
					nova.workspace.showErrorMessage('Invalid filename. Please enter a valid name.');
				}
			}
		);
		*/
	});

	nova.commands.register("actionscipt.as3reference",() => { nova.openURL("https://airsdk.dev/reference"); });
/*
    if (nova.inDevMode()) {
        console.log(">>>> AS3MXML Activated");
        console.log("  >> langserver.languageClient:  " + langserver.languageClient);
        console.log("  >> JSON.stringify(langserver): " + JSON.stringify(langserver));
    }
*/
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    if (nova.inDevMode()) { console.log("<<<< AS3MXML Deactivated"); }

    if (langserver) {
        langserver.deactivate();
        langserver = null;
    }
    taskprovider = null;
}

class AS3MXMLLanguageServer {
    languageClient = null;

    constructor() {
        // Observe the configuration setting for the server's location, and restart the server on change
        /*
        nova.config.observe('as3mxml.language-server-path', function(path) {
            this.start(path);
        }, this);
        */
        var path = nova.extension.path;
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Constructor -----------------------------------------------------");
            console.log(" *** Constructing AS3MXML Extension with PATH: ",path);
        }
        this.start(nova.extension.path)
    }

    activate() { }

    deactivate() {
        if (nova.inDevMode()) {
            console.log(" *** AS3MXML Deactivated");
        }
        this.stop();
    }

    start(path) {
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Start(path)-----------------------------------------------------");
            console.log(" *** path: " + path);
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log("Language client is active, so let's stop it and remove the subscription!");
            }
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
        }

        var base =  nova.path.join(nova.extension.path, "language-server");

		var flexSDKBase = determineFlexSDKBase();

        if (nova.inDevMode()) {
            console.log("     PATH:: [[" + path + "]]");
            console.log("     BASE:: [[" + base + "]]");
            console.log("     FLEX:: [[" + flexSDKBase + "]]");
        }

        // Check if the flexSDKBase is valid, if not, warn user and abort!
        if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
            console.log("flexSDKBase accessable? ",nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK));
            nova.workspace.showErrorMessage("Configure AIR SDK!\n\nIn order to use this extension you will need to have installed a FlexSDK. Please set the location of \"Default AIR SDK\" in the extension preferences!")
        } else {
            // Create the client
            var args = new Array;

            // For Apple...
            args.push("-Dapple.awt.UIElement=true");

            // If different JVMArgs...
            if(getWorkspaceOrGlobalConfig("as3mxml.languageServer.jvmargs")!=null) {
			    var jvmArgs = getWorkspaceOrGlobalConfig("as3mxml.languageServer.jvmargs").split(" ");
			    jvmArgs.forEach((jvmArg) => {
				    args.push(jvmArg);
			    });
            }

            // if JDK 11 or newer is ever required, it's probably a good idea to
            // add the following option:
            //args.push("-Xlog:all=warning:stderr");

            /**
             Commands to start server from: https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text
            */
            args.push("-Dfile.encoding=UTF8");
            args.push("-Droyalelib=" + flexSDKBase + "/frameworks"); /** @NOTE Don't forget the "Frameworks" after the SDK Base! */
            args.push("-cp");
            args.push("" + base + "/bin/*:" + base + "/bundled-compiler/*");
            args.push("com.as3mxml.vscode.Main");

		    // Print out all the args so I know what's getting passed!
            if(nova.inDevMode()) {
                var argsOut = "";
                args.forEach(a => argsOut += a + "\n")
                console.log(" *** ARGS:: \\/\\/\\/\n\n" + argsOut + "\n *** ARGS:: /\\/\\/\\");
            }

            // Launch the server
            // First, use the default Mac Java path, or if there is a config setting for it:
            var javaPath = "/usr/bin/java";
            if(getWorkspaceOrGlobalConfig("as3mxml.java.path")!=null) {
                javaPath = getWorkspaceOrGlobalConfig("as3mxml.java.path");
            }

            // Prepare server options (Executable in VSCode talk...)
            var serverOptions = {
                path: javaPath,
                args: args,
                type: "stdio",
                cwd: nova.workspace.path
            };

			console.log("Server Options: ");
			consoleLogObject(serverOptions);
    /*
            // From https://devforum.nova.app/t/lsp-doesnt-work-unless-re-activate-it/1798
            if (nova.inDevMode()) {
                serverOptions = {
                    path: '/bin/bash',
                    args: [
                      '-c',
                      `tee "${nova.extension.path}/logs/nova-client.log" | ${path} | tee "${nova.extension.path}/logs/lang-server.log"`,
                    ],
                };
            }
    */
            // Client options
            var clientOptions = {
                syntaxes: ["actionscript","mxml","as3"],
                debug: true,

                documentSelector: [
                  { scheme: "file", language: "actionscript" },
                  { scheme: "file", language: "mxml" },
                  { scheme: "file", language: "as3" },
                  { scheme: "file", language: "as" },
                ],
                synchronize: {
                  configurationSection: "as3mxml",
                },
    /*
                uriConverters: {
                    code2Protocol: (value: vscode.Uri) => {
                      return normalizeUri(value);
                    },
                    //this is just the default behavior, but we need to define both
                    protocol2Code: (value) => vscode.Uri.parse(value),
                },
    */
            };

            if (nova.inDevMode()) {
                console.log("serverOptions: " + JSON.stringify(serverOptions));
                console.log("clientOptions: " + JSON.stringify(clientOptions));
            }

            var client = new LanguageClient('actionscript', 'ActionScript & MXML Language Server', serverOptions, clientOptions);
            try {
                // Start the client
                if (nova.inDevMode()) {
                    console.log(" *** Starting AS3MXML server at " + new Date().toLocaleString() + "--------------------");
                }

                client.start();

                client.onDidStop((error) => { console.log("**** AS3MXML ERROR: " + error + ". It may be still running: ", client.running); });
    /*
                nova.assistants.registerCompletionAssistant("as3", new CompletionProvider(), {
                    triggerChars: new Charset(".")
                });
    */
                client.onRequest("as3mxml/logCompilerShellOutput", (params) => {
                  console.log(" *** AS3MXL *** ",params);
                });

			    nova.config.onDidChange("as3mxml.languageServer.jvmargs", (editor) => {
                    if (nova.inDevMode()) {
				        console.log("Configuration changed... Restart LSP with new JVMArgs");
                    }
				    showNotification("Config Change", "JVM Args changed. Restarting Server!");
				    nova.commands.invoke("as3mxml.restart");
			    });

			    nova.config.onDidChange("as3mxml.sdk.framework", (editor) => {
                    if (nova.inDevMode()) {
				        console.log("Configuration changed... Different SDK for project");
                    }
				    showNotification("Config Change", "SDK Changed. Restarting Server!");
				    nova.commands.invoke("as3mxml.restart");
			    });

                nova.subscriptions.add(client);
                this.languageClient = client;

                    /*
                client.onNotification("as3mxml/logCompilerShellOutput", (params) => {
                    var issue = new Issue();
                    issue.message = params;
                    issue.severity = IssueSeverity.Error;
                    // @TODO Push issue to something...
					console.log("as3mxml/logCompilerShellOutput: " );
                    console.log(params);
                });
                    */
            }
            catch (err) {
                if (nova.inDevMode()) {
                    console.error(" *** CAUGHT AN ERROR!!!" + err + " .... " + JSON.stringify(err) + " ***");
                }
            }
        }
    }

    stop() {
        if (nova.inDevMode()) {
            console.log("AS3MXML stop() called!");
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log(" *** Attempting to stop this.languageClient! ");
            }
            this.languageClient.stop();
            if (nova.inDevMode()) {
                console.log(" *** Attempting to remove subscriptions of this.languageClient! ");
            }
            nova.subscriptions.remove(this.languageClient);
            if (nova.inDevMode()) {
                console.log(" *** Attempting to NULL this.languageClient! ");
            }
            this.languageClient = null;
        } else {
            if (nova.inDevMode()) {
                console.log(" *** this.languageClient is nothing...");
            }
        }
    }
}

nova.commands.register("as3mxml.restart", (editor) => {
    langserver.stop();
    langserver = new AS3MXMLLanguageServer();
});


nova.commands.register("as3mxml.hovertest", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.hovertest"); }

	if(langserver) {
        var position = rangeToLspRange(nova.workspace.activeTextEditor.document, nova.workspace.activeTextEditor.selectedRange);

        if (nova.inDevMode()) {
            console.log("Selectd Range:");
            console.log(nova.workspace.activeTextEditor.selectedRange);
            consoleLogObject( nova.workspace.activeTextEditor.selectedRange);
            console.log("POSITION:");
            consoleLogObject(position);
        }

        langserver.languageClient.sendRequest("textDocument/hover", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
            position: position.start
        }).then((result) => {
            if(result!==true) {
                showNotification("Hover Test", result.contents.value);
            }
        }, (error) => {
            showNotification("Hover Test ERROR!", error);
			consoleLogObject(error);
        });
    }
});

nova.commands.register("as3mxml.documentsymbols", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.documentsymbols"); }

	if(langserver) {
        langserver.languageClient.sendRequest("textDocument/documentSymbol", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
        }).then((result) => {
            if(result!==true) {
                showNotification("Document Symbols", result.contents.value);
            }
        }, (error) => {
            showNotification("Document Symbols ERROR!", error);
			consoleLogObject(error);
        });
    }
});

nova.commands.register("as3mxml.codeaction", (editor) => {
    if (nova.inDevMode()) { console.log("Called... as3mxml.codeaction"); }

	if(langserver) {
        var position = rangeToLspRange(nova.workspace.activeTextEditor.document, nova.workspace.activeTextEditor.selectedRange);
        console.log("Selectd Range:");
        console.log(nova.workspace.activeTextEditor.selectedRange);
        consoleLogObject( nova.workspace.activeTextEditor.selectedRange);
        console.log("POSITION:");
        consoleLogObject(position);

        langserver.languageClient.sendRequest("textDocument/codeAction", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
            position: position.start
        }).then((result) => {
            if(result!==true) {
                showNotification("Hover Test", result.contents.value);
            }
        }, (error) => {
            showNotification("Hover Test ERROR!", error);
			consoleLogObject(error);
        });
    }
});

/*
nova.commands.register("as3mxml.addImport", (editor) => {
    console.log("Called... as3mxml.addImport");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.addImport",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.removeUnusedImportsInUri", (editor) => {
    console.log("Called... as3mxml.removeUnusedImportsInUri");
    //var filePath = editor.document.path;
    var filePath = nova.workspace.path + "/asconfig.json"
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.removeUnusedImportsInUri",
            arguments: [ "file://" + filePath.replace(" ","%20")]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.addMXMLNamespace", (editor) => {
    console.log("Called... as3mxml.addMXMLNamespace");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.addMXMLNamespace",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.organizeImportsInUri", (editor) => {
    console.log("Called... as3mxml.organizeImportsInUri");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.organizeImportsInUri",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.organizeImportsInDirectory", (editor) => {
    console.log("Called... as3mxml.organizeImportsInDirectory");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.organizeImportsInDirectory",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log(result);
        }, (error) => {
            // handle it
            console.error(error);
        });
    }
});

nova.commands.register("as3mxml.getActiveProjectURIs", (editor) => {
    var results = {};

    console.log("Called... as3mxml.getActiveProjectURIs");
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.getActiveProjectURIs",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log( " GAPU Result: ",result);
            return result;
        }, (error) => {
            // handle it
            console.error(" GAPU Error: ",error);
        });
    }

    return results;
});

function getActiveProjectURIs() {
    if(langserver) {
        langserver.languageClient.sendRequest("workspace/executeCommand", {
            command: "as3mxml.getActiveProjectURIs",
            arguments: ["",""]
        }).then((result) => {
            // handle it
            console.log( " getActiveProjectURIs() Result: ",result);
            return result;
        }, (error) => {
            // handle it
           // console.error(" GAPU Error: ",error);
        });
    }

    return {};
}
*/