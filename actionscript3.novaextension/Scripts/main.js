const { ActionScript3TaskAssistant } = require("./task-assistant.js");
const { showNotification, consoleLogObject, rangeToLspRange } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, determineFlexSDKBase } = require("./config-utils.js");

var langserver = null;
var taskprovider = null;

var as3mxmlCodeIntelligenceReady = false;


exports.activate = function() {



nova.commands.register("as3.packaging.certificateCreate", (workspace) => {
	return new Promise((resolve) => {
		console.log("Called... as3.packaging.certificateCreate");
		showNotification("Create Certificate", "Still need to do...");
		nova.workspace.showErrorMessage("Create Certificate", "Still need to do...");
	});
});

nova.commands.register("actionscipt.clearExportPassword", (workspace) => {
	return new Promise((resolve) => {
		nova.workspace.showErrorMessage("Clear Password", "Still need to do...");
		showNotification("Clear Password", "Still need to do...");
	});
});



	taskprovider = new ActionScript3TaskAssistant();

	// Handles Tasks for us so we can build/clean/run
	nova.assistants.registerTaskAssistant(taskprovider, { identifier: "actionscript" });

	langserver = new AS3MXMLLanguageServer();

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

	nova.commands.register("as3mxml.restart", (editor) => {
		langserver.stop();
		as3mxmlCodeIntelligenceReady = false;
		nova.workspace.context.set("as3mxmlCodeIntelligenceReady", as3mxmlCodeIntelligenceReady);
		langserver = new AS3MXMLLanguageServer();
	});



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

				client.onNotification("initialized", (param) => {
					console.log(" !!!Got initialized notificatiON!!");
					showNotification("ActionScript 3", "LSP Initialized! What now...");
				});

				// Send Change workspace config slightly after startup
				// Ideally, it should be onNotification("initialized")...
				setTimeout(function() {
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
					// Set perferred target (need to change for Royale...)
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
				});

				client.onNotification("as3mxml/clearCompilerShellOutput", () => {
					console.log(" !!!Got as3mxml/clearCompilerShellOutput notificatiON!!");
				});

				client.onNotification("as3mxml/setActionScriptActive", () => {
					as3mxmlCodeIntelligenceReady = true;
					nova.workspace.context.set("as3mxmlCodeIntelligenceReady", as3mxmlCodeIntelligenceReady);
				});

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


				// @TODO, need to watch a bunch of settings to auto-generate an .asconfig file. :-(

				// @TODO Can I check with initialized?
				setTimeout(function() {
					if(as3mxmlCodeIntelligenceReady==false) {
						showNotification("ActionScript 3 not ready", "ActionScript & MXML code intelligence disabled. Either no sdk found or you need to create a file named 'asconfig.json' to enable all features.")
					}
				}, 2500);

				nova.subscriptions.add(client);
				this.languageClient = client;

				// Check if we should ask to import Flash Builder project.
				if(nova.config.get("as3.project.importFB")) {
					if(nova.fs.stat(nova.workspace.path + "/.project")!=undefined || nova.fs.stat(nova.workspace.path + "/.actionScriptProperties")!=undefined) {
						let imported = nova.workspace.config.get("as3.project.importedFB");
						if(imported!="done") {
							nova.workspace.showActionPanel("We detected this may be a Flash Builder project. Would you like to import it to Nova? The original Flash Builder files will not be altered.", { buttons: [ "Yes","Never","Cancel"] },
								(something) => {
									switch(something) {
										case 0: {
											taskprovider.importFlashBuilderSettings();
											break;
										}
										case 1: {
											// Just mark it done
											nova.workspace.config.set("as3.project.importedFB","done");
										}
									}
								}
							);
						}
					}
				}
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
