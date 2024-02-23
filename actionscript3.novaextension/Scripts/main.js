// For help parsing FlashBuilder settings files
var pjXML = require('pjxml');

var langserver = null;
var taskprovider = null;

function getTag(xml, tag) { return String(xml.select("//"+tag)).trim(); }

function getTagAttribute(xml, tag, attr) { return String(xml.select("//"+tag)["attributes"][attr]).trim(); }

function getAttribute(xml, attr) { return String(xml["attributes"][attr]).trim(); }

/**
 * Quick, easy way to show a notification. If you need it to persist, then add a button
 * to show. This does not resolve any buttons, just there to keep in place!
 * @param {string} title - The title of the notification
 * @param {string} body - The text to display in the notification
 * @param {string} closeButtonName - Optional button, if there, it will keep the box open until
 * clicked
 */
function showNotification(title, body, closeButtonName = "") {
    //if (nova.inDevMode()) {
        let request = new NotificationRequest("as3mxml-nova-message");

        request.title = nova.localize(title);
        request.body = nova.localize(body);
		if(closeButtonName) {
			request.actions = [ closeButtonName ];
		}
        nova.notifications.add(request);
    //}
}

/**
 * Runs a process so that we get get the Promise when it's done.
 * @param {string} command - The command to use
 * @param {Array} args - An array with the arguments for the command (optional)
 * @param {string} cwd - The working directory (defaults to current, extension's directory)
 * @retruns {Promise} - If the status is 0, then it `resolves` otherwise `rejects`. Both will
 * return back an object containing status, stdout and stderr.
 */
function getProcessResults(command, args = [], cwd = "") {
	var proc = new Promise((resolve, reject) => {
		var stdout = "";
		var stderr = "";

		var process = new Process(command, { args: args, cwd: cwd });
		process.onStdout(line => stdout += line);
		process.onStderr(line => stderr += line);
		process.onDidExit(status => {
			/*
			console.log("getProcessResults() status: " + status);
			console.log("                    stdout: " + stdout);
			console.log("                    stderr: " + stderr);
			console.log("                    command: " + command);
			console.log("                    args: ");
			consoleLogObject(args);
			*/
			let results = { status: status, stdout: stdout, stderr: stderr };
			/*
			console.log("getProcessResults() results: ");
			consoleLogObject(results);
			*/
			if(status===0) {
				console.log("getProcessResults() Going to resolve...");
				resolve(results);
			} else {
				console.log("getProcessResults() Going to reject...");
				reject(results);
			}
		});
		process.start();
	});

	return proc;
}

/**
 * Figures out a ProjectUUID for building releases and storing passwords.
 * @returns {Promise} The result of trying to call `uuidgen`. If it resolves, it passes
 * back a UUID as a string, otherwise it will return an object with `status`,`stdout`, and `stderr`
 */
function determineProjectUUID() {
	var projectUUID =  nova.workspace.config.get("as3.application.projectUUID");
	var getUUID = Promise.resolve(projectUUID);

	if(projectUUID==null || projectUUID=="" || projectUUID=="null") {
		var getUUID = getProcessResults("/usr/bin/uuidgen");
		getUUID.then((resolve) => {
			nova.workspace.config.set("as3.application.projectUUID",resolve.stdout.trim());
			projectUUID = nova.workspace.config.get("as3.application.projectUUID");
			resolve(projectUUID);
		}, (reject) => {
			reject(reject);
		});
	} else {
		return Promise.resolve(projectUUID);
	}
	return getUUID;
}

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

	nova.commands.register("actionscipt.checkFBProject",() => {
		taskprovider.importFlashBuilderSettings();
	});

	nova.commands.register("actionscipt.clearExportPassword",() => {
		var projectUUID =  nova.workspace.config.get("as3.application.projectUUID");
		try {
			nova.credentials.removePassword(projectUUID,"release-build");
			showNotification("Remove Password", "Successfully removed password from your keychain!")
		} catch(error) {
			showNotification("Remove Password Failed", "Either the Project's UUID is wrong, or there was no password")
		}
	});

	nova.commands.register("actionscipt.exportRelease",() => {
		taskprovider.packageBuild();
	});

	nova.commands.register("actionscript3.paneltest", (editor) => {
		if (nova.inDevMode()) { console.log("Called... as3mxml.hovertest"); }

		nova.workspace.showInputPanel('Enter new filename:',
			{ value: '', placeHolder: 'NewFileName' },
			async (newFileName) => {
				if (newFileName) {
					// Execute your task with the new filename
					await this.renameFile(newFileName);
				} else {
					nova.workspace.showErrorMessage('Invalid filename. Please enter a valid name.');
				}
			}
		);
	});

	nova.commands.register("actionscipt.as3reference",() => { nova.openURL("https://help.adobe.com/en_US/FlashPlatform/reference/actionscript/3/index.html"); });
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

/**
 * Tell if the current file is being used in a workspace setting or as a independent editor window
 *
 * @see https://github.com/jasonplatts/nova-todo/blob/main/Scripts/functions.js
 * @returns {boolean}  - representing whether or not the current environment is a workspace or
 * Nova window without a workspace.
 */
function isWorkspace() {
    if (nova.workspace.path == undefined || nova.workspace.path == null) {
        // Opening single file in a Nova editor does not define a workspace. A project must exist.
        // Opening a remote server environment is also not considered a workspace.
        return false
    } else {
        // A local project is the only environment considered a Nova workspace.
        return true
    }
}

/* ---- Config Functions ---- */
function getConfig(configName) {
    return nova.config.get(configName);
}

function getWorkspaceOrGlobalConfig(configName) {
    var config = nova.config.get(configName);
    //console.log("*** getWorkspaceOrGlobalConfig() Config " + configName + " is [" + config + "]");
    if(isWorkspace()) {
        workspaceConfig = nova.workspace.config.get(configName)
    //console.log("*** getWorkspaceOrGlobalConfig() Workspace Config " + configName + " is [" + workspaceConfig + "]");
        if(workspaceConfig) {
            config = workspaceConfig;
        }
    }
    //console.log("*** getWorkspaceOrGlobalConfig() RETURNING [" + config + "]");
    return config;
}

function setIfConfigIsSet(configName) {
    var check = getWorkspaceOrGlobalConfig(configName);
    if(check!=null) {
        return configName + ":" + check;
    }
    return null;
}

var fileExtensionsToExclude = [];
var fileNamesToExclude = [];

function shouldIgnoreFileName(fileName, ignorePatterns) {
	if(fileNamesToExclude.includes(fileName)) {
		return true;
	}
	if(fileExtensionsToExclude.some(ext => fileName.endsWith(ext))) {
		return true;
	}
	return false;
}

class ActionScript3TaskAssistant {
	/** @TODO Make this an extension preference, like in Flash Builder > File Exclusions */
	// These files should be ignored when copying assets. The "-app.xml" gets processed,
	// so we won't want to copy that either.
	ignoreCopy = [ ".java", ".class", ".properties", ".mxml", ".as", ".fxg",
		".classpath", "flex-config.xml", "air-config.xml", "services-config.xml", "remoting-config.xml", "proxy-config.xml", "massaging-config.xml", "data-management-config.xml",
		// Also, ignore these things.
		".git",".svn",".DS_Store", "-app.xml"
	];

	/**
	 * Clean the build directory. Basically, delete the dir then make it again.
	 * @param {string} outputPath - Where the build folder is located.
	 */
	clean(outputPath) {
		var result = true;
		if(outputPath) {
			try {
				nova.fs.rmdir(outputPath);
				nova.fs.mkdir(outputPath);
			} catch(error) {
				result = false;
			}
		}
		return result;
	}

	/**
	 * Handles packaging the project
	 */
	packageBuild() {
		// We need a project UUID to save the certificate password in a later step, but let's check
		// first. It should generate one if possible, but on the unlikely event, we should abort.
		var projectUUID = determineProjectUUID();
		projectUUID.then((resolve) => { // Now that we have the UUID, let's try to make a build
			var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
			var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

			// Use this to get setting from the extension or the workspace!
			var flexSDKBase = determineFlexSDKBase();

			var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));

			var isFlex = nova.workspace.config.get("as3.application.isFlex");
			var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));
			var packageName = (isFlex ? mainApplicationPath.replace(".mxml",".air") : mainApplicationPath.replace(".as",".air"));

			var copyAssets = nova.workspace.config.get("as3.compiler.copy");

			var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			var releasePath = "bin-release-temp";

			this.build(true, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, "release", nova.path.join(nova.workspace.path, releasePath), exportName, true).then((resolve) => {
				console.log("this.build() resolve:");
				consoleLogObject(resolve);
				// @TODO - If there is warnings, ask if you want to continue, or abort.

				// Loop through the output, and copy things unless specified to exclude like the .actionScriptProperties
				let alsoIgnore = getWorkspaceOrGlobalConfig("as3.packaging.excludedFiles");
				//console.log("alsoIgnore: ");
				//consoleLogObject(alsoIgnore);
				if(alsoIgnore) {
					alsoIgnore.forEach((ignore) => {
						//console.log("Ignroe: " + ignore);
						//console.log("[["+nova.workspace.path + "/" + releasePath + "/" + ignore +"]]");
						try{
							if(nova.fs.stat(nova.workspace.path + "/" + releasePath + "/" + ignore).isFile()) {
								//console.log("    REMOVE FILE + " + ignore + " !");
								nova.fs.remove(nova.workspace.path + "/" + releasePath + "/" + ignore);
							} else if(nova.fs.stat(nova.workspace.path + "/" + releasePath + "/" + ignore).isDirectory()) {
								//console.log("    REMOVE DIR + " + ignore + " !");
								nova.fs.rmdir(nova.workspace.path + "/" + releasePath + "/" + ignore);
							} else {
								//console.log("    Don't do anything " + ignore + " !");
							}
						} catch(error) {
							// @TODO, Flash Builder would remove this entry from the excluded items
							//console.log("    Not there skip " + error);
						}
						//console.log("DONE!");
					});
				}

				// Check for password, if no, show password.
				// @TODO We should do something like FB where when you enter the password, it tries to verify it. Once it's correct, you can continue.
				var passwordCheck = nova.credentials.getPassword(projectUUID,"release-build");
				if(passwordCheck==null) {
					passwordCheck = "";
				}

				// THis will be a promise, I promise!
				var passwordGet;

				// If password is empty, let's try to get it.
				if(passwordCheck=="") {
					var request = new NotificationRequest("Export Release Build...");
					request.title = "Digital Signature ";
					request.body = "Enter the password for the certificate " + nova.workspace.config.get("as3.packaging.password") ;
					request.textInputValue = passwordCheck;
					request.type = "input";
					request.actions = ["This time", "Save", "Cancel"];

					passwordGet = nova.notifications.add(request);
				} else {
					// We have a password, fufill the promise
					passwordGet = Promise.resolve( { identifier: "Export Release Build...", actionIdx: 0, textInputValue: passwordCheck });
				}

				passwordGet.then((reply) => {
					var password;
					switch(reply.actionIdx) {
						case 2: { // Cancel
							console.log("Cancel");
							// @TODO Ask to remove build?
							return;
							break;
						}
						case 1: { // Save the password
							password = reply.textInputValue;
							// @NOTE Should we also tie in the certificate name? Only useful if using different certificates I guess.
							nova.credentials.setPassword(projectUUID,"release-build",password);
							break;
						}
						case 0: { // This time
							password = reply.textInputValue;
							break;
						}
					}

					var command = flexSDKBase + "/bin/adt";
					var args = [];

					args.push("-package");

					args.push("-storetype");
					args.push("pkcs12");

					args.push("-keystore");
					args.push(nova.workspace.config.get("as3.packaging.certificate"));

					args.push("-storepass");
					args.push(password);

					var doTimestamp = nova.workspace.config.get("as3.packaging.timestamp");
					if(doTimestamp==false) {
						args.push("-tsa");
						args.push("none");
					}

					// AIR Package name
					args.push(packageName);

					// Descriptor
					args.push(releasePath + "/" + appXMLName);

					// Loop through each item in the releasePath, and if it's not the app.xml, copy it to the packing
					nova.fs.listdir(nova.workspace.path + "/" + releasePath).forEach(filename => {
						if(filename!=appXMLName) {
							args.push("-C");
							args.push(releasePath);
							args.push(filename);
						}
					});

					args.unshift(command);
					var process = new Process("/usr/bin/env", {
						args: args,
						cwd: nova.workspace.path
					});

					consoleLogObject(process);
					if (nova.inDevMode()) {
						console.log(" *** COMMAND [[" + command + "]] ARG: \n");
						consoleLogObject(args);
					}

					var stdout = "";
					var stderr = "";
					process.onStdout(function(line) {
						//console.log("STDOUT: " + line);
						stdout += line;
					});
					process.onStderr(function(line) {
						//console.log("STDERR: " + line);
						stderro += line;
					});
					process.start();
					process.onDidExit((status) => {
						consoleLogObject(status);
						var title = "Export Package";
						var message = "Okay?!!!";
						if(status==0) {
							showNotification("Export Package Successful!", "Congrats!");

							// @TODO, add button to reveal path
							//nova.fs.rmdir(nova.path.join(nova.workspace.path, "bin-release-temp"));
						} else {
							/** @NOTE See https://help.adobe.com/en_US/air/build/WSBE9908A0-8E3A-4329-8ABD-12F2A19AB5E9.html */
							switch(status) {
								/* Exit codes for other errors */
								case 2: {
									title =   "Usage error";
									message = "Check the command-line arguments for errors";
									break;
								}
								case 5: {
									title =   "Unknown error";
									message = "This error indicates a situation that cannot be explained by common error conditions. Possible root causes include incompatibility between ADT and the Java Runtime Environment, corrupt ADT or JRE installations, and programming errors within ADT.";
									break;
								}
								case 6: {
									title =   "Could not write to output directory";
									message = "Make sure that the specified (or implied) output directory is accessible and that the containing drive is has sufficient disk space.";
									break;
								}
								case 7: {
									title =   "Could not access certificate";
									message = "Make sure that the path to the keystore is specified correctly. Check that the certificate within the keystore can be accessed. The Java 1.6 Keytool utility can be used to help troubleshoot certificate access issues.";
									break;
								}
								case 8: {
									title =   "Invalid certificate";
									message = "The certificate file is malformed, modified, expired, or revoked.";
									break;
								}
								case 9: {
									title =   "Could not sign AIR file";
									message = "Verify the signing options passed to ADT.";
									break;
								}
								case 10: {
									title =   "Could not create time stamp";
									message = "ADT could not establish a connection to the timestamp server. If you connect to the internet through a proxy server, you may need to configure the JRE proxy settings.";
									break;
								}
								case 11: {
									title =   "Certificate creation error";
									message = "Verify the command-line arguments used for creating signatures.";
									break;
								}
								case 12: {
									title =   "Invalid input";
									message = "Verify file paths and other arguments passed to ADT on the command line.";
									break;
								}
								case 13: {
									title =   "Missing device SDK";
									message = "Verify the device SDK configuration. ADT cannot locate the device SDK required to execute the specified command.";
									break;
								}
								case 14: {
									title =   "Device error";
									message = "ADT cannot execute the command because of a device restriction or problem. For example, this exit code is emitted when attempting to uninstall an app that is not actually installed.";
									break;
								}
								case 15: {
									title =   "No devices";
									message = "Verify that a device is attached and turned on or that an emulator is running.";
									break;
								}
								case 16: {
									title =   "Missing GPL components";
									message = "The current AIR SDK does not include all the components required to perform the request operation.";
									break;
								}
								case 17: {
									title =   "Device packaging tool failed.";
									message = "The package could not be created because expected operating system components are missing.";
									break;
								}
								/* Application descriptor validation errors */
								case 100: {
									title =   "Application descriptor cannot be parsed";
									message = "Check the application descriptor file for XML syntax errors such as unclosed tags.";
									break;
								}
								case 101: {
									title =   "Namespace is missing";
									message = "Add the missing namespace.";
									break;
								}
								case 102: {
									title =   "Invalid namespace";
									message = "Check the namespace spelling.";
									break;
								}
								case 103: {
									title =   "Unexpected element or attribute";
									message = "Remove offending elements and attributes. Custom values are not allowed in the descriptor file.\nCheck the spelling of element and attribute names.\nMake sure that elements are placed within the correct parent element and that attributes are used with the correct elements.";
									break;
								}
								case 104: {
									title =   "Missing element or attribute";
									message = "Add the required element or attribute.";
									break;
								}
								case 105: {
									title =   "Element or attribute contains an invalid value";
									message = "Correct the offending value.";
									break;
								}
								case 106: {
									title =   "Illegal window attribute combination";
									message = "Some window settings, such as transparency = true and systemChrome = standard cannot be used together. Change one of the incompatible settings.";
									break;
								}
								case 107: {
									title =   "Window minimum size is larger than the window maximum size";
									message = "Change either the minimum or the maximum size setting.";
									break;
								}
								case 108: {
									title =   "Attribute already used in prior element";
									message = "";
									break;
								}
								case 109: {
									title =   "Duplicate element.";
									message = "Remove the duplicate element.";
									break;
								}
								case 110: {
									title =   "At least one element of the specified type is required.";
									message = "Add the missing element.";
									break;
								}
								case 111: {
									title =   "None of the profiles listed in the application descriptor support native extensions.";
									message = "Add a profile to the supportedProfies list that supports native extensions.";
									break;
								}
								case 112: {
									title =   "The AIR target doesn't support native extensions.";
									message = "Choose a target that supports native extensions.";
									break;
								}
								case 113: {
									title =   "<nativeLibrary> and <initializer> must be provided together.";
									message = "An initializer function must be specified for every native library in the native extension.";
									break;
								}
								case 114: {
									title =   "Found <finalizer> without <nativeLibrary>.";
									message = "Do not specify a finalizer unless the platform uses a native library.";
									break;
								}
								case 115: {
									title =   "The default platform must not contain a native implementation.";
									message = "Do not specify a native library in the default platform element.";
									break;
								}
								case 116: {
									title =   "Browser invocation is not supported for this target.";
									message = "The <allowBrowserInvocation> element cannot be true for the specified packaging target.";
									break;
								}
								case 117: {
									title =   "This target requires at least namespace n to package native extensions.";
									message = "Change the AIR namespace in the application descriptor to a supported value.";
									break;
								}
								/* Application icon errors */
								case 200: {
									title =   "Icon file cannot be opened";
									message = "Check that the file exists at the specified path.\nUse another application to ensure that the file can be opened.";
									break;
								}
								case 201: {
									title =   "Icon is the wrong size";
									message = "Icon size (in pixels) must match the XML tag. For example, given the application descriptor element:\n<image32x32>icon.png</image32x32>\nThe image in icon.png must be exactly 32x32 pixels.";
									break;
								}
								case 202: {
									title =   "Icon file contains an unsupported image format";
									message = "Only the PNG format is supported. Convert images in other formats before packaging your application.";
									break;
								}
								/* Application file errors */
								case 300: {
									title =   "Missing file, or file cannot be opened";
									message = "A file specified on the command line cannot be found, or cannot be opened.";
									break;
								}
								case 301: {
									title =   "Application descriptor file missing or cannot be opened";
									message = "The application descriptor file cannot be found at the specified path or cannot be opened.";
									break;
								}
								case 302: {
									title =   "Root content file missing from package";
									message = "The SWF or HTML file referenced in the <content> element of the application descriptor must be added to the package by including it in the files listed on the ADT command line.";
									break;
								}
								case 303: {
									title =   "Icon file missing from package";
									message = "The icon files specified in the application descriptor must be added to the package by including them among the files listed on the ADT command line. Icon files are not added automatically.";
									break;
								}
								case 304: {
									title =   "Initial window content is invalid";
									message = "The file referenced in the <content> element of the application descriptor is not recognized as a valid HTML or SWF file.";
									break;
								}
								case 305: {
									title =   "Initial window content SWF version exceeds namespace version";
									message = "The SWF version of the file referenced in the <content> element of the application descriptor is not supported by the version of AIR specified in the descriptor namespace. For example, attempting to package a SWF10 (Flash Player 10) file as the initial content of an AIR 1.1 application will generate this error.";
									break;
								}
								case 306: {
									title =   "Profile not supported.";
									message = "The profile you are specifying in the application descriptor file is not supported. See supportedProfiles.";
									break;
								}
								case 307: {
									title =   "Namespace must be at least nnn.";
									message = "Use the appropriate namespace for the features used in the application (such as the 2.0 namespace).		";
									break;
								}
								/* Android errors */
								case 400: {
									title =   "Current Android sdk version doesn't support attribute.";
									message = "Check that the attribute name is spelled correctly and is a valid attribute for the element in which it appears. You may need to set the -platformsdk flag in the ADT command if the attribute was introduced after Android 2.2.";
									break;
								}
								case 401: {
									title =   "Current Android sdk version doesn't support attribute value";
									message = "Check that the attribute value is spelled correctly and is a valid value for the attribute. You may need to set the -platformsdk flag in the ADT command if the attribute value was introduced after Android 2.2.";
									break;
								}
								case 402: {
									title =   "Current Android sdk version doesn't support XML tag";
									message = "Check that the XML tag name is spelled correctly and is a valid Android manifest document element. You may need to set the -platformsdk flag in the ADT command if the element was introduced after Android 2.2.";
									break;
								}
								case 403: {
									title =   "Android tag is not allowed to be overridden";
									message = "The application is attempting to override an Android manifest element that is reserved for use by AIR. See Android settings.";
									break;
								}
								case 404: {
									title =   "Android attribute is not allowed to be overridden";
									message = "The application is attempting to override an Android manifest attribute that is reserved for use by AIR. See Android settings.";
									break;
								}
								case 405: {
									title =   "Android tag %1 must be the first element in manifestAdditions tag";
									message = "Move the specified tag to the required location.";
									break;
								}
								case 406: {
									title =   "The attribute %1 of the android tag %2 has invalid value %3.";
									message = "Supply a valid value for the attribute.";
									break;
								}
								default: {
									title =   "Unknown Error " + status;
									message = "Better luck next time!";
									break;
								}
							}
						}
						showNotification(title, message, "Oh no!");
					})
				}, error => {
					console.log("passwordGet.then((error): ");
					showNotification("Password failed!", "Something happened when trying to use or save the pasword!", "That's odd");
				},(reject) => {
					console.log("passwordGet.then((reject): ");
					showNotification("Password failed!", "rej" + reject, "Booo!!");
				});
			}, (reject) => {
				// To make this a little neater, remove the workspace's path from the stderr messages
				var message = reject.stderr.replaceAll(nova.workspace.path,"");
				showNotification("Export Release Build failed!", "One or errors were found while trying to build the release version. Unable to export.\n" + message, "Uht oh!");
			});
		}, (reject) => {
			showNotification("Project UUID Missing", reject + "\nPlease use the Import Flash Builder option in the menu, or ensure that `uuidgen` is on your system's path!","Uht oh!");
		});
	}

	/**
	 * Builds the SWF for the project
	 * @param {bool} copyAssets - If we should copy assets to the destination
	 * @param {string} mainSrcDir - The main source folder (where the main class or app.xml is)
	 * @param {string} mainApplicationPath - The path to the
	 * @param {Array} sourceDirs - Any additional paths that need to be included in the project
	 * @param {Array} libPaths - Any additional library paths that need to be included
	 * @param {string} appXMLName - The name of the app.xml file
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} whatKind - What kind of build, either `release`|`debug`
	 * @param {string} destDir - The destination to save the build to
	 * @param {string} exportName - The name of the exported file
	 * @param {boolean} packageAfterBuild - If true, we are going to return the process of building
	 * as a Promise, otherwise a standard Nova Task that it can handle
	 */
	build(copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName, packageAfterBuild = false) {
		if(copyAssets) { // Copy each source dir to the output folder
			console.log("copyAssets Begins!");
			fileNamesToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.names");
			fileNamesToExclude.push(appXMLName);
			fileExtensionsToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.extensions");
			var copyDirs = sourceDirs.concat(mainSrcDir);
			if(copyDirs!=null) {
				copyDirs.forEach((copyDir) => {
					if(copyDir.charAt(0)=="~") { // If a user shortcut, resolve
						copyDir = nova.path.expanduser(copyDir);
					} else if(copyDir.charAt(0)!="/") { // If it's not a slash, it's relative to the workspace path
						copyDir = nova.path.join(nova.workspace.path, copyDir);
				   }
				   this.copyAssetsOf(copyDir, destDir, packageAfterBuild);
				});
			}
		}

		// FlashBuilder would modify the -app.xml with updated variables, so we will make a copy of the file, changing what FB would
		// Otherwise, this will write a copy.
		var appXML;
		console.log("AppXML location: " + appXMLName);
		try{
			appXML = nova.fs.open(nova.path.join(mainSrcDir, appXMLName))
		} catch(error) {
			console.log("Error opening APP XML! ",error);
			return null;
		}

		var newAppXML = nova.fs.open(destDir + "/" + appXMLName, "w");
		console.log("newAppXML location: " + destDir + "/" + appXMLName);
		if(appXML) {
			var line;
			var lineCount = 0;
			try {
				do {
					line = appXML.readline();
					//console.log(" READING LINE: " + line);
					lineCount++;
					if(line.indexOf("[This value will be overwritten by Flash Builder in the output app.xml]")!=-1) {
						line = line.replace("[This value will be overwritten by Flash Builder in the output app.xml]",exportName);
						//console.log(" REPLACING FB LINE: " + line);
					}
					newAppXML.write(line);
				} while(line && line.length>0);
				appXML.close();
			} catch(error) {
				if(lineCount==0) {
					console.log("*** ERROR: No APP XML file! error: ",error);
					consoleLogObject(error);
				}
			}
		}
		console.log("DONE!!");

		// Let's compile this thing!!
		var command = flexSDKBase + "/bin/mxmlc";
		var args = new Array();
		if(whatKind=="debug") {
			args.push("--debug=true");
		}

		args.push("--warnings=true");

		// If air, we need to add the configname=air, I'm assuming flex would be different?!
		args.push("+configname=air");

		// Push where the final SWF will be outputted
		args.push("--output=" + destDir + "/" + exportName);

		// Push args for the source-paths!
		if(sourceDirs) {
			sourceDirs.forEach((sourceDir) => {
				if(sourceDir.charAt(0)=="~") { // If a user shortcut, resolve
					sourceDir = nova.path.expanduser(sourceDir);
				}
				if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
					console.log("Change project frameworks!!!");
					sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase);
				}
				args.push("--source-path+=" + sourceDir);
			});
		}

		// This too should be from settings
		if(libPaths) {
			libPaths.forEach((libPath) => {
				/*
				// @NOTE, not sure this is needed, but it may come in handy
				if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
					libPath = libPath.replace("${PROJECT_FRAMEWORKS}",flexSDKBase);
				}
				//
				// Actually, if it's wrong, it's wrong. That shouldn't be skipped
				try {
					var checkPath = libPath;
					if(libPath.charAt(0)=="~") { // If a user shortcut, resolve
						checkPath = nova.path.expanduser(libPath);
					} else if(libPath.charAt(0)!="/") { // If it's not a slash, it's relative to the workspace path
						checkPath = nova.path.join(nova.workspace.path, libPath);
					}

					if(nova.fs.stat(checkPath).isDirectory()) {
						args.push("--library-path+=" + libPath);
					}
				} catch(error) {
					//console.log("Lib folder not found! ERROR: " + error)
				}
				*/
				args.push("--library-path+=" + libPath);
			});
		}

		// Additional compiler arguments
		if(nova.workspace.config.get("as3.compiler.additional")!=null) {
			/** @NOTE Needs work on parsing the additional args.
				Should really parse to make sure that there are no spaces or dash spaces
				Or make sure there's a quote around it if there's paths, or maybe just a
				space after an equal sign.
			*/
			var additional = nova.workspace.config.get("as3.compiler.additional");
			var ops = additional.split(" -");
			ops.forEach((addition,index) => {
				additional = (index>0 ? "-" : "") + addition;

				var eqLoc = addition.indexOf("=");
				var spaceLoc = addition.indexOf(" ");

				// Should handle something like "-locale en_US"
				if(eqLoc==-1 && spaceLoc!=-1) {
					var moreArgs = addition.split(" ");
					args.push(moreArgs[0]); 
					args.push(moreArgs[1]); 
				} else {
					args.push(additional); 
				}
			});
		}

		args.push("--");
		// We need the active application file to trigger this
		args.push("src/" + mainApplicationPath);
		if (nova.inDevMode()) {
			console.log(" *** COMMAND [[" + command + "]] ARG: \n");
			consoleLogObject(args);
		}

		if(packageAfterBuild) {
			console.log(" #### Okay, ready to do Promise!");
			return getProcessResults(command, args, nova.workspace.path);
		} else {
			return new TaskProcessAction(command, { args: args });
		}
	}

	/**
	 * @TODO
	 * Run the project with debugger (Not implemented yet, so it's just running as usual!)
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	debugRun(flexSDKBase, profile, destDir, appXMLName) {
		/*
		var base = nova.path.join(nova.extension.path, "debugger");

		var args = new Array;

		args.push("--server");
		args.push("-Dflexlib=" + flexSDKBase);
		if(isWorkspace()) {
			args.push("-Dworkspace=" + nova.workspace.path);
		}
		//uncomment to debug the SWF debugger JAR
		args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005");
		args.push("-cp");
		args.push("" + base + "/bundled-debugger/*:" + base + "/bin/*");
		args.push("com.as3mxml.vscode.SWFDebug");

		// @NOTE From Icarus extension
		var action = new TaskDebugAdapterAction("actionscript");
		action.command = "/usr/bin/java";
		action.args = args;
		action.transport = "socket";
		action.port="4711";
		action.adapterStart = "launch";

		console.log("DEBUG!");
		consoleLogObject(args);
		// Haven't figured how to hook up debugger...
		*/

		return this.run(flexSDKBase, profile, destDir, appXMLName);
	}

	/**
	 * Runs the project using Nova's task system
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	run(flexSDKBase, profile, destDir, appXMLName) {
		// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
		// To launch ADL, we need to point it to the "-app.xml" file
		var command = flexSDKBase + "/bin/adl";
		var args = [];

		console.log("CONFIG: " + profile);
		if(profile!="default") {
			args.push("-profile");
			args.push(profile);
		}

		// The app.xml file
		args.push(destDir + "/" + appXMLName);

		// Root directory goes next
		// "--" then args go now...

		if (nova.inDevMode()) {
			console.log(" *** Attempting to Run ADL with [[" + command + "]] ARG: \n");
			consoleLogObject(args);
		}

		return new TaskProcessAction(command, {
			shell: true,
			args: args,
			env: {}
		});
	}

	/**
	 * Copies all files from the "src" directory to the "dest" directory, avoiding the `ignoreCopy` assets
	 * @param {string} src - The source directory to copy
	 * @param {string} dest - The location to copy the files to
	 */
	copyAssetsOf(src, dest, packageAfterBuild = false) {
		nova.fs.listdir(src).forEach(filename => {
			let currPath = src + '/' + filename;
			///if(this.ignoreCopy.includes(filename)==false) {
			if(shouldIgnoreFileName(filename)==false) {
				if (nova.fs.stat(currPath).isFile()) {
					try{
						// We have to remove it before coping, or @TODO chack if we should replace or skip copying
						if(nova.fs.access(dest+"/"+filename,nova.fs.constants.F_OK)) {
							nova.fs.remove(dest+"/"+filename);
						}
						nova.fs.copy(currPath,dest+"/"+filename);
					} catch(error) {
						console.log(" *** ERROR copyAssetsOf(): ",error);
					}
				} else if (nova.fs.stat(currPath).isDirectory()) {
					nova.fs.mkdir(dest + "/" + filename);
					// Let's also copy this directory too...
					this.copyAssetsOf(currPath, dest + "/" + filename);
				}
			}
		});
	}

	/**
	 * Opens a file and dumps it into a string.
	 * @param {string} filename - The name of the file to open, relative to the workspace
	 * @param {boolean} trimAll - Default: true. Trims each line, and removes extra spacing (useful for pjxml and our XML files!)
	 */
	getStringOfWorkspaceFile(filename, trimAll = true) {
		var line, contents;
		try {
			contents = "";
			//console.log("Trying to open: " + nova.path.join(nova.workspace.path, filename));
			var file = nova.fs.open(nova.path.join(nova.workspace.path, filename));
			if(file) {
				do {
					line = file.readline();
					if(line!=null) {
						if(trimAll) {
							line = line.trim();
						}
						contents += line;
					}
				} while(line && line.length>0);
			}

			if(trimAll) {
				contents = contents.replace((/  |\r\n|\n|\r/gm),"");  // contents.replace(/(\r\n|\n|\r)/gm,"")
			}
		} catch(error) {
			console.log("*** ERROR: Could not open file " + nova.path.join(nova.workspace.path, filename) + " for reading. ***");
			return null;
		}
		return contents;
	}

    /**
     * Imports setting from a Flash Builder project files and adjust the workspace's settings
     */
	importFlashBuilderSettings() {
        // Check ".project" XML file for things
		var projectXml = pjXML.parse(this.getStringOfWorkspaceFile(".project"));

        // Change project name to the Flash Builder project name:
        nova.workspace.config.set("workspace.name",String(projectXml.select("//name")[0]["content"]).trim());

        // Check if there is a ".flexProperties"
		// @NOTE Not sure what else we would need from this file
        var isFlex = false;
		var flexProperties = this.getStringOfWorkspaceFile(".flexProperties");
        if(flexProperties!=null) {
            var flexPropertiesXml = pjXML.parse(flexProperties);
		    //console.log("compilerSourcePath> " + flexPropertiesXml.select("//flexProperties"));
		    //consoleLogObject(flexPropertiesXml.select("//flexProperties"));
        	nova.workspace.config.set("editor.default_syntax","MXML");
        	nova.workspace.config.set("as3.application.isFlex",true);
            isFlex = true;
        } else {
        	nova.workspace.config.set("editor.default_syntax","ActionScript 3");
        	nova.workspace.config.set("as3.application.isFlex",false);
        }

		// Check ".actionScriptProperties"
		var actionscriptPropertiesXml = pjXML.parse(this.getStringOfWorkspaceFile(".actionScriptProperties").replace("\\n","").replace("\\r",""));

		var mainApplicationPath = getTagAttribute(actionscriptPropertiesXml,"actionScriptProperties","mainApplicationPath");
        nova.workspace.config.set("as3.application.mainApp",mainApplicationPath);

		var projectUUID = getTagAttribute(actionscriptPropertiesXml,"actionScriptProperties","projectUUID");
        nova.workspace.config.set("as3.application.projectUUID",projectUUID);
/*
        var swfName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));
		console.log("Name of SWF: [" + swfName  + "]");
*/
		nova.workspace.config.set("as3.build.source.main",getTagAttribute(actionscriptPropertiesXml,"compiler","sourceFolderPath"));

		var prefSourceDirs = [];
        actionscriptPropertiesXml.select("//compilerSourcePathEntry").forEach((sourceDir) => {
            console.log(" Add a 'Source Dirs:' entry of [" + getAttribute(sourceDir,"path") + "]");
			prefSourceDirs.push(getAttribute(sourceDir,"path"));
        });
		nova.workspace.config.set("as3.build.source.additional",prefSourceDirs);

		nova.workspace.config.set("as3.build.output",getTagAttribute(actionscriptPropertiesXml,"compiler","outputFolderPath"));

		// Since the XML may have libraryPathEntries in multiple places, we need to take a look at the top children of it.
		//Since pjxml seems to add "" contents after the fact, let's check each one
		var prefLibDirs = [];
		actionscriptPropertiesXml.select("//libraryPath").content.forEach((libDir) => {
			if(libDir!="") {
        		if(libDir["attributes"]["kind"]==1) {
            		console.log("Add a 'Libs Dirs:` entry of [" + getAttribute(libDir,"path") + "]");
					prefLibDirs.push(getAttribute(libDir,"path"));
				} else {
					// @TODO Kind 4 may be excludes, need to look into how to add that to the call to build...
				}
			}
		});

		nova.workspace.config.set("as3.build.library.additional",prefLibDirs);

		nova.workspace.config.set("as3.build.verifyRSL",(getTagAttribute(actionscriptPropertiesXml,"compiler","verifyDigests")=="true" ? true : false));

		nova.workspace.config.set("as3.build.removeRSL",(getTagAttribute(actionscriptPropertiesXml,"compiler","removeUnusedRSL")=="true" ? true : false));

		nova.workspace.config.set("as3.build.localDebugRuntime",(getTagAttribute(actionscriptPropertiesXml,"compiler","useDebugRSLSwfs")=="true" ? true : false));

		nova.workspace.config.set("as3.build.autoOrder",(getTagAttribute(actionscriptPropertiesXml,"compiler","autoRSLOrdering")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.copy",(getTagAttribute(actionscriptPropertiesXml,"compiler","copyDependentFiles")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.generateAccessable",(getTagAttribute(actionscriptPropertiesXml,"compiler","generateAccessible")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.strict",(getTagAttribute(actionscriptPropertiesXml,"compiler","strict")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.enableWarnings",(getTagAttribute(actionscriptPropertiesXml,"compiler","warn")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.additional",getTagAttribute(actionscriptPropertiesXml,"compiler","additionalCompilerArguments"));

		// Packaging
		nova.workspace.config.set("as3.packaging.certificate",getTagAttribute(actionscriptPropertiesXml,"airSettings","airCertificatePath"));

		nova.workspace.config.set("as3.packaging.timestamp",getTagAttribute(actionscriptPropertiesXml,"airSettings","airTimestamp"));

		var excludedInPackage = []
		actionscriptPropertiesXml.select("//airExcludes").content.forEach((excludes) => {
			if(excludes!="") {
        		console.log("Add an exclude to packaging with entry of [" + getAttribute(excludes,"path") + "]");
				excludedInPackage.push(getAttribute(excludes,"path"));
			}
		});
		nova.workspace.config.set("as3.packaging.excludedFiles",excludedInPackage);
	}

    /**
     * Handles the Clean/Build/Run stuff.
     * @param {class} context - What's coming from the build options
     */
	resolveTaskAction(context) {
		var data = context.data;
		var config = context.config;
		var action = context.action;

		// Get the context.config so we can get the Task settings!
		var whatKind = config.get("actionscript3.request");

		var destDir = nova.workspace.config.get("as3.build.output");
		if(destDir==null) {
			destDir = nova.path.join(nova.workspace.path, "bin-debug");
		} else {
			destDir = nova.path.join(nova.workspace.path, destDir);
		}

		var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
		var isFlex = nova.workspace.config.get("as3.application.isFlex");
		var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

		// Use this to get setting from the extension or the workspace!
		var flexSDKBase = determineFlexSDKBase();

		if(action==Task.Build && data.type=="actionscript") {
			var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));

			var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));

			var copyAssets = nova.workspace.config.get("as3.compiler.copy");

        	var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

        	var libPaths = nova.workspace.config.get("as3.build.library.additional");

			return this.build(copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName);
		} else if(action==Task.Run && data.type=="actionscript") {
			// @TODO Check if the output files are there, otherwise prompt to build
			var profile = config.get("as3.task.profile");
			if(whatKind=="debug") {
				return this.debugRun(flexSDKBase, profile, destDir, appXMLName);
			} else {
				return this.run(flexSDKBase, profile, destDir, appXMLName );
			}
		} else if(action==Task.Clean /* && data.type=="actionscript"*/) {
            return new TaskCommandAction("actionscript.clean", { args: [destDir] });
		}
	}
}

function determineFlexSDKBase() {
	// Check if user setup the location of the SDK for this project
	var flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.framework");
	if(flexSDKBase!=null && flexSDKBase.charAt(0)=="~") {
		flexSDKBase = nova.path.expanduser(flexSDKBase);
	}

	// Since we can't use user's SDK location, try default
	if(flexSDKBase==null || (nova.fs.access(flexSDKBase, nova.fs.F_OK | nova.fs.X_OK)==false)) {
		flexSDKBase = getWorkspaceOrGlobalConfig("as3mxml.sdk.default");
		if(flexSDKBase.charAt(0)=="~") {
			flexSDKBase = nova.path.expanduser(flexSDKBase);
		}
	}
	///console.log("Setting as3mxml.sdk.framework: " + getWorkspaceOrGlobalConfig("as3mxml.sdk.framework"))
	///console.log("Setting as3mxml.sdk.default: " + getWorkspaceOrGlobalConfig("as3mxml.sdk.default"))
	///console.log("Using flexSDKBase: " + flexSDKBase);
	return flexSDKBase;
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
            showNotification("Configure AIR SDK!", "In order to use this extension you will need to have installed a FlexSDK. Please set the location of \"Default AIR SDK\" in the extension preferences!")
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
            args.push("-Xlog:all=warning:stdout");
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

function saveAllFiles() {
    nova.workspace.textEditors.forEach((editor)=> {
        editor.save();
    });
}

function consoleLogObject(object) {
	console.log(JSON.stringify(object,null,4));
}

function rangeToLspRange(document, range) {
	const fullContents = document.getTextInRange(new Range(0, document.length));

	let chars = 0;
	let startLspRange;

	const lines = fullContents.split(document.eol);

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const lineLength = lines[lineIndex].length + document.eol.length;
		if (!startLspRange && chars + lineLength >= range.start) {
			const character = range.start - chars;
			startLspRange = { line: lineIndex, character };
		}
		if (startLspRange && chars + lineLength >= range.end) {
			const character = range.end - chars;
			return {
				start: startLspRange,
				end: { line: lineIndex, character },
			};
		}
		chars += lineLength;
	}
	return null;
};

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