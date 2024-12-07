const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { showNotification, getProcessResults, saveAllFiles, consoleLogObject, rangeToLspRange, getStringOfWorkspaceFile } = require("./nova-utils.js");
const { getWorkspaceOrGlobalConfig, isWorkspace, determineFlexSDKBase } = require("./config-utils.js");
const { determineProjectUUID, resolveStatusCodeFromADT } = require("./as3-utils.js");

var fileExtensionsToExclude = [];
var fileNamesToExclude = [];

function shouldIgnoreFileName(fileName) {
	if(fileNamesToExclude.includes(fileName)) {
		return true;
	}
	if(fileExtensionsToExclude.some(ext => fileName.endsWith(ext))) {
		return true;
	}
	return false;
}

exports.ActionScript3TaskAssistant = class ActionScript3TaskAssistant {
	/** @TODO Make this an extension preference, like in Flash Builder > File Exclusions */
	// These files should be ignored when copying assets. The "-app.xml" gets processed,
	// so we won't want to copy that either.
	ignoreCopy = [ ".java", ".class", ".properties", ".mxml", ".as", ".fxg",
		".classpath", "flex-config.xml", "air-config.xml", "services-config.xml", "remoting-config.xml", "proxy-config.xml", "massaging-config.xml", "data-management-config.xml",
		// Also, ignore these things.
		".git",".svn",".DS_Store", "-app.xml"
	];

	/**
	 * This is boilerplate for a task that is made by the extension
	 * @type {Object}
	 */
	baseTaskJson = {
		"extension" : {
			"identifier" : "com.abattoirsoftware.actionscript3",
			"name" : "ActionScript 3"
		},
		"extensionTemplate" : "",
		"extensionValues": { }
	};

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

	quickChoicePalette(items, placeholder, addAll = false) {
		return new Promise((resolve) => {
			if(addAll) {
				items.unshift( "All" );
			}

			nova.workspace.showChoicePalette(items, {
				placeholder: placeholder,
			}, (value,index) => {
				/*
				nova.workspace.showInformativeMessage(`Got choice: [[${value}]]`);
				console.log("Got choice:", value);
				console.log("Got index:", index);
				*/
				resolve({ value, index });
			});
		})
	}

	/**
	 * Handles packaging the project. We are going to use Tasks as our guide on how to package them. In Flash Builder, you could have several targets, which
	 * we have converted to Tasks using the Import Flash Builder functionality. First, we check if there are any tasks. Then we proceed to read them
	 */
	packageBuild() {
		var tasks = [];
		var taskJson;
		var taskConfig = null;

		// Ensure Tasks folder is available (and check if they are ones of our extension)!
		// @NOTE Unfortunately, it doesn't seem there is a way to get these from Nova, so we have to manually read and hope they are good!
		if(nova.fs.access(nova.workspace.path + "/.nova/Tasks", nova.fs.F_OK | nova.fs.X_OK)) {
			var files = nova.fs.listdir(nova.workspace.path + "/.nova/Tasks/");
			files.forEach((file) => {
				if(file.indexOf(".json")!=-1) {
					// Try to get the file as JSON
					try {
						taskJson = JSON.parse(getStringOfWorkspaceFile("/.nova/Tasks/" + file));
						// Only add thos that have an extension identifier of our extension!
						if(taskJson["extension"]["identifier"]=="com.abattoirsoftware.actionscript3") {
							tasks.push(file);
						}
					} catch(error) { }
				}
			});
		}

		if(tasks.length==0) {
			// If there are not tasks, then show the error and then out
			nova.workspace.showErrorMessage("Please create at least one Task and adjust it's settings. You can either manually do so, or use the \"Import Flash Builder settings\" options if migrating from Flash Builder");
		} else {
			// Since we have tasks, we can attempt a release build.
			var taskFileNamePromise;
			if(tasks.length==1) {
				// If only one, then we're going to resolve the promise to the first file name
				taskFileNamePromise = Promise.resolve(tasks[0]);
			} else {
				// If there are multiple tasks, ask which one to build
				var placeholder = "Select which Task item to build? Select one from below";

				// Sort the task names. But we need to strip the extension first so it matches the listing in the Task drop down
				tasks.sort((a, b) => {
					const strippedA = a.replace(".json", "");
					const strippedB = b.replace(".json", "");
					return strippedA.localeCompare(strippedB, undefined, { numeric: true, sensitivity: 'base' });
				});

				// Unless we've attempted to build before, then we will default to the last one selected as the placeholder
				if(nova.workspace.config.get("as3.packaging.lastReleaseBuilt")!=null) {
					placeholder = nova.workspace.config.get("as3.packaging.lastReleaseBuilt")

					// Remove the placeholder from the array if it exists
					tasks = tasks.filter(task => task !== placeholder);

					// Add the placeholder to the top of the list
					tasks.unshift(placeholder);
				}

				// Show the choice palette to get the name of the task file
				taskFileNamePromise = this.quickChoicePalette(tasks,placeholder).then((choice) => choice.value);
			}

			// Now that we have a task file name, let's try to get the config!
			taskFileNamePromise.then((taskFileName) => {
				//console.log("Task File Name: [[" + taskFileName + "]]");
				// If it's undefined, then the user escaped the palette
				if(taskFileName==undefined) {
					return;
				}

				var buildType = "air";

				// If we have a task file name, then let's process it
				if(taskFileName!="") {
					// Since we have a name, let's set the last task
					nova.workspace.config.set("as3.packaging.lastReleaseBuilt",taskFileName);

					taskJson = JSON.parse(getStringOfWorkspaceFile("/.nova/Tasks/" + taskFileName));
					try {
				// console.log("-= TASK JSON: " + taskFileName + " =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
				// consoleLogObject(taskJson);
				// console.log("-= --------- =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
						if(taskJson["extensionTemplate"].startsWith("actionscript-")==false) {
							nova.workspace.showErrorMessage("Sorry, Export Release Build does not yet handle " + taskJson["extensionTemplate"] + "!");
							return;
						}
						taskConfig = taskJson["extensionValues"];
						switch(taskJson["extensionTemplate"]) {
							case "actionscript-ios":
							case "actionscript-android":
							case "actionscript-airmobile": {
								buildType="airmobile";
								break;
							}
						}

					} catch(error) { }

					if(taskConfig==null) {
						nova.workspace.showErrorMessage("Could not parse Task, are you sure you created it with the ActionScript 3 extension?!");
						return;
					}
				}

				// console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
				// consoleLogObject(taskConfig);
				// console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");

				// We need a project UUID which we use to save the certificate password in a later step, but let's check
				// first. It should generate one if possible, but on the unlikely event, we should abort.
				var projectUUID = determineProjectUUID();
				projectUUID.then((resolve) => { // Now that we have the UUID, let's try to make a build
					var isFlex = nova.workspace.config.get("as3.application.isFlex");

					var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
					// console.log("MAIN APP: [[" + mainApplicationPath + "]]");
					if(mainApplicationPath==null) {
					}
					// console.log("IS FLEX: " + isFlex);
					var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));
					// console.log("packageBuild() say appXMLName:" + appXMLName);

					// Use this to get setting from the extension or the workspace!
					var flexSDKBase = determineFlexSDKBase();
					if(flexSDKBase==null) {
						nova.workspace.showErrorMessage("Please configure the Flex SDK base, which is required for building this type of project");
					}

					var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));
					if(mainSrcDir==null) {
						mainSrcDir = "src";
					}

					var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));
					var packageName = (isFlex ? mainApplicationPath.replace(".mxml",".air") : mainApplicationPath.replace(".as",".air"));

					var copyAssets = nova.workspace.config.get("as3.compiler.copy");

					var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

					var libPaths = nova.workspace.config.get("as3.build.library.additional");

					var anePaths = nova.workspace.config.get("as3.packaging.anes");

					var releasePath = "bin-release-temp";

					/** @TODO Figure out what type of build... */
					this.build(buildType, true, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, "release", nova.path.join(nova.workspace.path, releasePath), exportName, true, anePaths).then((resolve) => {
						// console.log(" # # # # # # # # # # # # # # # # # # # # # # # #")
						// console.log(" # # # # # # # # # # # # # # # # # # # # # # # #")
						// console.log("appXMLName:" + appXMLName);
						// console.log("this.build() resolve:");
						// consoleLogObject(resolve);
						// @TODO - If there is warnings, ask if you want to continue, or abort.

						// Loop through the output, and copy things unless specified to exclude like the .actionScriptProperties
						//let alsoIgnore = getWorkspaceOrGlobalConfig("as3.packaging.excludedFiles");
						let alsoIgnore = taskConfig["as3.packaging.excludedFiles"];
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

						// This will be a promise, I promise!
						var passwordGet;

						// If password is empty, let's try to get it.
						if(passwordCheck=="") {
							var request = new NotificationRequest("Export Release Build...");
							request.title = "Digital Signature ";
							request.body = "Enter the password for the certificate " + taskConfig["as3.packaging.certificate"];
							request.textInputValue = passwordCheck;
							request.type = "input";
							request.actions = ["This time", "Save", "Cancel"];

							passwordGet = nova.notifications.add(request);
						} else {
							// We have a password, fulfill the promise
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
							var env = {};

							args.push("-package");

							// Only for Android building
							if(taskConfig["as3.target"]=="android") {
								// Check if we want to disable AIR Flair. I know I do!
								var noAndroidAirFlair = taskConfig["as3.deployment.noFlair"];								if(noAndroidAirFlair!=undefined) {
									// console.log("AIR FLAIR: " + noAndroidAirFlair);								} else {
									noAndroidAirFlair = false;
									// console.log("AIR FLAIR undefined, so now it'll be false!");								}

								if(noAndroidAirFlair) {
									env = { AIR_NOANDROIDFLAIR: "true" };
								}

								args.push("-target");
								var targetType = taskConfig["as3.deployment.target"];
								if(targetType==null) {
									targetType = "apk"
								}
								args.push(targetType);
								if(targetType.indexOf("aab")!=-1) {
									packageName = packageName.replace(/\.air$/, ".aab");
								} else {
									// @NOTE Not sure what the android-studio packages should be...
									packageName = packageName.replace(/\.air$/, ".apk");
								}

								args.push("-arch");
								// console.log("taskConfig: ");
								// consoleLogObject(taskConfig);
								// console.log("taskConfig[as3.deployment.arch]: " + taskConfig["as3.deployment.arch"]);
								var archType = taskConfig["as3.deployment.arch"];
								if(archType==null) {
									archType = "armv7";
								}
								args.push(archType);
							}
							args.push("-storetype");
							args.push("pkcs12");

							args.push("-keystore");
							/** @TODO Change to task pointer, or get Workspace and then replace with task value if available!  */
							args.push(taskConfig["as3.packaging.certificate"]);

							args.push("-storepass");
							args.push(password);

							/** @TODO Change to task pointer, or get Workspace and then replace with task value if available!  */
							var doTimestamp = nova.workspace.config.get("as3.packaging.timestamp");
							if(doTimestamp==false) {
								args.push("-tsa");
								args.push("none");
							} else {
								var customTimestamp = nova.workspace.config.get("as3.packaging.timestampUrl");
								if(customTimestamp!=null && customTimestamp!="") {
									args.push("-tsa");
									args.push(customTimestamp);
								}
							}

							// AIR (or APK, AAB, IPA) Package name
							// @TODO Export location being set somewhere? maybe?
							args.push(nova.path.join(nova.workspace.path, packageName));

							// Descriptor
							args.push(appXMLName);

							// Loop through each item in the releasePath, and if it's not the app.xml, copy it to the packing
							function listFilesRecursively(folderPath, relativePath = "") {
								let fileList = [];
								try {
									nova.fs.listdir(folderPath).forEach(filename => {
										let fullPath = nova.path.join(folderPath, filename);
										let currentRelativePath = nova.path.join(relativePath, filename);

										if (nova.fs.stat(fullPath).isDirectory()) {
											// Recurse into subdirectory and add the returned files to the list
											fileList = fileList.concat(listFilesRecursively(fullPath, currentRelativePath));
										} else {
											// Add the relative file path to the list
											fileList.push(currentRelativePath);
										}
									});
								} catch (error) {
									console.error(`Error reading folder ${folderPath}: ${error}`);
								}
								return fileList;
							}

							// Usage
							let baseFolderPath = nova.path.join(nova.workspace.path, releasePath);
							let files = listFilesRecursively(baseFolderPath);

							files.forEach((file) => {
								if(file!=appXMLName) {
									//args.push("-C");
									args.push(file);
									// console.log("SHOULD INCLUDE: " + file);
								} else {
									// console.log("Skip: " + file);
								}
							});

							if(taskConfig["as3.target"]=="android") {
								args.push("-platformsdk");
								var platformSdk = taskConfig["as3.deployment.platfromsdk"];
								if(platformSdk==null) {
									platformSdk = "~/Library/Android/sdk"
								}
								if (platformSdk.charAt(0) == "~") {
									platformSdk = nova.path.expanduser(platformSdk);
								}
								args.push(platformSdk);
							}

							args.unshift(command);
							var process = new Process("/usr/bin/env", {
								args: args,
								cwd: baseFolderPath,
								env: env
							});

							// consoleLogObject(process);
							if (nova.inDevMode()) {
								console.log(" *** COMMAND [[" + command + "]] ARG: \n");
								consoleLogObject(args);
							}

							var stdout = "";
							var stderr = "";
							process.onStdout(function(line) {
								console.log("STDOUT: " + line);
								stdout += line;
							});
							process.onStderr(function(line) {
								console.log("STDERR: " + line);
								stderr += line;
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
									var result = resolveStatusCodeFromADT(status);
									console.log("RESULT: ");
									// console.log("STDOUT: " + stdout);
									// console.log("STDERR: " + stderr);
									message = result.message;
									console.log("STDOUT: " + stdout);
									console.log("STDERR: " + stderr);
									nova.workspace.showErrorMessage("*** ERROR - " + title + " ***\n\n" + message);
								}
							})
						}, error => {
							console.log("passwordGet.then((error): ");
							nova.workspace.showErrorMessage("*** ERROR - Password failed! ***\n\nSomething happened when trying to use or save the pasword!");
						},(reject) => {
							console.log("passwordGet.then((reject): ");
							nova.workspace.showErrorMessage("*** Password failed! ***\n\n", "rej" + reject);
						});
					}, (reject) => {
						// To make this a little neater, remove the workspace's path from the stderr messages
						var message = reject.stderr.replaceAll(nova.workspace.path,"");
						nova.workspace.showErrorMessage("*** ERROR - Export Release Build failed! ***\n\nOne or more errors were found while trying to build the release version. Unable to export.\n" + message);
					});
				}, (reject) => {
					nova.workspace.showErrorMessage("*** ERROR - Project UUID Missing ***\n\n" + reject + "\nPlease use the Import Flash Builder option in the menu, or ensure that `uuidgen` is on your system's path!");
				});
			});
		}
	}

	/**
	 * Builds the SWF for the project
	 * @param {string} buildType - Which type of build, "air|airmobile|flex"
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
	build(buildType, copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName, packageAfterBuild = false, anePaths = []) {
		if(copyAssets) { // Copy each source dir to the output folder
			// console.log("copyAssets Begins!");
			fileNamesToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.names");
			fileNamesToExclude.push(appXMLName);
			fileExtensionsToExclude = getWorkspaceOrGlobalConfig("as3.fileExclusion.extensions");

			// console.log("Copy DIR: [[" + copyDirs + "]]")
			// consoleLogObject("Copy DIR: " + copyDirs)

			var copyDirs = sourceDirs.concat(mainSrcDir);
			// console.log("Copy DIR: [[" + copyDirs + "]]")
			// consoleLogObject("Copy DIR: " + copyDirs)

			if(copyDirs!=null) {

				const copyPromises = copyDirs.map(copyDirRaw => {
					let copyDir = copyDirRaw;
					if (copyDir.charAt(0) == "~") {
						copyDir = nova.path.expanduser(copyDir);
					} else if (copyDir.charAt(0) != "/") {
						copyDir = nova.path.join(nova.workspace.path, copyDir);
					}
					// console.log(`Starting to copy assets from [[${copyDir}]] to [[${destDir}]]`);
					this.ensureFolderIsAvailable(destDir);
					return this.copyAssetsOf(copyDir, destDir, packageAfterBuild); // Return the Promise
				});

				Promise.all(copyPromises)
					.then(() => {
						console.log("All assets copied successfully.");
					})
					.catch(error => {
						console.error("Error during asset copying:", error);
					});

// console.log(" # # # # # # # %%%%%%%%%%$%%% DONE COPYING FILES!!!");
// console.log(" # # # # # # # %%%%%%%%%%$%%% DONE COPYING FILES!!!");
// console.log(" # # # # # # # %%%%%%%%%%$%%% DONE COPYING FILES!!!");
				/*
				copyDirs.forEach((copyDir) => {
					if(copyDir.charAt(0)=="~") { // If a user shortcut, resolve
						copyDir = nova.path.expanduser(copyDir);
					} else if(copyDir.charAt(0)!="/") { // If it's not a slash, it's relative to the workspace path
						copyDir = nova.path.join(nova.workspace.path, copyDir);
					}
					console.log("  >][[[] Starting to copy assets of [[" + copyDir + "]] to [[" + destDir + "]]")
					this.ensureFolderIsAvailable(destDir);
					this.copyAssetsOf(copyDir, destDir, packageAfterBuild);
				});
				*/
			}
		}

// console.log(" # # # # # # # # # # # # # # # # # # # # # Moving on....");
		// FlashBuilder would modify the -app.xml with updated variables, so we will make a copy of the file, changing what FB would
		// Otherwise, this will write a copy.
		var appXML;
		// console.log("AppXML location: " + appXMLName);
		try{
			appXML = nova.fs.open(nova.path.join(mainSrcDir, appXMLName))
		} catch(error) {
			// console.log("Error opening APP XML! ",error);
			return null;
		}

		var newAppXML = nova.fs.open(destDir + "/" + appXMLName, "w");
		// console.log("newAppXML location: " + destDir + "/" + appXMLName);
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
		// console.log("DONE!!");

		// Let's compile this thing!!
		var command = flexSDKBase + "/bin/mxmlc";
		var args = new Array();
		/*
		if(whatKind=="debug") {
			args.push("--debug=true");
		}
		*/
		args.push("--debug=true");

		args.push("--warnings=true");

		// console.log("buildType: " + buildType);
		if(buildType=="airmobile") {
			args.push("+configname=airmobile");
		} else {
			args.push("+configname=air");
		}

		// If air, we need to add the configname=air, I'm assuming flex would be different?!
/*
		var isFlex = nova.workspace.config.get("as3.application.isFlex");
		if(isFlex) {
			args.push("+configname=flex");
		}
*/
		// Push where the final SWF will be outputted
		args.push("--output=" + destDir + "/" + exportName);

		// Add base, just in case there are Embeds that look for stuff here using relative locations
		//args.push("--source-path=./");

		// Push args for the source-paths!
		if(sourceDirs) {
			sourceDirs.forEach((sourceDir) => {
				if(sourceDir.charAt(0)=="~") { // If a user shortcut, resolve
					sourceDir = nova.path.expanduser(sourceDir);
				}
				if(sourceDir.includes("${PROJECT_FRAMEWORKS}")) {
					sourceDir = sourceDir.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks/");
				}
				args.push("--source-path+=" + sourceDir);
			});
		}

		// This too should be from settings
		if(libPaths) {
			libPaths.forEach((libPath) => {
				// @NOTE, not sure this is needed, but it may come in handy
				if(libPath.includes("${PROJECT_FRAMEWORKS}")) {
					libPath = libPath.replace("${PROJECT_FRAMEWORKS}",flexSDKBase+"/frameworks/");
				}
				if(libPath.includes("{locale}")) {
					/** @TODO Need to figure out how to get locale... Maybe a setting in the extension or preferences */
					libPath = libPath.replace("{locale}","en_US");
				}
				/*
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

		// If we have ANEs, we will need to unzip them to a folder so that ADL can run and point to those
		// ANEs so we can run on desktop. But, if it's building for packing, ADT will incorporate that into
		// the package for us!
		if(anePaths) {
 			var extdir = destDir + "/ane";
			if(packageAfterBuild==false) {
				// If the destination "extdir" exists, delete it then make it!
				try {
					if(nova.fs.stat(extdir).isDirectory()) {
						nova.fs.rmdir(extdir);
					}
					nova.fs.mkdir(extdir);
				} catch(error) {
					console.log("*** ERROR: Failed to make ANE temp folder *** ");
				}
			}
			anePaths.forEach((anePath) => {
				args.push("--external-library-path+=" + anePath);
				// Needed?
				//args.push("--library-path+=" + anePath);
				if(packageAfterBuild==false) {
					var aneDest = anePath.substring(anePath.lastIndexOf("/"),anePath.length);
					//console.log("ANE DEST: [[" + aneDest + "]]");
					//console.log("ANE PATH: [[" + anePath + "]]");
					//console.log("/usr/bin/unzip" + " " + anePath + " " + "-d" + " " + extdir + aneDest);
					try {
						nova.fs.mkdir(extdir + aneDest);
						var unzip = getProcessResults("/usr/bin/unzip",[ anePath, "-d", extdir + aneDest], nova.workspace.path );
						unzip.then((resolve) => {
							// console.log("Unzip successful?!");
						},(reject) => {
							console.log("Unzip failed?!?!");
						});
					} catch(error) {
						console.log("*** ERROR: Couldn't unzip ANE for test runs ***");
					}
				}
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
			console.log(" #### Okay, should be playing according to Nova!");
			return new TaskProcessAction(command, { args: args });
		}
	}

	/**
	 * @TODO
	 * Run the project with debugger (Not implemented yet, so it's just running as usual!)
	 * @param {string} buildType - Which type of build, "air|airmobile|flex"
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	debugRun(buildType, flexSDKBase, profile, destDir, appXMLName, config) {
/*		var base = nova.path.join(nova.extension.path, "debugger");

		let args = [];
		args.push("-server");
		args.push("-Dflexlib=" + flexSDKBase);
		if(isWorkspace()) {
			args.push("-Dworkspace=" + nova.workspace.path);
		}

		//uncomment to debug the SWF debugger JAR
		//args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005");
		args.push("-cp");
		args.push("" + base + "/bundled-debugger/*:" + base + "/bin/*");
		args.push("com.as3mxml.vscode.SWFDebug");

		// @NOTE From Icarus extension
		var action = new TaskDebugAdapterAction("actionscript3");
		action.command = "/usr/bin/java";
		action.args = args;
		// action.transport = "socket";
		// action.port="4711";
		action.adapterStart = "launch";

		// Print out all the args so I know what's getting passed!
		if(nova.inDevMode()) {
			var argsOut = "";
			args.forEach(a => argsOut += a + "\n")
			console.log(" *** ARGS:: \\/\\/\\/\n\n" + argsOut + "\n *** ARGS:: /\\/\\/\\");
		}
		console.log("DEBUG!");

		new Promise((resolve) => {
			console.log("Going to try running...");
			this.run(buildType, flexSDKBase, profile, destDir, appXMLName, config);
			console.log("Run should have happened..");
			resolve();
		}).then(() => {
			console.log("now the action should goTried running!");
			return action;
		});
*/
		return this.run(buildType, flexSDKBase, profile, destDir, appXMLName, config);
	}

	/**
	 * Runs the project using Nova's task system
	 * @param {string} buildType - Which type of build, "air|airmobile|flex"
	 * @param {string} flexSDKBase - The location of the Flex SDK
	 * @param {string} profile -
	 * @param {string} destDir - The location of where the saved build is
	 * @param {string} appXMLName - The name of the app.xml file
	 */
	run(buildType, flexSDKBase, profile, destDir, appXMLName, config) {
		var runningOnDevice = false;
		// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
		// To launch ADL, we need to point it to the "-app.xml" file
		var command = flexSDKBase + "/bin/adl";
		var args = [];

		var launchMethod = config.get("as3.task.launchMethod");
		if(launchMethod=="device") {
			// @TODO If we don't find devices, ask if they want to continue on desktop or try again?
		}

		if(buildType=="airmobile") {
			var screenSize = config.get("as3.task.deviceToSimulate");
			if(screenSize==null || screenSize=="none") {
				nova.workspace.showErrorMessage("ERROR!!!\n\n Please edit the Task to select a screen size to use in the simulator!");
				return false;
			} else {
				screenSize = screenSize.replace(/^[^-]*-\s*/, '').replace(/\s+/g, '');
			}

			args.push("-screensize");
			args.push(screenSize);
		}

		console.log("CONFIG: " + profile);
		// @TODO If default, we should check the -app.xml to see if there is a profile specified
		if(profile!="default") {
			args.push("-profile");
			args.push(profile);
		} else {
			// If it's default, make sure to use mobileDevice if were are in a airmobile task. Otherwise, we'll get errors
			if(profile=="default" && buildType=="airmobile") {
				args.push("-profile");
				args.push("mobileDevice");
			}
		}

		// ADL wants the directory with the ANEs
		/** @TODO Change to task pointer, or get Workspace and then replace with task value if available!  */
		//var anes = config.get("as3.packaging.anePaths"); //nova.workspace.config.get("as3.packaging.anes");
		var anes = nova.workspace.config.get("as3.packaging.anes");
		// If there are ANEs, then we need to include the "ane" folder we made with the extracted
		// ones that to the destination dir.
		console.log("anes: " + JSON.stringify(anes));
		if(anes && anes.length>0) {
			args.push("-extdir");
			args.push(destDir + "/ane");
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

		// Possible errors:
		//
		// application descriptor not found
		// Task Terminated with exit code 6
		// --
		// error while loading initial content
		// Task Terminated with exit code 9
	}

	/**
	 * Resolved symbolic links to their real location
	 *
	 * @param {string} folder - The location that is a symbolic link
	 * @returns {Promise} The resolved path, or a reject error.
	 */
	resolveSymLink(folder) {
		return new Promise((resolve, reject) => {
			try {
				const process = new Process("/usr/bin/readlink", {
					args: [folder]
				});

				let output = "";
				let errorOutput = "";

				process.onStdout(line => {
					output += line.trim();
				});

				process.onStderr(line => {
					errorOutput += line.trim();
				});

				process.onDidExit(status => {
					if (status === 0) {
						// Successfully resolved the symbolic link
						const lastSlashIndex = folder.lastIndexOf('/');
						const basePath = folder.substring(0, lastSlashIndex);
						const resolvedPath = nova.path.normalize(nova.path.join(basePath, output));
						resolve(resolvedPath);
					} else {
						reject(new Error(`Failed to resolve symlink for ${folder}: ${errorOutput}`));
					}
				});

				process.start();
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Copies the files from one place to another.
	 *
	 * @param {string} src - The source of the files to copy
	 * @param {string} dest - The destination folder location
	 * @param {boolean} packageAfterBuild - If we want to package the files after building
	 * @returns {Promise} - A resolve if everything copies, otherwise a reject with an error message
	 */
	copyAssetsOf(src, dest, packageAfterBuild = false) {
		return new Promise((resolve, reject) => {
			try {
				// Get all the entries in this folder
				const entries = nova.fs.listdir(src);
				const copyPromises = entries.map(filename => {
					// Check if it's a file that doesn't need to be included when packaging in general. (We also remove user specifics later)
					if(shouldIgnoreFileName(filename)==false) {
						const currPath = nova.path.join(src, filename);
						const stats = nova.fs.stat(currPath);
						if (!stats) {
							return Promise.reject(new Error(`Unable to stat path: ${currPath}`));
						}

						const destPath = nova.path.join(dest, filename);

						if (stats.isSymbolicLink()) {
							// If it's a symbolic link, we need to get the real path
							return this.resolveSymLink(currPath)
								.then(resolvedPath => {
									if (!nova.fs.stat(resolvedPath).isDirectory()) {
										try {
											// If the file exists, then remove since nova.fs.copy with throw an error.
											// Could possibly use stats.ctime/stats.size to compare, but my end up taking more time with lots of little files
											if (nova.fs.access(destPath, nova.fs.constants.F_OK)) {
												// console.log(" Removing existing [" + destPath + "]");
												nova.fs.remove(destPath);
											}
											nova.fs.copy(resolvedPath, destPath);
										} catch (error) {
											console.error(`Error copying symbolic linked file ${resolvedPath} to ${destPath}:`, error);
											return Promise.reject(error);
										}
										return Promise.resolve();
									} else {
										// If it's a symbolic link to a folder, let's copy the real files to our destination path!
										this.ensureFolderIsAvailable(destPath);
										return this.copyAssetsOf(resolvedPath, destPath, packageAfterBuild);
									}
								});
						} else if (stats.isFile()) {
							// Copy a file
							try {
								// If the file exists, then remove since nova.fs.copy with throw an error.
								// Could possibly use stats.ctime/stats.size to compare, but my end up taking more time with lots of little files
								if (nova.fs.access(destPath, nova.fs.constants.F_OK)) {
									// console.log(" Removing existing [" + destPath + "]");
									nova.fs.remove(destPath);
								}
								nova.fs.copy(currPath, destPath);
							} catch (error) {
								console.error(`Error copying file ${currPath} to ${destPath}:`, error);
								return Promise.reject(error);
							}
							return Promise.resolve();
						} else if (stats.isDirectory()) {
							// Make a folder, if it doesn't already exist.
							this.ensureFolderIsAvailable(destPath);
							// Go and copy this directory of stuff
							return this.copyAssetsOf(currPath, destPath, packageAfterBuild);
						} else {
							// Don't know what else would come up here. But just to be safe
							console.log(`Skipping unsupported file type: ${currPath}`);
							return Promise.resolve(); // No operation
						}
					}
				});

				// Wait for all copy operations to complete
				Promise.all(copyPromises)
					.then(() => {
						resolve(); // Resolve when all copies are done
					})
					.catch(error => {
						reject(error); // Reject if any copy fails
					});
			} catch (error) {
				reject(error); // Catch synchronous errors
			}
		});
	}

	/**
	 * Imports setting from a Flash Builder project files and adjust the workspace's settings
	 */
	importFlashBuilderSettings() {
		var projectXml =  new xmlToJson.ns3x2j(getStringOfWorkspaceFile(".project"));

		// console.log("Project ");
		// consoleLogObject(projectXml);
		// console.log("Project NAME? "+projectXml.getNodeChildrenByName("projectDescription","name"));

		// Change project name to the Flash Builder project name:
		nova.workspace.config.set("workspace.name",projectXml.getNodeChildrenByName("projectDescription","name").textContent);

		if(projectXml.getNodeChildrenByName("linkedResources","link")!=null) {
			showNotification("Flash Build Project Import","Nova does not support links like FlashBuilder or Eclipse. You may need to fix this yourself.");
		}

		// Check if there is a ".flexProperties"
		// @NOTE Not sure what else we would need from this file
		var isFlex = false;
		var flexProperties = getStringOfWorkspaceFile(".flexProperties");
		if(flexProperties!=null) {
//			var flexPropertiesXml = pjXML.parse(flexProperties);
			/** @NOTE Not sure we need to check any values, but if it's there, it's MXML vs AS3 project! */
			var flexPropertiesXml = new xmlToJson.ns3x2j(flexProperties,false);
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
		var actionscriptPropertiesXml = new xmlToJson.ns3x2j(getStringOfWorkspaceFile(".actionScriptProperties"));

		var mainApplicationPath = actionscriptPropertiesXml.getAttributeFromNodeByName("actionScriptProperties","mainApplicationPath");
		nova.workspace.config.set("as3.application.mainApp",mainApplicationPath);

		var projectUUID = actionscriptPropertiesXml.getAttributeFromNodeByName("actionScriptProperties","projectUUID");
		nova.workspace.config.set("as3.application.projectUUID",projectUUID);
/*
		var swfName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));
		console.log("Name of SWF: [" + swfName  + "]");
*/
		nova.workspace.config.set("as3.build.source.main",actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","sourceFolderPath"));

		var prefSourceDirs = [];
		actionscriptPropertiesXml.findNodesByName("compilerSourcePathEntry").forEach((sourceDir) => {
			console.log(" sourceDir: " + sourceDir["@"]["path"]);
			prefSourceDirs.push(sourceDir["@"]["path"]);
		});
		nova.workspace.config.set("as3.build.source.additional",prefSourceDirs);

		nova.workspace.config.set("as3.build.output",actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","outputFolderPath"));

		// Since the XML may have libraryPathEntries in multiple places, we need to take a look at the top children of it.
		//Since pjxml seems to add "" contents after the fact, let's check each one
		var prefLibDirs = [];

		actionscriptPropertiesXml.findNodesByName("libraryPathEntry").forEach((libDir) => {
			consoleLogObject(libDir);
			if(libDir["@"]["kind"]==1) {
				console.log("Add a 'Libs Dirs:` entry of [" + libDir["@"]["path"] + "]");
				prefLibDirs.push(libDir["@"]["path"]);
			} else {
				// @TODO Kind 4 may be excludes, need to look into how to add that to the call to build...
			}
		});

		nova.workspace.config.set("as3.build.library.additional",prefLibDirs);

		nova.workspace.config.set("as3.build.verifyRSL",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","verifyDigests")=="true" ? true : false));

		nova.workspace.config.set("as3.build.removeRSL",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","removeUnusedRSL")=="true" ? true : false));

		nova.workspace.config.set("as3.build.localDebugRuntime",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","useDebugRSLSwfs")=="true" ? true : false));

		nova.workspace.config.set("as3.build.autoOrder",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","autoRSLOrdering")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.copy",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","copyDependentFiles")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.generateAccessable",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","generateAccessible")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.strict",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","strict")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.enableWarnings",(actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","warn")=="true" ? true : false));

		nova.workspace.config.set("as3.compiler.additional",actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","additionalCompilerArguments"));

		// @NOTE Modules and Workers. Never used them, not sure how they get setup here.

		var buildTargets = actionscriptPropertiesXml.findNodesByName("buildTarget");
		// If there are build targets, then we are dealing with AIR, otherwise it's Flash
		if(buildTargets.length>0) {
			// Packaging, make separate tasks for it
			buildTargets.forEach((buildTarget) => {
				var taskName = "";
				var taskJson = this.baseTaskJson;

// console.log("buildTarget[@][platformId]: " + buildTarget["@"]["platformId"]);

				switch(buildTarget["@"]["platformId"]) {
					case "com.adobe.flexide.multiplatform.ios.platform": {
						taskName = "AIR - iOS";
						taskJson["extensionTemplate"] = "actionscript-ios";
						taskJson.extensionValues["as3.target"] = "ios";
						break;
					}
					case "com.qnx.flexide.multiplatform.qnx.platform": {
						taskName = "AIR - BlackBerry Tablet OS";
						taskJson["extensionTemplate"] = "actionscript-airmobile";
						taskJson.extensionValues["as3.target"] = "blackberry";
						console.log("BlackBerry not surpported. Not even sure I can download the SDK anymore...");
						break;
					}
					case "com.adobe.flexide.multiplatform.android.platform": {
						taskName = "AIR - Android";
						taskJson["extensionTemplate"] = "actionscript-android";
						taskJson.extensionValues["as3.target"] = "android";
						break;
					}
					case "default":
					default: {
						taskName = "AIR";
						taskJson["extensionTemplate"] = "actionscript-air";
						taskJson.extensionValues["as3.target"] = "default";
						break;
					}
				}

				if(taskJson!={}) {
					var airSettings = actionscriptPropertiesXml.findChildNodeByName(buildTarget["children"], "airSettings");
				//	consoleLogObject(airSettings);
					//console.log("airCertificatePath: " + airSettings["@"]["airCertificatePath"]);
					if(airSettings["@"]["airCertificatePath"]!="") {
						taskJson.extensionValues["as3.packaging.certificate"] = airSettings["@"]["airCertificatePath"];
					}
					//console.log("airTimestamp: " + airSettings["@"]["airTimestamp"]);
					if(airSettings["@"]["airTimestamp"]!="") {
						taskJson.extensionValues["as3.packaging.timestamp"] = airSettings["@"]["airTimestamp"];
					}

					// @NOTE Not sure what to do here...
					//console.log("newLaunchParams: " + airSettings["@"]["newLaunchParams"]);
					//console.log("modifiedLaunchParams: " + airSettings["@"]["modifiedLaunchParams"]);
					//console.log("newPackagingParams: " + airSettings["@"]["newPackagingParams"]);
					//console.log("modifiedPackagingParams: " + airSettings["@"]["modifiedPackagingParams"]);

					var airExcludes = actionscriptPropertiesXml.findChildNodeByName(airSettings["children"], "airExcludes");
					var excludedInPackage = []

					airExcludes["children"].forEach((excludes) => {
						//console.log(" ------- EXCLUDE > " + excludes["@"]["path"]);
						excludedInPackage.push(excludes["@"]["path"]);
					});
					if(excludedInPackage.length>0) {
						taskJson.extensionValues["as3.packaging.excludedFiles"] = excludedInPackage;
					}

					var anePaths = actionscriptPropertiesXml.findChildNodeByName(airSettings["children"], "anePaths");
					var anePathsInPackage = [];

				//	consoleLogObject(anePaths);
					anePaths["children"].forEach((anePath) => {
				//		consoleLogObject(anePath);
						//console.log(" +++++++ ANE PATH > " + anePath["@"]["path"]);
						anePathsInPackage.push(anePath["@"]["path"]);
					});
					if(anePathsInPackage.length>0) {
						taskJson.extensionValues["as3.packaging.anePaths"] = anePathsInPackage;
					}

					// Ensure Tasks folder is available and then write this Task!
					this.ensureTaskFolderIsAvailable();
					this.writeTaskFile(taskName, taskJson);

				}
			});
		} else {
			// Grab boilerplate for a Task
			var flashTaskJson = this.baseTaskJson;
			// Change the template to the Flash one
			flashTaskJson["extensionTemplate"] = "actionscript-flash";

			// See if there are any source file to exclude
			var sourceExcludes = [];
			actionscriptPropertiesXml.findNodesByName("exclude").forEach((excludeFile) => {
				sourceExcludes.push(excludeFile["@"]["path"]);
			});

			flashTaskJson.extensionValues["as3.packaging.excludedSourceFiles"] = sourceExcludes;

			// @TODO ? Do we tell the user there are source excludes. I can't figure how FB determines if it should include source or not
			//flashTaskJson.extensionValues["as3.packaging.includeSource"] = true;

			// Ensure Tasks folder is available and then write this Task!
			this.ensureTaskFolderIsAvailable();
			this.writeTaskFile("Flash", flashTaskJson);
		}

		// Add a value to keep track that we imported the project, so it doesn't keep asking everytime the project is opened
		nova.workspace.config.set("as3.project.importedFB","done");
	}

	/**
	 * Makes sure that we have  a Task folder so we can generate new tasks
	 */
	ensureTaskFolderIsAvailable() {
		if(nova.fs.access(nova.workspace.path + "/.nova/Tasks", nova.fs.F_OK | nova.fs.X_OK)===false) {
			nova.fs.mkdir(nova.workspace.path + "/.nova/Tasks/");
		}
	}

	/**
	 * Makes sure that we have  a Task folder so we can generate new tasks
	 */
	ensureFolderIsAvailable(folder) {
		if(nova.fs.access(folder, nova.fs.F_OK | nova.fs.X_OK)===false) {
			// console.log(" Making folder at " + folder + "!!!");
			nova.fs.mkdir(folder+"/");
		}
	}

	/**
	 * Writes JSON for a new Task
	 *
	 * @param {string} taskName - The name of the Task
	 * @param {Object} taskJson - The JSON object for the Task
	 */
	writeTaskFile(taskName, taskJson) {
		var taskFile = nova.fs.open(nova.workspace.path + "/.nova/Tasks/"+taskName+".json","w");
		taskFile.write(JSON.stringify(taskJson,null,2));
		taskFile.close();
	}

	/**
	 * Gets Android devices connected to the computer
	 *
	 * @returns {Promise} - With the resolve being an Array of devices
	 */
	getAndroidDevices() {
		console.log("getAndroidDevices() : ");
		return new Promise((resolve, reject) => {
			let devices = [];

			// Get the Android SDK and call ADB since it give more details about devices attached
			let androidSDKBase = nova.workspace.config.get("as3.sdk.android");
			if(!androidSDKBase) {
				androidSDKBase = "~/Library/Android/sdk/";
			}
			if(androidSDKBase!=null) {
				if(androidSDKBase.charAt(0)=="~") {
					androidSDKBase = nova.path.expanduser(androidSDKBase);
				}
			}

			// Call a process to get the output of `adb devices -l`
			getProcessResults(androidSDKBase + "/platform-tools/adb",["devices","-l"]).then((result) => {
				const results = result.stdout.split("\n");
				results.forEach((line) => {
					// Regex our output, data will come like:
					// 0123456789ABYX         device usb:#-1 product:panther model:Device_Name_Here device:panther transport_id:#
					// 0123456789CDWX         device usb:#-1 product:husky model:Other_Device_Name device:husky transport_id:#
					const match = line.match(/^(\S+).*model:([\w_]+).*transport_id:(\d+)/);
					if (match) {
						const [_, uuid, model, transportID] = match;
						devices.push({ uuid, model, transportID });
					}
				});
				/*
				// Debug output
				if(!devices.length) {
					console.log("getAndroidDevices No DEVICES!");
				} else {
					console.log("getAndroidDevices DEVICES! " + devices.length);
					devices.forEach((device) => console.log("device: " + device.uuid + " is a " + device.model));
				}
				*/
				resolve(devices);
			}).catch((error) => {
				console.error("getAndroidDevices: Error fetching Android devices", error);
				reject([]); // Reject the promise with the error
			});
		});
	}

	/**
	 * Gets iOS devices connected to the computer
	 *
	 * @returns {Promise} - With the resolve being an Array of devices
	 */
	getIOSDevices() {
		return new Promise((resolve, reject) => {
			let devices = [];

			// Get the Flex SDK base, since ADT will give details about the iOS devices attached
			const flexSDKBase = determineFlexSDKBase();
			if(flexSDKBase==null) {
				console.error("FlexSDK not set, cannot poll for devices without it!");
				reject([]);
			}

			// Call a process to get the output of `adt -devices -platform ios`
			getProcessResults(flexSDKBase + "/bin/adt", ["-devices","-platform","ios"]).then((result) => {
				if(result!=undefined) {
					const results = result.stdout.split("\n");
					results.forEach((line) => {
						// Regex our match, data will come like:
						// Handle	DeviceClass	DeviceUUID					DeviceName
						//   #	iPad    	12345678-0123456789ABCDEF	Actual Device Name
						const match = line.match(/^\s*(\d+)\s+(\S+)\s+([A-Fa-f0-9\-]+)\s+(.+)$/);
						if (match) {
							const [_, transportID, model, uuid, deviceName] = match;
							devices.push({ transportID, model, uuid, deviceName });
						}
					});
					/*
					// Debug output
					if(!devices.length) {
						console.log("getIOSDevices No DEVICES!");
					} else {
						console.log("getIOSDevices DEVICES! " + devices.length);
						devices.forEach((device) => console.log("device: " + device.uuid + " is an " + device.model));
					}
					*/
					resolve(devices);
				} else {
					reject([]);
				}
			}).catch((error) => {
				console.error("getIOSDevices: Error fetching iOS devices",error);
				reject([]);
			});
		});
	}

	/**
	 * Handles the Clean/Build/Run stuff from Nova's UI.
	 * @param {class} context - What's coming from the build options
	 */
	resolveTaskAction(context) {
		var data = context.data;
		var config = context.config;
		var action = context.action;

		var buildType = "air";
		if(data.type=="mobile") {
			buildType = "airmobile";
		}

		// console.log("as3.packaging.excludedFiles: " + config.get("as3.packaging.excludedFiles"));

		// Get the context.config so we can get the Task settings!
		var whatKind = config.get("actionscript3.request");

		var destDir = nova.workspace.config.get("as3.build.output");
		if(destDir=="") {
			destDir = nova.path.join(nova.workspace.path, "bin-debug");
		} else {
			/** @TODO Check if it starts with ~, or a "/", then don't merge with workspace! */
			destDir = nova.path.join(nova.workspace.path, destDir);
			//console.log("Using configed DEST DIR " + destDir);
		}
		//console.log("DEST DIR " + destDir);

		var mainApplicationPath =  nova.workspace.config.get("as3.application.mainApp");
		var isFlex = nova.workspace.config.get("as3.application.isFlex");
		var appXMLName = (isFlex ? mainApplicationPath.replace(".mxml","-app.xml") : mainApplicationPath.replace(".as","-app.xml"));

		// Use this to get setting from the extension or the workspace!
		var flexSDKBase = determineFlexSDKBase();

		if(action==Task.Build) {
			var mainSrcDir = nova.path.join(nova.workspace.path, nova.workspace.config.get("as3.build.source.main"));
			if(mainSrcDir=="") {
				mainSrcDir = nova.path.join(nova.workspace.path, "src");
			}

			var exportName = (isFlex ? mainApplicationPath.replace(".mxml",".swf") : mainApplicationPath.replace(".as",".swf"));

			var copyAssets = nova.workspace.config.get("as3.compiler.copy");

			var sourceDirs = nova.workspace.config.get("as3.build.source.additional");

			var libPaths = nova.workspace.config.get("as3.build.library.additional");

			var anePaths = nova.workspace.config.get("as3.build.anes");

			return this.build(buildType, copyAssets, mainSrcDir, mainApplicationPath, sourceDirs, libPaths, appXMLName, flexSDKBase, whatKind, destDir, exportName, false, anePaths, config);
		} else if(action==Task.Run) { //} && data.type=="actionscript") {
			// @TODO Check if the output files are there, otherwise prompt to build
			var profile = config.get("as3.task.profile");
			if(profile=="default") {
				// @TODO Find it in the XML
			}

			if(whatKind=="debug") {
				return this.debugRun(buildType, flexSDKBase, profile, destDir, appXMLName, config);
			} else {
				return this.run(buildType, flexSDKBase, profile, destDir, appXMLName, config)
			}
		} else if(action==Task.Clean) {
			return new TaskCommandAction("as3.clean", { args: [destDir] });
		}
	}
}
