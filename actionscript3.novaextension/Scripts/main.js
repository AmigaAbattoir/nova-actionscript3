const { ActionScript3TaskAssistant } = require("./task-assistant.js");
const { showNotification, consoleLogObject, rangeToLspRange } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, determineFlexSDKBase } = require("./config-utils.js");

var langserver = null;
var taskprovider = null;

var as3mxmlCodeIntelligenceReady = false;

exports.activate = function() {
	langserver = new AS3MXMLLanguageServer();
	taskprovider = new ActionScript3TaskAssistant();


	// Handles Tasks for us so we can build/clean/run
	nova.assistants.registerTaskAssistant(taskprovider, {
		identifier: "actionscript",
	});

	//                                          [ Nova stuff...                     ][ Our params to pass]
	nova.commands.register("actionscript.clean",(workspace, workspacePath, sourcePath, outputPath) => {
		//                [ Nova stuff ..           ][ Our params]
		taskprovider.clean(workspacePath, sourcePath, outputPath);
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
			console.log(" 	PATH:: [[" + path + "]]");
			console.log(" 	BASE:: [[" + base + "]]");
			console.log(" 	FLEX:: [[" + flexSDKBase + "]]");
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

			// For remote debugging:
			//args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5006");

			// args.push("-Xdebug");
			// args.push("-Xrunjdwp:transport=dt_socket,address=8000,server=y,suspend=y");

			// if JDK 11 or newer is ever required, it's probably a good idea to
			// add the following option:
			//args.push("-Xlog:all=warning:stderr");

			/**
			 *Commands to start server from: https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text
			 */
			//args.push("-Dlog.level=DEBUG");
			args.push("-Dfile.encoding=UTF8");
			//args.push("-Droyalelib=" + flexSDKBase + "/frameworks"); /** @NOTE Don't forget the "Frameworks" after the SDK Base! */
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
				syntaxes: ["actionscript","mxml"],
				debug: true,

				documentSelector: [
					{ scheme: "file", language: "actionscript" },
					{ scheme: "file", language: "mxml" },
				],
				synchronize: {
					configurationSection: "as3mxml",
				},
				trace: "verbose",
/*
				// Not sure if this is needed?
				uriConverters: {
					code2Protocol: (value) => {
						//return normalizeUri(value);
						console.log(" Called code2Protocol!");
						return nova.path.normalize(value);
					},
					//this is just the default behavior, but we need to define both
					protocol2Code: (value) => {
						return value;
					}
				},
*/
				initializationOptions: {
					preferredRoyaleTarget: "SWF", // Should be SWF or JS for Royale, but for now let's just try this...
					notifyActiveProject: true,
				},
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
				// ------------------------------------------------------------------------
				// Add so that when new files open we send the textDocument/didOpen
				nova.workspace.onDidAddTextEditor((editor) => {
					if(editor.document.syntax=="ActionScript 3" || editor.document.syntax=="MXML" || editor.document.syntax=="xml" ) {
						let version = 0;

						// 1 - Send notification of textDocument/didOpen
						console.log(" >>> Firing off textDocument/didOpen for the file " + editor.document.uri);
						client.sendNotification("textDocument/didOpen", {
							textDocument:  {
								uri: editor.document.uri,
								languageId: "actionscript",
								version: version,
								text: editor.document.getTextInRange(new Range(0, editor.document.length))
							}
						});

						// 2 - Send request textDocument/codeAction
						client.sendRequest("textDocument/codeAction", {
							textDocument: {
								uri: editor.document.uri,
							},
							range: {
								start: {
									line: 0,
									character: 0
								},
								end: {
									line: 0,
									character: 0
								}
							},
							context: {
								diagnostics: [],
								triggerKind: 2
							}
						}).then((result) => {
							// console.log(" <><><><> Sent textDocument/codeAction");
						});

						// 3 - Send request textDocument/documentSymbol
						client.sendRequest("textDocument/documentSymbol", {
							textDocument: {
								uri: editor.document.uri,
							},
						}).then((result) => {
							console.log(" <><><><> Sent textDocument/documentSymbol...");
							console.log("RSULTS: " + JSON.stringify(results,null,4));
						});

						// ----------------------------------------------------------------------
						// On Change
						editor.onDidStopChanging(() => {
							version++;

/*
							console.log("CURPOS:");
							console.log(JSON.stringify(editor.selectedRange,null,4));

							const cursorPosition = editor.selectedRange.start;
							consoleLogObject(cursorPosition);
*/
							var rr = rangeToLspRange(editor.document, editor.selectedRange)
/*
							console.log("RR Values; ");
							consoleLogObject(rr);

							client.sendRequest("textDocument/hover", {
								textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
								position: rr.end
							}).then((result) => { console.log("Hovered"); });
*/
							client.sendNotification("textDocument/didChange", {
								textDocument: {
									uri: editor.document.uri,
									version: version
								},
								contentChanges: [
									{
										range: rangeToLspRange(editor.document, editor.selectedRange),
										rangeLength: 0,
										text: ""
									}
								]
							});

/*
							client.sendRequest("textDocument/completion", {
								textDocument: {
									uri: editor.document.uri,
								},
								position: {
									line: rr.end.line,
									character: rr.end.character+1
								},
								context: {
									triggerKind: 1,
								}
							}).then((result) => {
								console.log(" <><><><> Sent textDocument/compeletion...");
								client.sendRequest("textDocument/codeAction", {
									textDocument: {
										uri: editor.document.uri,
									},
									range: {
										start: {
											line: rr.end.line,
											character: rr.end.character+1
										},
										end: {
											line: rr.end.line,
											character: rr.end.character+1
										}
									},
									context: {
										diagnostics: [],
										triggerKind: 2,
									}
								}).then((result) => {
									console.log(" <><><><> Sent textDocument/codeAction...");
								})
*/
/*
							});
*/
							console.log(" <><><><> Sent textDocument/didStopChanging...");
						});

						// ----------------------------------------------------------------------
						// On Save
						editor.onDidSave((editor) => {
							console.log(" <><><><> SHoud do Sending notification 'textDocument/didSave'.");
							client.sendNotification("textDocument/didSave", {
								textDocument: {
									uri: editor.document.uri,
								}
							});
							console.log(" <><><><> SHoud do Sending notification 'workspace/didChangeWatchedFiles'.");

							client.sendNotification("workspace/didChangeWatchedFiles", {
								changes: [
									{
										uri: editor.document.uri,
										type: 2
									}
								]
							});
						});

						// ----------------------------------------------------------------------
						// On Close
						editor.onDidDestroy((editor) => {
							const textDocument = {
								uri: editor.document.uri,
							}
							client.sendNotification("textDocument/didClose", { textDocument: textDocument });
						});
					} else {
						console.log(" >>> NOT firing off textDocument/didOpen for the file " + editor.document.uri + " because it's a " + editor.document.syntax);
					}
				})
				// ------------------------------------------------------------------------

				// Should do this after initialized, but not sure
				setTimeout(function() {
					// 2. Send Change workspace config
					// @NOTE Should do programmatically, just copying from VSCode to see if it works!
					const config = {
						settings: {
							as3mxml: {
								sdk: {
									framework: "/Applications/Apache Flex/SDKs/4.16.1-AIR32",
									searchPaths: [
										"/Applications/Apache Flex/SDKs/4.16.1-AIR32/bin/",
										"/Applications/Apache Flex/SDKs/4.16.1-AIR32/bin",
										"/Applications/Apache Flex/SDKs"
									],
									editor: null,
									animate: null
								},
								problems: {
									realTime: true,
									showFileOutsideSourcePath: true
								},
								projectImport: {
									prompt: true
								},
								asconfigc: {
									useBundled: true,
									verboseOutput: true,
									jvmargs: null
								},
								quickCompile: {
									enabled: true
								},
								languageServer: {
									jvmargs: null,
									concurrentRequests: false
								},
								java: {
									path: "/usr/bin/"
								},
								codeGeneration: {
									getterSetter: {
										forcePublicFunctions: false,
										fforcePrivateVariable: true
									}
								},
								sources: {
									organizeImports: {
										addMissingImports: true,
										removeUnusedImports: true,
										insertNewLineBetweenTopLevelPackages: true
									}
								},
								format: {
									enabled: true,
									collapseEmptyBlocks: null,
									insertSpaceAfterCommaDelimiter: null,
									insertSpaceBetweenMetadataAttributes: null,
									insertSpaceAfterFunctionKeywordForAnonymousFunctions: null,
									insertSpaceAfterKeywordsInControlFlowStatements: null,
									insertSpaceAfterSemicolonInForStatements: null,
									insertSpaceBeforeAndAfterBinaryOperators: null,
									insertSpaceAtStartOfLineComment: null,
									mxmlInsertNewLineBetweenAttributes: null,
									mxmlAlignAttributes: true,
									maxPreserveNewLines: null,
									placeOpenBraceOnNewLine: null,
									semicolons: null
								},
								lint: {
									enabled: false
								}
							}
						}
					};
					console.log(" >>> Sending notifications of workspace/didChangeConfiguration!! ");
					client.sendNotification("workspace/didChangeConfiguration", config);

					console.log(" >>> Sending request of workspace/executeCommand!! ");
					// 3. Set perferred target?
					client.sendRequest("workspace/executeCommand", {
						command: "as3mxml.setRoyalePreferredTarget",
						arguments: [
							"SWF"
						]
					}).then((result) => {
						console.log(" <><><><> Sent workspace/executeCommand  as3mxml.setRoyalePreferredTarget..." + JSON.stringify(result));
					});
				}, 175);

				// ------------------------------------------------------------------------
				// Receive Notification Handlers
				// Notification Handlers
				client.onNotification("as3mxml/logCompilerShellOutput", (param) => {
					console.log(" !!!Got as3mxml/logCompilerShellOutput notificatiON!!");
				})

				client.onNotification("as3mxml/clearCompilerShellOutput", () => {
					console.log(" !!!Got as3mxml/clearCompilerShellOutput notificatiON!!");
				})

				client.onNotification("as3mxml/setActionScriptActive", () => {
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(")))))))))))) as3mxml/setActionScriptActive (((((((((((");
					console.log(" HEY HEY!! Got a notification on as3mxml/setActionScriptActive. No parameters provided.");

					as3mxmlCodeIntelligenceReady = true;
					const execComm = {
						command: "as3mxml.codeIntelligenceReady",
						arguments: [
							"SWF"
						]
					};
					client.sendRequest("workspace/executeCommand", execComm).then((result) => {
						console.log("Send workspace/executeCommand.. should codeIntelligenceReady...");
					});
				});

				client.onNotification("client/registerCapability", (params) => {
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
					console.log(" HEY HEY!! Got notification to client/registerCapability");
				});
				// ------------------------------------------------------------------------

				// ------------------------------------------------------------------------
				// Request Handlers
				client.onRequest("client/registerCapability", (params) => {
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					console.log(" HEY HEY!! Got requested to client/registerCapability");
					consoleLogObject(params);

					// Do we send right back?!
					client.sendRequest("client/registerCapability", {}).then((result) => {
						console.log("Now what?");
						console.log("Now what?");
						console.log("Now what?");
						console.log("Now what?");
						console.log("Now what?");
						console.log("Now what?");
					});
				});
				// ------------------------------------------------------------------------

				// ------------------------------------------------------------------------
				// Configuration Change Handlers
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
				// ------------------------------------------------------------------------

				nova.subscriptions.add(client);
				this.languageClient = client;
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
	as3mxmlCodeIntelligenceReady = false;
	langserver = new AS3MXMLLanguageServer();
});

nova.commands.register("as3mxml.codeIntelligenceReady", (editor) => {
	console.log("as3mxml.codeIntelligenceReady was received. Think it just sets the variable!");
	as3mxmlCodeIntelligenceReady = true;
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

nova.commands.register("as3mxml.didclose", (editor) => {
	if (nova.inDevMode()) { console.log("Called... as3mxml.didclose"); }

	if(langserver) {
		const fullRange = new Range(0, nova.workspace.activeTextEditor.document.length);
		const text = nova.workspace.activeTextEditor.document.getTextInRange(fullRange);

		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		const textDocument = {
			uri: nova.workspace.activeTextEditor.document.uri,
			// languageId: "actionscript",
			// version: 1,
			// text: nova.workspace.activeTextEditor.document.getTextInRange(fullRange)
		}
		const payload = {
			textDocument: textDocument
		}

		langserver.languageClient.sendRequest("textDocument/didClose", payload).then((result) => {
			console.log(" 222 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		});
	}
});

nova.commands.register("as3mxml.textchange", (editor) => {
	if (nova.inDevMode()) { console.log("Called... as3mxml.textchange"); }

	if(langserver) {
		const fullRange = new Range(0, nova.workspace.activeTextEditor.document.length);
		const text = nova.workspace.activeTextEditor.document.getTextInRange(fullRange);

		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		const textDocument = {
			uri: nova.workspace.activeTextEditor.document.uri,
			languageId: "actionscript",
			version: 1,
			text: nova.workspace.activeTextEditor.document.getTextInRange(fullRange)
		}
		const payload = {
			textDocument: textDocument
		}

		langserver.languageClient.sendNotification("textDocument/didChange", payload).then((result) => {
			console.log(" 222 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		});
	}
});

nova.commands.register("as3mxml.didopen", (editor) => {
	if (nova.inDevMode()) { console.log("Called... as3mxml.didopen"); }

	if(langserver) {
		const fullRange = new Range(0, nova.workspace.activeTextEditor.document.length);
		const textDocument = {
			uri: nova.workspace.activeTextEditor.document.uri,
			languageId: "actionscript",
			version: 1,
			text: nova.workspace.activeTextEditor.document.getTextInRange(fullRange)
		}
		langserver.languageClient.sendNotification("textDocument/didOpen", { textDocument: textDocument });
	}
});

nova.commands.register("as3mxml.fullhover", (editor) => {
	if (nova.inDevMode()) { console.log("Called... as3mxml.fullhover"); }

	if(langserver) {
		const fullRange = new Range(0, nova.workspace.activeTextEditor.document.length);
		const text = nova.workspace.activeTextEditor.document.getTextInRange(fullRange);

		console.log(" | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
		const textDocument = {
			uri: nova.workspace.activeTextEditor.document.uri,
			languageId: "ActionScript 3",
			version: 1,
			text: nova.workspace.activeTextEditor.document.getTextInRange(fullRange)
		}
		const payload = {
			textDocument: textDocument
		}

		langserver.languageClient.sendNotification("textDocument/didOpen", payload);

		setTimeout(function() {
			console.log(" 222 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
			console.log("Send didOpen.. should codeAction...");
			langserver.languageClient.sendRequest("textDocument/codeAction", {
				textDocument: {
					uri: nova.workspace.activeTextEditor.document.uri,
				},
				range: {
					start: {
						line: 0,
						character: 0
					},
					end: {
						line: 0,
						character: 0
					}
				},
				context: {
					diagnostics: [],
					triggerKind: 2
				}
			}).then((result) => {
				console.log(" 333 | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
				console.log("Send did codeAction.. should documentSymbol...");
				langserver.languageClient.sendRequest("textDocument/documentSymbol", {
					textDocument: {
						uri: nova.workspace.activeTextEditor.document.uri,
					}
				}).then((result) => {
					console.log("Send did documentSymbol.. now what?...");
				});
			});
		}, 1000);
	}
});

nova.commands.register("as3mxml.documentsymbols", (editor) => {
	if (nova.inDevMode()) { console.log("Called... as3mxml.documentsymbols"); }

	if(langserver) {
		langserver.languageClient.sendRequest("textDocument/documentSymbol", {
			textDocument: { uri: nova.workspace.activeTextEditor.document.uri },
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
			position: position.start,
			context: {
				diagnostics: [],
				triggerKind: 2
			}
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
