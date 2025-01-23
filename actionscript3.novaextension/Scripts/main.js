const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { ActionScript3TaskAssistant, getAndroids } = require("./task-assistant.js");
const { getAIRSDKInfo } = require("./as3-utils.js");
const { showNotification, consoleLogObject, getStringOfFile, getProcessResults, getCurrentDateAsSortableString, ensureFolderIsAvailable, getStringOfWorkspaceFile, quickChoicePalette } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, determineFlexSDKBase } = require("./config-utils.js");
const { updateASConfigFile, loadASConfigFile } = require("/asconfig-utils.js");
const { getAndroidDevices, getIOSDevices } = require("/device-utils.js");
const { clearExportPassword, storeExportPassword, createCertificate } = require("/certificate-utils.js");

var langserver = null;
var taskprovider = null;

// ------------------------------------------------------------------------
// ---- Extension context variables ----
// ------------------------------------------------------------------------

/**
 * Extension context to keep track if the as3mxml is ready to do code intelligence.
 * @type {boolean}
 */
var as3mxmlCodeIntelligenceReady = false;

/**
 * Extension context that keeps track if we have a `.project` file and `.actionScriptProperties`
 * file. If so, `Import Flash Builder` menu option can be enabled or disabled.
 * @type {boolean}
 */
var hasProjectAndASProperties = false;

//
/**
 * Extension context that keeps track of the version of the AIRSDK
 * @type {number}
 */
var currentAIRSDKVersion = 0;

// @TODO Use later to validate SWF version for Flash builds and for ANEs
var currentAIRAppVersions = [];
var currentAIRExtensionNamespaces = [];

/**
 * Extension context to keep track of needing to generate the `asconfig.json`
 * @type {boolean}
 */
var currentASConfigAutomatic = false;

/**
 * Extension context which is the JSON for the `asconfig.json`. Has to be stored as stringified text!
 * @type {string}
 */
var currentASConfigText = "";

// Used to store session passwords
/**
 * Extension context that stores certificate passwords for building, but are asked to only keep
 * for the current session. Once the Workspace is closed, it will be forgotten. Has to be stored
 * as stringified text!
 * @type {string}
 */
var sessionCertificatePassword = "";

/**
 * When the Extension is activated
 */
exports.activate = function() {
	// ---- Certificate Menu Functions ----
	nova.commands.register("as3.packaging.certificateCreate", (workspace) => { return createCertificate(); });

	nova.commands.register("as3.clearExportPassword", (workspace) => { return clearExportPassword(); });

	nova.commands.register("as3.storeExportPassword", (workspace) => { return storeExportPassword(); });

	// ---- Various Menu Functions ----
	nova.commands.register("as3.tester", (workspace) => {
		// Placeholder for testing things out without going through an entire process
	});

	nova.commands.register("as3.devicetester", (workspace) => {
		return new Promise((resolve) => {
			var ad = getAndroidDevices().then((androidDevices) => {
				consoleLogObject(androidDevices);

				var dd = getIOSDevices().then((iosDevices) => {
					consoleLogObject(iosDevices);
				});
			})
		});
	});

	nova.commands.register("as3.update.asconfig", (workspace) => {
		return new Promise((resolve) => {
			updateASConfigFile();
		});
	})

	taskprovider = new ActionScript3TaskAssistant();

	// Handles Tasks for us so we can build/clean/run
	nova.assistants.registerTaskAssistant(taskprovider, { identifier: "actionscript" });

	langserver = new AS3MXMLLanguageServer();

	//                                          [ Nova stuff...                     ][ Our params to pass]
	nova.commands.register("as3.clean",(workspace, workspacePath, sourcePath, outputPath) => {
		//                [ Nova stuff ..           ][ Our params]
		taskprovider.clean(workspacePath, sourcePath, outputPath);
	});

	nova.commands.register("as3.importFlashBuilderSettings",() => {
		if(hasProjectAndASProperties) {
			let imported = nova.workspace.config.get("as3.project.importedFB");
			if(imported=="done") {
				nova.workspace.showActionPanel("It looks like Flash Builder project settings were already imported. Click yes if you want to overwrite the existing import.", { buttons: [ "Yes","Cancel"] },
					(result) => {
						switch(result) {
							case 0: {
								taskprovider.importFlashBuilderSettings();
								break;
							}
						}
					}
				);
			} else {
				taskprovider.importFlashBuilderSettings();
			}
		}
	});

	nova.commands.register("as3.exportRelease",() => {
		taskprovider.packageBuild();
	});

	nova.commands.register("as3.paneltest", (editor) => {
		if (nova.inDevMode()) { console.log("Called... as3.paneltest"); }

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

	nova.commands.register("as3.as3reference",() => { nova.openURL("https://airsdk.dev/reference"); });

	nova.commands.register("as3.as3reference.old",() => { nova.openURL("https://help.adobe.com/en_US/air/build/index.html"); });

	nova.commands.register("as3.restart", (editor) => {
		langserver.stop();

		// Extension context varaible reset
		as3mxmlCodeIntelligenceReady = false;
		nova.workspace.context.set("as3mxmlCodeIntelligenceReady", as3mxmlCodeIntelligenceReady);
		hasProjectAndASProperties = false;
		nova.workspace.context.set("hasProjectAndASProperties", hasProjectAndASProperties);

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

/**
 * When the Extension is deactivate
 */
exports.deactivate = function() {
	// Clean up state before the extension is deactivated
	if (nova.inDevMode()) { console.log("<<<< AS3MXML Deactivated"); }

	if (langserver) {
		langserver.deactivate();
		langserver = null;
	}
	taskprovider = null;
}

/**
 * The Language Server!
 */
class AS3MXMLLanguageServer {
	languageClient = null;

	constructor() {
		const path = nova.extension.path;
		if (nova.inDevMode()) {
			console.log("--- AS3MXML Constructor -----------------------------------------------------");
			console.log(" *** Constructing AS3MXML Extension with PATH: ",path);
			console.log(" *** Version: " + nova.extension.version);
		}
		this.start(nova.extension.path)
	}

	/**
	 * What to do when activating the extension
	 */
	activate() { }

	/**
	 * What to do when deactivating the extension
	 */
	deactivate() {
		if (nova.inDevMode()) {
			console.log(" *** AS3MXML Deactivated");
		}
		this.stop();
	}

	/**
	 * Used to configure which configs should trigger events, like restarting the LSP or generating an
	 * `asconfig.json` file.
	 */
	setupConfigurationWatchers() {
		// Extension configs we need to watch
		const watchedConfigs = [
			"as3.java.path", "as3.sdk.searchPaths", "as3.sdk.default", "as3.sdk.animate", "as3.sdk.editor", "as3.languageServer.path",
			"as3.languageServer.jvmargs", "as3.languageServer.concurrentRequests",
		];

		// Workspace configs we need to watch
		const watchedWorkspaceConfigs = [
			"as3.application.mainApp", "as3.build.source.main", "as3.build.output", "as3.build.source.additional",
			"as3.build.library.additional", "as3.build.anes", "as3.packaging.anes", "as3.export.folder",
			"as3.project.asconfigMode",
			"as3.flash.generatorType", "as3.flash.generateHTML", "as3.flash.checkTarget", "as3.flash.express", "as3.flash.navigation"
		];

		/** @TODO Figure a way to check the current selected Task what's there */
		/*
		// Task configs we need to watch
		const watchedTaskConfigs = [
			"as3.export.folder",
		];
		*/

		// Keys that should trigger the LSP to restart
		const configsThatTriggersRestart = [
			"as3.java.path", "as3.sdk.searchPaths", "as3.sdk.default", "as3.sdk.animate", "as3.sdk.editor", "as3.languageServer.path",
			"as3.languageServer.path", "as3.languageServer.jvmargs", "as3.languageServer.concurrentRequests"
		];

		// Keys that should trigger a rebuild of the `.asconfig` file
		const configsThatTriggersASConfig = [
			"as3.application.mainApp", "as3.build.source.main", "as3.build.output", "as3.build.source.additional",
			"as3.build.library.additional", "as3.build.anes", "as3.project.asconfigMode"
			// Probably some task things but we don't know how to get them...
		];

		// Keys that should trigger HTML Wrapper to change
		const configsThatTriggersWrapper = [
			"as3.flash.generatorType", "as3.flash.generateHTML", "as3.flash.checkTarget", "as3.flash.express", "as3.flash.navigation"
		];

		/* @NOTE Not sure, but unless we do this "isThrottled" check, we end up getting like 7 calls to this function
		 * which if we need to restart the LSP, would lock up Nova.
		 */
		for (const key of watchedConfigs) {
			let isThrottled = false;
			nova.config.onDidChange(key, function(newValue, oldValue) {
				if(!isThrottled) {
					console.log(` =-=-=-=-= Changed ${key} is now ${newValue} was ${oldValue}`);

					if(configsThatTriggersRestart.includes(key)) {
						console.log(" =-=-=-=-= Should trigger restart");
					}

					var needAutoASConfig = nova.workspace.config.get("as3.project.asconfigMode");
					if(needAutoASConfig=="automatic") {
						if(configsThatTriggersASConfig.includes(key)) {
							updateASConfigFile();
						}
					}

					isThrottled = true;
					setTimeout(() => (isThrottled = false), 100); // Throttle period
				}
			});
		}

		/* @NOTE Not sure, but unless we do this "isThrottled" check, we end up getting like 7 calls to this function
		 * which if we need to restart the LSP, would lock up Nova.
		 */
		for (const key of watchedWorkspaceConfigs) {
			let isThrottled = false;
			nova.workspace.config.onDidChange(key, function(newValue, oldValue) {
				if(!isThrottled) {

					console.log(` =-=-=-=-= WORKSPACE Changed ${key} is now ${newValue} was ${oldValue}`);

					if(configsThatTriggersRestart.includes(key)) {
						console.log(" =-=-=-=-= WORKSPACE Should trigger restart");
					}

					let errorGeneratingHTML = "";

					// If Flash project wrapper settings change
					if(configsThatTriggersWrapper.includes(key)) {
						var generatorType = nova.workspace.config.get("as3.flash.generatorType");
						var generateHTML = nova.workspace.config.get("as3.flash.generateHTML");
						var checkTarget = nova.workspace.config.get("as3.flash.checkTarget");
						var useExpress = nova.workspace.config.get("as3.flash.express");
						var useNavigation = nova.workspace.config.get("as3.flash.navigation");

						let flexSDKBase = determineFlexSDKBase();
						let destPath = nova.workspace.path + "/html-template";
						let sourcePath = flexSDKBase + "/templates/swfobject";

						/** @TODO show a warning that you'll delete the folder! FB 4.6 says:
							"Warning: Because you have changed the options for the HTML wrapper or the SDK version, all files in the "htmi-template" folder of your project will be overwritten and/or deleted."
						*/
						/** @NOTE It does not seem that Nova supports showing UI when editing the Preferences! */
						try {
							// console.log("Trying to check if it exists, let's delete")
							// If the file exists, then remove it since nova.fs.copy with throw an error.
							if (nova.fs.access(destPath, nova.fs.constants.F_OK)) {
								// console.log(" Removing existing [" + destPath + "]");
								nova.fs.rmdir(destPath);
							}
						} catch (error) {
							errorGeneratingHTML += "Error removing html-template foldercopying classic template. " + error + "\n";
						}

						// Only if we can remove the html-template should we continue to copy stuff
						if(errorGeneratingHTML=="") {
							if(generateHTML) {
								// console.log("Generates... let's do stuff [[" + generatorType + "]]")
								if(generatorType=="Classic") {
									// Copy template
									try {
										nova.fs.copy(sourcePath, destPath);
									} catch (error) {
										errorGeneratingHTML += "Error copying classic template. " + error + "\n";
									}

									// If we copied the SDK's folder, then should we check for the express and history needs
									if(errorGeneratingHTML=="") {
										if(useExpress==false || checkTarget==false) {
											// Remove code from index.template.html
											try{
												nova.fs.remove(nova.workspace.path + "/html-template/expressInstall.swf");
												nova.fs.remove(nova.workspace.path + "/html-template/playerProductInstall.swf");
											} catch(error) {
												errorGeneratingHTML += "Error removing install SWFS. " + error + "\n";
											}
										}

										if(useNavigation==false) {
											// Remove History folder
											try{
												nova.fs.rmdir(nova.workspace.path + "/html-template/history");
											} catch(error) {
												errorGeneratingHTML += "Error removing history code folder. " + error + "\n";
											}
										}
									}
								} else {
									try{
										nova.fs.copy(nova.path.join(nova.extension.path, "/Template/Ruffle/"),destPath);
									} catch(error) {
										errorGeneratingHTML += "Error copying Ruffle template. " + error + "\n";
									}
								}
							}
						}

						if(errorGeneratingHTML) {
							showNotification("Error Generating HTML Template", errorGeneratingHTML, "", "-template");
							if (nova.inDevMode()) {
								console.log(errorGeneratingHTML);
							}
						} else {
							nova.notifications.cancel("as3mxml-nova-message-template");
						}
					}

					var needAutoASConfig = nova.workspace.config.get("as3.project.asconfigMode");
					if(needAutoASConfig=="automatic") {
						if(configsThatTriggersASConfig.includes(key)) {
							updateASConfigFile();
						}
					}

					isThrottled = true;
					setTimeout(() => (isThrottled = false), 100); // Throttle period
				}
			});
		}
	}

	/**
	 * WHen the LSP should start
	 * @param {string} path - The location of the extension
	 */
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

		// Configuration Change Handlers
		this.setupConfigurationWatchers();

		// Start 'er up!
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
			// Keep track of what AIRSDK we're using
			let airSDKInfo = getAIRSDKInfo(flexSDKBase);
			currentAIRSDKVersion = airSDKInfo.version;
			nova.workspace.context.set("currentAIRSDKVersion",currentAIRSDKVersion);
			currentAIRAppVersions = airSDKInfo.appVersions;
			nova.workspace.context.set("currentAIRAppVersions",JSON.stringify(currentAIRAppVersions));
			currentAIRExtensionNamespaces = airSDKInfo.extensionNamespaces;
			nova.workspace.context.set("currentAIRExtensionNamespaces",JSON.stringify(currentAIRExtensionNamespaces));

			// Create the client
			var args = new Array;

			// For Apple...
			args.push("-Dapple.awt.UIElement=true");

			// If different JVMArgs...
			if(getWorkspaceOrGlobalConfig("as3.languageServer.jvmargs")!=null) {
				var jvmArgs = getWorkspaceOrGlobalConfig("as3.languageServer.jvmargs").split(" ");
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

			// Commands to start server from: https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text
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
			if(getWorkspaceOrGlobalConfig("as3.java.path")!=null) {
				javaPath = getWorkspaceOrGlobalConfig("as3.java.path");
			}

			// Prepare server options (Executable in VSCode talk...)
			var serverOptions = {
				path: javaPath,
				args: args,
				type: "stdio",
				cwd: nova.workspace.path
			};

			// Client options to pass to the LSP
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
				}
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

				// Get the search paths for as3mxml
				var sdkSearchPath = [];
				if(getWorkspaceOrGlobalConfig("as3.sdk.searchPaths")!=null) {
					sdkSearchPath = getWorkspaceOrGlobalConfig("as3.sdk.searchPaths");
				}

				// get the editor sdk path for as3mxml if set
				var editorSdk = null;
				if(getWorkspaceOrGlobalConfig("as3.sdk.editor")!=null) {
					editorSdk = getWorkspaceOrGlobalConfig("as3.sdk.editor");
				}

				// get the animate sdk path for as3mxml if set
				var animateSdk = null;
				if(getWorkspaceOrGlobalConfig("as3.sdk.animate")!=null) {
					animateSdk = getWorkspaceOrGlobalConfig("as3.sdk.animate");
					if(animateSdk.trim()=="") {
						animateSdk = null;
					}
				}

				var langServerJVArgs = null;
				if(getWorkspaceOrGlobalConfig("as3.languageServer.jvmargs")!=null) {
					langServerJVArgs = getWorkspaceOrGlobalConfig("as3.languageServer.jvmargs");
				}

				var concurrentRequest = getWorkspaceOrGlobalConfig("as3.languageServer.concurrentRequests");

				// Send Change workspace config slightly after startup
				// Ideally, it should be onNotification("initialized")...
				setTimeout(function() {
					// @NOTE Most of it is just copied from VSCode, some setting are probably not needed!
					const config = {
						settings: {
							as3mxml: {
								sdk: {
									framework: flexSDKBase,
									searchPaths: sdkSearchPath,
									editor: editorSdk,
									animate: animateSdk
								},
								problems: {
									realTime: true,
									showFileOutsideSourcePath: true
								},
								projectImport: { prompt: false },
								asconfigc: {
									useBundled: true,
									verboseOutput: true,
									jvmargs: null
								},
								quickCompile: { enabled: false },
								languageServer: {
									jvmargs: langServerJVArgs,
									concurrentRequests: concurrentRequest
								},
								java: { path: javaPath.slice(0, -5) },
								codeGeneration: {
									getterSetter: {
										forcePublicFunctions: false,
										forcePrivateVariable: true
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
								lint: { enabled: false }
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
				/* // @NOTE Not sure if we can do this with Nova
 				client.onNotification("as3mxml/logCompilerShellOutput", (param) => {
					console.log(" !!!Got as3mxml/logCompilerShellOutput notificatiON!!");
				});

				client.onNotification("as3mxml/clearCompilerShellOutput", () => {
					console.log(" !!!Got as3mxml/clearCompilerShellOutput notificatiON!!");
				});
				*/

				client.onNotification("as3mxml/setActionScriptActive", () => {
					as3mxmlCodeIntelligenceReady = true;
					nova.workspace.context.set("as3mxmlCodeIntelligenceReady", as3mxmlCodeIntelligenceReady);
				});


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
						hasProjectAndASProperties = true;
						nova.workspace.context.set("hasProjectAndASProperties", hasProjectAndASProperties);
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

				// Check if there's an asconfig, ask if they want to update the file automatically or if they will handle it
				/* // DEBUG to force prompting about asconfig!
				nova.config.set("as3.project.asconfigMode",null);
				nova.workspace.config.set("as3.project.asconfigMode",null);
				*/
				var needAutoASConfig = nova.workspace.config.get("as3.project.asconfigMode");
				if(needAutoASConfig==null) {
					var asConfigMessage = "This extension can attempt to automatically make one for you based upon the extensions settings, or you can choose to maintain one of your own. Which way would you prefer?";
					var hasExistingASConfig = false;
					// But... if there is already an asconfig.json, change the prompt text
					if(nova.fs.stat(nova.workspace.path + "/asconfig.json")!=undefined) {
						hasExistingASConfig = true;
						asConfigMessage = "We noticed an existing \"asconfig.json\". However, this extension can attempt to automatically make one for you based upon the extensions settings, or you can choose to maintain one of your own. If you choose automatic, we will rename your existing file. Which way would you prefer?";
					}

					nova.workspace.showActionPanel(asConfigMessage, { buttons: [ "Automatic","I'll Maintain it","Cancel"] },
						(something, other) => {
							console.log("Something : "+ something + "   Ohter: " + other)
							switch(something) {
								case 0: {
									if(hasExistingASConfig) {
										// Back it up...
										nova.fs.copy(nova.workspace.path + "/asconfig.json",nova.workspace.path + "/asconfig-" + getCurrentDateAsSortableString() + ".json");
										this.loadASConfigFile();
									} else {
										nova.workspace.context.set("currentASConfigText",JSON.stringify({}));
									}
									updateASConfigFile();
									// Fire it off!!!
									nova.workspace.config.set("as3.project.asconfigMode","automatic");
									break;
								}
								case 1: {
									// Just mark it as manual
									nova.workspace.config.set("as3.project.asconfigMode","manual");
									break;
								}
							}
						}
					);
				} else {
					nova.workspace.context.set("currentASConfigAutomatic", (needAutoASConfig=="automatic" ? true : false));
					// If in asconfig automatic mode, load the asconfig file to keep track of.
					if(needAutoASConfig=="automatic") {
						loadASConfigFile();
					}
				}

			} catch (err) {
				if (nova.inDevMode()) {
					console.error(" *** CAUGHT AN ERROR!!!" + err + " .... " + JSON.stringify(err) + " ***");
				}
			}
		}
	}

	/**
	 * When the LSP is being stopped
	 */
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
