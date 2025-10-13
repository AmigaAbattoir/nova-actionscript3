const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { showNotification, isWorkspace, getWorkspaceOrGlobalConfig, getProcessResults, saveAllFiles, consoleLogObject, resolveSymLink, getStringOfWorkspaceFile, getStringOfFile, ensureFolderIsAvailable, makeOrClearFolder, listFilesRecursively, getExec, quickChoicePalette } = require("./nova-utils.js");
const { determineFlexSDKBase, getAppXMLNameAndExport, getConfigsForBuild, getConfigsForPacking } = require("./config-utils.js");
const { determineProjectUUID, determineAneTempPath, resolveStatusCodeFromADT, convertAIRSDKToFlashPlayerVersion } = require("./as3-utils.js");
const { getCertificatePasswordInKeychain, setCertificatePasswordInKeychain, promptForPassword, getSessionCertificatePassword, setSessionCertificatePassword } = require("./certificate-utils.js");
const { getAIRSDKInfo } = require("./sdk-utils.js");

var fileExtensionsToExclude = [];
var fileNamesToExclude = [];

/**
 * Checks to see if this is a file that should be ignored
 * @param {string} fileName - The filename to check with the list of file that need to be excluded
 */
function shouldIgnoreFileName(fileName) {
	if(fileNamesToExclude.includes(fileName)) {
		return true;
	}
	if(fileExtensionsToExclude.some(ext => fileName.endsWith(ext))) {
		return true;
	}
	return false;
}

function displayANEsProjectUUIDError() {
	var uuidMessage = "Project UUID Missing\n\nPlease use the Import Flash Builder option in the menu,";
	if(nova.version[0]<10) {
		uuidMessage += "ensure that `uuidgen` is on your system's path, update to Nova 10+,"
	}
	uuidMessage += " or run from the menu `Check Project UUID` to ensure a project UUID is created. Once it's created, you can try again!";
	nova.workspace.showErrorMessage(uuidMessage);
}

/**
 * The Task Assistant that handles all the things for Task.
 */
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
				/** @NOTE Add temp dir or ANE folder too? */
			} catch(error) {
				result = false;
			}
		}
		return result;
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
				taskFileNamePromise = quickChoicePalette(tasks,placeholder).then((choice) => choice.value);
			}

			// Now that we have a task file name, let's try to get the config!
			taskFileNamePromise.then((taskFileName) => {
				//console.log("Task File Name: [[" + taskFileName + "]]");
				// If it's undefined, then the user escaped the palette
				if(taskFileName==undefined) {
					return;
				}

				// This will change later, based on the task's template type
				var projectType = "air";

				// If we have a task file name, then let's process it
				if(taskFileName!="") {
					// Since we have a name, let's set the last task
					nova.workspace.config.set("as3.packaging.lastReleaseBuilt",taskFileName);

					taskJson = JSON.parse(getStringOfWorkspaceFile("/.nova/Tasks/" + taskFileName));
					// console.log("-= TASK JSON: " + taskFileName + " =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
					// consoleLogObject(taskJson);
					// console.log("-= --------- =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
					try {
						if(taskJson["extensionTemplate"].startsWith("actionscript-")==false) {
							nova.workspace.showErrorMessage("Sorry, Export Release Build does not yet handle " + taskJson["extensionTemplate"] + "!");
							return;
						}
						taskConfig = taskJson["extensionValues"];
						switch(taskJson["extensionTemplate"]) {
							case "actionscript-ios":
							case "actionscript-android":
							case "actionscript-airmobile": {
								projectType="airmobile";
								break;
							}
							/*
							case "actionscript-flash": {
								projectType="flash";
								break;
							}
							*/
						}
					} catch(error) { }

					if(taskConfig==null) {
						nova.workspace.showErrorMessage("Could not parse Task, are you sure you created it with the ActionScript 3 extension?!");
						return;
					}
				}

				// Figure out the certificate to use when signing.
				var certificateLocation = nova.workspace.config.get("as3.packaging.certificate");
				// If there is no certificate for this, then we can't package!!
				if(certificateLocation==null) {
					nova.workspace.showErrorMessage("Your project and/or Tasks do not contain a Certificate which you need in order to package an export release.");
					return;
				}

				console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
				consoleLogObject(taskConfig);
				console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");

				// We need a project UUID which we use to save the certificate password in a later step, but let's check
				// first. It should generate one if possible, but on the unlikely event, we should abort.
				var getProjectUUID = determineProjectUUID();
				getProjectUUID.then((resolve) => { // Now that we have the UUID, let's try to make a build
					var projectUUID = resolve;
					/** @TODO Get a setting from the task maybe*/
					var releasePath = "bin-release-temp";

					// Setup build configuration override
					var configOverrides = {
						"releasePath": nova.path.join(nova.workspace.path, releasePath)
					};

					// If there's a custom SDK for the Task, set it!
					if(taskConfig["as3.compiler.sdk"] && taskConfig["as3.task.applicationFile"].trim()!="") {
						configOverrides["sdkBase"] = taskConfig["as3.compiler.sdk"];
					}

					// If we have a custom ANEs marked, let's also change the build config
					if(taskConfig["as3.packaging.customANEs"] && taskConfig["as3.packaging.customANEs"]==true) {
						configOverrides["anes"] =  taskConfig["as3.packaging.anes"];
						configOverrides["anesIgnoreError"] =  taskConfig["as3.ane.ignoreError"];
					}

					// What if we have a custom Application file? Let's change that and the export and descriptor file.
					if(taskConfig["as3.task.applicationFile"] && taskConfig["as3.task.applicationFile"].trim()!="") {
						let mainApplicationPath = taskConfig["as3.task.applicationFile"];
						configOverrides["mainApplicationPath"] = mainApplicationPath;
						const customApp = getAppXMLNameAndExport(mainApplicationPath);
						configOverrides["exportName"] = customApp.exportName;
						configOverrides["appXMLName"] = customApp.appXMLName;
					}

					var provisioningProfile;
					// If we are packaing for iOS, we want to make sure that the provisioning profile is set before attempting to build
					if(taskConfig["as3.target"]=="ios") {
						provisioningProfile = taskConfig["as3.packaging.provisioningFile"];
						if(provisioningProfile==undefined || provisioningProfile==null) {
							nova.workspace.showErrorMessage("When exporting a package for iOS, you must set a provisioningProfile in the Task!");
							return;
						}
					}

					this.build(projectType, "release", true, configOverrides).then((resolve) => {
						const configValues = getConfigsForPacking(taskConfig["as3.task.applicationFile"],true,configOverrides);
						let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
						let appXMLName = configValues.appXMLName;
						let doTimestamp= configValues.doTimestamp;
						let timestampURL= configValues.timestampURL;

						// Check if there is a custom name in the Task
						let packageName = configValues.packageName;
						if(taskConfig["as3.export.basename"] && taskConfig["as3.export.basename"].trim()!="") {
							packageName = taskConfig["as3.export.basename"];
							if(packageName.endsWith(".air")==false) {
								packageName += ".air";
							}
						}
						// Loop through the output, and copy things unless specified to exclude like the .actionScriptProperties
						let alsoIgnore = nova.workspace.config.get("as3.packaging.excludedFiles");
						// Check if the Task has custom content setting marked true and then use it says to use custom setting for it!
						if(taskConfig["as3.packaging.customContents"] && taskConfig["as3.packaging.customContents"]==true) {
							alsoIgnore = taskConfig["as3.packaging.excludedFiles"];
						}

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

						// If default (desktop), then for Mac, certain icons aren't set, then it will be a default empty icon
						if(taskConfig["as3.target"]=="default") {
							let mainSrcDir = configValues.mainSrcDir;
							let appXMLName = configValues.appXMLName;
							let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);
							let appXML = getStringOfFile(appXMLLocation);
							if(appXML!=null) {
								// Read the App XML and make sure the Namespace is the same version!
								var check1 = new xmlToJson.ns3x2j(appXML).findNodesByName("image16x16");
								var check2 = new xmlToJson.ns3x2j(appXML).findNodesByName("image32x32");
								var check3 = new xmlToJson.ns3x2j(appXML).findNodesByName("image48x48");
								var check4 = new xmlToJson.ns3x2j(appXML).findNodesByName("image128x128");

								if(check1.length==0 || check2.length==0 || check3.length==0 || check4.length==0) {
									showNotification("Default Icon for app may be used","If you do not have <image16x16>, <image32x32>, <image48x48>, and <image128x128> in your app descriptor, you may get an empty, default Mac icon instead","Oh no!","bad-icon");
								}
							}
						}

						// Check if the Task has a custom certificate set for it!
						if(taskConfig["as3.packaging.certificate"] && taskConfig["as3.packaging.certificate"]!="") {
							certificateLocation = taskConfig["as3.packaging.certificate"];
						}
						var certificateName = certificateLocation.split("/").pop();

						// Check if we have the password stored in the user's Keychain
						var passwordCheck = getCertificatePasswordInKeychain(certificateLocation);

						// If not, then check if we saved for the session
						if(passwordCheck=="") {
							passwordCheck = getSessionCertificatePassword(certificateLocation);
						}

						// This will be a promise, I promise!
						var passwordGet;

						// If password is empty, let's try to get it.
						if(passwordCheck=="") {
							// Need to get password
							passwordGet = promptForPassword(certificateLocation,false).then((password) => {
								if(password!=undefined) {
									// Return a new Promise with the results of the how to save window
									return new Promise((resolve) => {
										// Ask to save, use one time, or for session?
										let saveButtons = ["This time","Save to Keychain","Use this session","Abort"];
										nova.workspace.showActionPanel("Password accecpted. How would you like to use it? You can use this one time, or choose to save until you quit Nova, or store it in your Keychain.",
										{ buttons: saveButtons }, (saveType) => {
											resolve({ saveType: saveButtons[saveType], password: password });
										});

									});
								}
							}).catch((error) => {
								passwordGet = Promise.resolve({ saveType: "Abort", password: "" });
							});
						} else {
							// We have a password stored already, so we can say this time..,, fulfill the promise
							passwordGet = Promise.resolve( { saveType: "This time", password: passwordCheck });
						}

						passwordGet.then((reply) => {
							var password;
							switch(reply.saveType) {
								case "This time": {
									password = reply.password;
									break;
								}
								case "Save to Keychain": {
									password = reply.password;
									setCertificatePasswordInKeychain(certificateLocation,password);
									break;
								}
								case "Use this session": {
									password = reply.password;
									setSessionCertificatePassword(certificateLocation,password);
									// @TODO Set context variable to track password.
									break;
								}
								case "Abort": {
									// @TODO Ask to remove build?
									return;
									break;
								}
							}

							var command = flexSDKBase + "/bin/adt";
							var args = [];
							var env = {};

							if(taskConfig["as3.packaging.type"]=="intermediate") {
								args.push("-prepare");
								packageName = packageName.replace(/\.air$/, ".airi");
							} else {
								args.push("-package");

								// Only for Android building
								if(taskConfig["as3.target"]=="android") {
									// Check if we want to disable AIR Flair. I know I do!
									var noAndroidAirFlair = taskConfig["as3.deployment.noFlair"];
									if(noAndroidAirFlair!=undefined) {
										// console.log("AIR FLAIR: " + noAndroidAirFlair);
									} else {
										noAndroidAirFlair = false;
										// console.log("AIR FLAIR undefined, so now it'll be false!");
									}

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
								}else if(taskConfig["as3.target"]=="ios") {
									args.push("-target");
									args.push("ipa-debug");

									packageName = packageName.replace(/\.air$/, ".ipa");
								}

								args.push("-storetype");
								args.push("pkcs12");

								args.push("-keystore");
								args.push(certificateLocation);

								args.push("-storepass");
								args.push(password);

								if(taskConfig["as3.target"]=="ios") {
									args.push("-provisioning-profile");
									args.push(provisioningProfile);
								}

								if(doTimestamp==false) {
									args.push("-tsa");
									args.push("none");
								} else {
									if(timestampURL!=null && timestampURL!="") {
										args.push("-tsa");
										args.push(timestampURL);
									}
								}

								// In order to build a native app installer or an app with captive runtime, the `-target`
								// needs to be after the SIGNING_OPTIONS or it will fails saying "Native signing not supported on mac"
								if(taskConfig["as3.target"]!="android" && taskConfig["as3.target"]!="ios") {
									switch(taskConfig["as3.packaging.type"]) {
										case "signed-native": {
											nova.workspace.showErrorMessage("Signed native installers not supported (yet)!");
											args.push("-target");
											args.push("native");

											packageName = packageName.replace(/\.air$/, ".dmg");
											break;
										}
										case "signed-captive": {
											args.push("-target");
											args.push("bundle");

											packageName = packageName.replace(/\.air$/, ".app");
											break;
										}
										default: {
											break;
										}
									}
								}
							}

							// Set location and AIR (or APK, AAB, IPA) Package name
							let exportLocation = nova.workspace.path;
							if(taskConfig["as3.export.folder"]) {
								exportLocation = nova.path.join(nova.workspace.path, taskConfig["as3.export.folder"]);
								if(ensureFolderIsAvailable(exportLocation)==false) {
									nova.workspace.showErrorMessage("Export Release Build failed!\n\nCannot export to folder "+exportLocation);
								}
							}
							let outputFile = nova.path.join(exportLocation, packageName);
							args.push(outputFile);

							// Descriptor
							args.push(appXMLName);

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

							// For Android, add the platform SDK
							// @TODO Check which version of the SDK this became an option
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

							var anes = taskConfig["as3.packaging.anes"];

							// If there are ANEs, then we need to include the "ane" folder we made with the extracted
							// ones that to the destination dir.
							if (nova.inDevMode()) {
								console.log("anes: " + JSON.stringify(anes));
							}

							if(anes && anes.length>0) {
								var aneTempPath = determineAneTempPath("release-");
								if(aneTempPath==null) {
									displayANEsProjectUUIDError();
									return null;
								}
								args.push("-extdir");
								args.push(aneTempPath+"-packed");
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
								if (nova.inDevMode()) { console.log("STDOUT: " + line); }
								stdout += line;
							});
							process.onStderr(function(line) {
								if (nova.inDevMode()) { console.log("STDERR: " + line); }
								stderr += line;
							});
							process.start();
							process.onDidExit((status) => {
								if (nova.inDevMode()) {
									consoleLogObject(status);
								}
								if(status==0) {
									if(taskConfig["as3.export.deleteAfterSuccess"]!==false) {
										nova.fs.rmdir(nova.path.join(nova.workspace.path, releasePath));
										// If there are ANEs, clean them up too!
										if(anes && anes.length>0) {
											nova.fs.rmdir(aneTempPath);
											nova.fs.rmdir(aneTempPath+"-packed");
										}
									}
									nova.workspace.showActionPanel("Export Package Successful!", { buttons: [ "Okay", "Show in Finder"] },
										(result) => {
											if(result==1) {
												nova.fs.reveal(nova.path.join(exportLocation, packageName));
											}
										}
									);
								} else {
									var result = resolveStatusCodeFromADT(status);
									var message = result.message;
									if (nova.inDevMode()) {
										console.log("Final RESULT: ");
										console.log("STDOUT: " + stdout);
										console.log("STDERR: " + stderr);
									}
									nova.workspace.showErrorMessage("Export Package Failed" + "\n\n" + message + "\n\n" + stderr);
								}
							})
						},(reject) => {
							// console.log("passwordGet.then((reject): ");
							nova.workspace.showErrorMessage("Password failed!\n\n" + reject);
						});
					}, (reject) => {
						// To make this a little neater, remove the workspace's path from the stderr messages
						var message = reject.stderr.replaceAll(nova.workspace.path,"");
						nova.workspace.showErrorMessage("Export Release Build failed!\n\nOne or more errors were found while trying to build the release version. Unable to export.\n\n" + message);
					});
				},
				(reject) => {
					displayANEsProjectUUIDError();
				});
			});
		}
	}

	/**
	 * Used to build a library.
	 *
	 * @param {Array} classEntries - The list of all the classes that should be included in the build
	 * @param {Array} resourceDestPathEntries - The resources that should be copied into this library
	 * @param {Array} resourceSourcePathEntries - The resource's source files locations. There should be the same amount of `resourceDestPathEntries` and `resourceSourcePathEntries`!
	 * @param {Array} namespaceManifestEntryManifests - The locations of the manifest XMLs
	 * @param {Array} namespaceManifestEntryNamespaces - The namespaced used for these manifest XMLs. There needs to be the same amount of `namespaceManifestEntryManifests` and `namespaceManifestEntryNamespaces`!
	 */
	buildLibrary(classEntries, resourceDestPathEntries, resourceSourcePathEntries, namespaceManifestEntryManifests, namespaceManifestEntryNamespaces) {
		const configValues = getConfigsForBuild();

		/** @TODO / @NOTE. Looks like FB stores the resources and namespace stuff relative to the main source folder!
		Should this code be refactored to do the same?
		Should it CD into the main source dir, and then have everything relative to that, and then check the assets to see
		if we need to remove the main source dir content?

		Do we need to have an option to include all classes? and then a function to generate

		*/

		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		if(flexSDKBase==null) {
			nova.workspace.showErrorMessage("Please configure the Flex SDK base, which is required for building this type of project");
			return null;
		}
		let destDir = configValues.destDir;
		let mainClass = configValues.mainClass;
		let mainSrcDir = configValues.mainSrcDir;
		let frameworkLinkage = configValues.linkage;
		let componentSet = configValues.componentSet;

		var command = flexSDKBase + "/bin/compc";
		var args = new Array();
		/*
		if(runMode=="debug") {
			args.push("--debug=true");
		}
		*/
		args.push("-source-path");
		args.push(mainSrcDir);

		args.push("-output");
		args.push(destDir + "/" + mainClass + ".swc");

		/// If merging, then we need to do this:!
		if(frameworkLinkage=="merged") {
			args.push("-runtime-shared-library-path=");
			args.push("-static-link-runtime-shared-libraries=false");
		}

		// Figure playerglobal.sec version and location
		let currentAIRSDKVersion = nova.workspace.context.get("currentAIRSDKVersion");
		let flashVersion = convertAIRSDKToFlashPlayerVersion(currentAIRSDKVersion);
		// consoleLogObject(flashVersion);
		var playerGlobal = "player/" + flashVersion.major + "." + flashVersion.minor + "/playerglobal";

		// Push the PlayerGlobal to external library
		args.push("-external-library-path=" + flexSDKBase + "/frameworks/libs/" + playerGlobal + ".swc" );

		let compLibs = [];
		// Depending on what component sets to include, we need to add some library's to the compilation.
		switch(componentSet) {
			case "both": {
				compLibs = [ "framework", "textLayout", "spark", "sparkskins", "rpc", "charts", "spark_dmv", "mx/mx", "osmf", "advancedgrids", "authoringsupport", "core", "flash-integration" ];
				break;
			}
			case "spark": {
				compLibs = [ "framework", "textLayout", "spark", "sparkskins", "rpc", "charts", "authoringsupport", "osmf", "flash-integration" ];
				break;
			}
			case "mx": {
				compLibs = [ "framework", "textLayout", "authoringsupport", "flash-integration", "rpc", "mx/mx", "charts", "osmf", "advancedgrids"];
				break;
			}
			case "mobile": {
				compLibs = [ "airglobal", "authoringsupport", "charts", "core", "flash-integration", "framework", "osmf", "rpc", "spark", "textlayout", "mobilecomponents", "servicemonitor" ];
				break;
			}
		}

		// If there are any Components that need to be added, then we should do that.
		if(compLibs.length>0) {
			// So, building from FB with `-dump-config` show these should be "internal", but if we make them `-external-library-path`, they will compile without warning.
			// Not sure what would be right here...
			let libPathString = "-library-path=" + compLibs.map(lib => `${flexSDKBase}/frameworks/libs/${lib}.swc`).join(",") + "," + flexSDKBase + "/frameworks/locale/{locale}";
			args.push(libPathString);
		}

		// @TODO If the preference is slected, we should scan the code base and generate the list...
		// Add Class entries, if there are any
		if(classEntries) {
			args.push("-include-classes");
			classEntries.forEach((classEntry) => { args.push(classEntry); });
		}

		let sameCount;
		// Add additional resources to pack with the library
		if(resourceDestPathEntries && resourceSourcePathEntries) {
			sameCount = (resourceDestPathEntries.length == resourceSourcePathEntries.length ? true : false);
			if(sameCount && resourceDestPathEntries.length>0) {
				for(let i = 0; i<resourceDestPathEntries.length; i++) {
					args.push("-include-file");
					args.push(resourceDestPathEntries[i]);
					// @NOTE should this check if this is on the main source before appending??
					args.push(mainSrcDir + "/" + resourceSourcePathEntries[i]);
				}
			} else if(sameCount==false) {
				nova.workspace.showErrorMessage("Sorry, but the amount of resourceDestPathEntries and resourceSourcePathEntries do not match. Please make sure these align in the preferences!");
				return null;
			}
		}

		// Add Namespace
		let namespaces = [];
		if(namespaceManifestEntryManifests && namespaceManifestEntryNamespaces) {
			sameCount = (namespaceManifestEntryManifests.length == namespaceManifestEntryNamespaces.length ? true : false);
			if(sameCount && namespaceManifestEntryManifests.length>0) {
				for(let i = 0; i<resourceDestPathEntries.length; i++) {
					args.push("-namespace");
					args.push(namespaceManifestEntryNamespaces[i]);
					// @NOTE should this check if this is on the main source before appending??
					args.push(mainSrcDir + "/" + namespaceManifestEntryManifests[i]);

					// We need to keep track of these for later
					//namespaces.push(namespaceManifestEntryNamespaces[i]);
				}

				// If we are adding Flex components to the library, we need to include their namesapces!
				if(componentSet!="none") {
					args.push("-namespace");
					args.push("http://ns.adobe.com/mxml/2009");
					args.push(flexSDKBase + "/frameworks/" + "mxml-2009-manifest.xml");

					args.push("-namespace");
					args.push("library://ns.adobe.com/flex/spark");
					args.push(flexSDKBase + "/frameworks/" + "spark-manifest.xml");

					// Do not add these namespaces if making a Mobile library
					if(componentSet!="mobile") {
						args.push("-namespace");
						args.push("library://ns.adobe.com/flex/mx");
						args.push(flexSDKBase + "/frameworks/" + "mx-manifest.xml");

						args.push("-namespace");
						args.push("http://www.adobe.com/2006/mxml");
						args.push(flexSDKBase + "/frameworks/" + "mxml-manifest.xml");
					}
				}
/*
				// Now, tell it to include the namespaces! Not needed??
				// args.push("-include-namespaces");
				// namespaces.forEach((namespace) => { args.push(namespace) });
*/
				// Other options to match Flash Builder while testing...
				// args.push("-target-player=11.1.0");
				// args.push("-compatibility-version=3.6");
				args.push("-compiler.show-shadowed-device-font-warnings=false");
				args.push("-verify-digests=false");
				args.push("-use-network=true");
				args.push("-compiler.accessible=false");
				/*
				*/
			} else if(sameCount==false) {
				nova.workspace.showErrorMessage("Sorry, but the amount of namespaceManifestEntryManifests and namespaceManifestEntryNamespaces do not match. Please make sure these align in the preferences!");
				return null;
			}
		}

		if (nova.inDevMode()) {
			console.log(" *** Attempting to Run COMPC with [[" + command + "]] ARG: \n");
			consoleLogObject(args);
		}
		return new TaskProcessAction(command, { args: args });
	}

	/**
	 * Checks if any of the sourse files have been modified since they were copied to the output folder
	 * @NOTE Was devised to try and only build if files changed, but I don't think we can work that into Nova
	 * @param {string} destDir - The source files
	 * @param {string} exportName - The exported SWF that will be the reference of the time when it was built
	 */
	checkIfModifiedAfterBuild(destDir, exportName) {
		console.log("OUTPUT FILE is [[[[" + destDir + "/" + exportName + "]]]]]");
		console.log("STAT: " + nova.fs.stat(destDir + "/" + exportName));

		/** @TODO Have to go through all the source folders and check */
		if(nova.fs.stat(destDir + "/" + exportName)!=undefined) {
			console.log("OUTPUT FILE EXISTS...   CHECK IF ANY FILE HAS CHANGED SINCE LAST BUILD....");

			fileNamesToExclude = [ ".DS_Store", ".git", ".svn" ];
			fileExtensionsToExclude = [];
			// consoleLogObject(fileNamesToExclude);
			// consoleLogObject(fileExtensionsToExclude);

			function anyFileModifiedAfter(referenceFilePath, folderPath) {
				const referenceFile = nova.fs.stat(referenceFilePath);
				if (!referenceFile) {
					console.error("Reference file not found:", referenceFilePath);
					return false;
				}

				const referenceTime = referenceFile.mtime.getTime();

				// Helper to recursively check files in a folder
				function checkFolderRecursive(path) {
					const entries = nova.fs.listdir(path);

					for (const entry of entries) {
						const fullPath = nova.path.join(path, entry);
						const stat = nova.fs.stat(fullPath);

						if (!stat) continue;

						if(shouldIgnoreFileName(entry)) {
							// console.log("  ><><>< IGNORING " + entry);
							continue;
						}
						// console.log("  ><><>< CHECKING " + entry);

						if (stat.isDirectory()) {
							if (checkFolderRecursive(fullPath)) {
								return true;
							}
						} else {
							if (stat.mtime.getTime() > referenceTime) {
								// console.log(`Modified file found: ${fullPath}`);
								return true;
							}
						}
					}
					return false;
				}

				return checkFolderRecursive(folderPath);
			}

			// Setup files to ignore when checking:
			const wasModified = anyFileModifiedAfter(
				nova.path.join(destDir + "/" + exportName),
				nova.path.join(nova.workspace.path, "src")
			);

			if (wasModified) {
				console.log(" !#! TRUE, At least one file was modified after the timestamp.");
				return true;
			} else {
				console.log(" !#! FALSE, No files have changed since the last build.");
				return false;
				return new TaskProcessAction("/usr/bin/true");
			}
		} else {
			console.log(" !#! TRUE, Hey, there's no output, so there is a difference");
			return true;
		}
		console.log(" !#! Don't think we will get to here....");
		return false;
	}

	/**
	 * Helps read through the descriptor XML to see what type of profile to use
	 *
	 * @param {Object} config - The config from the build/run
	 * @param {string} projectType - What kind of project are we building
	 * @param {string} appXMLLocation - The location of the descriptor file
	 * @returns {string} - The type of profile to use (desktop|extendedDesktop|mobileDevice|extendedMobileDevice)
	 */
	getProfileType(config, projectType, appXMLLocation) {
		var profileType = config["as3.task.profile"];
		if(profileType===undefined || profileType=="default") {
			try {
				let appXML = getStringOfFile(appXMLLocation);
				if(appXML!=null) {
					// Read the App XML and make sure the Namespace is the same version!
					let supportedProfile =  new xmlToJson.ns3x2j(appXML).findNodesByName("supportedProfiles");
					profileType = supportedProfile[0].textContent.split(" ")[0];
				}
			}catch(error) {
				// If there's an error, we'll figure it out later.
				if (nova.inDevMode()) {
					console.log("There was an error trying to read the app-xml for which profile to user: " + error);
				}
			}
		}

		// If we still don't have a profile, then we will assume which one to use!
		if(profileType===undefined || profileType=="default") {
			if(projectType=="airmobile") {
				profileType = "mobileDevice";
			} else {
				profileType = "desktop";
			}
		}

		return profileType;
	}

	/**
	 * Parses the device to simulate's to get the screensize for the simulator that is requested
	 * @param {string} screenSize - The formatted simulator device from the list of devices in the Task
	 * @returns {string} - A screen size that ADL will understand, ###x###:###x### format
	 */
	getFormattedScreenSize(screenSize) {
		if(screenSize==null || screenSize=="none") {
			nova.workspace.showErrorMessage("Please edit the Task to select a Desktop Device to use for the screen size of the simulator!");
			return false;
		} else {
			let check = screenSize.match(/([0-9]+ x [0-9]+:[0-9]+ x [0-9]+)/);
			if(check!=null) {
				screenSize = check[1];
			}
			screenSize = screenSize.replace(/^[^-]*-\s*/, '').replace(/\s+/g, '');
		}
		return screenSize;
	}

	/**
	 * Parses the device to simulate's to get the DPI for the simulator that is requested
	 * @param {string} screenSize - The formatted simulator device from the list of devices in the Task
	 * @returns {number} - The DPI as a number. If the Task is not set, or is from an old version of the extension, 0 is returned.
	 */
	getFormattedScreenDPI(screenSize) {
		let dpi = "0";
		if(screenSize!=null && screenSize!="none") {
			let check = screenSize.match(/@ ([0-9]+)DPI/);
			if(check!=null) {
				dpi = check[1];
			}
		}
		return parseInt(dpi);
	}

	/**
	 * Builds the SWF for the project
	 * @param {string} projectType - Which type of build, "air|airmobile|flex"
	 * @param {string} runMode - What kind of build, either `release`|`debug`
	 * @param {boolean} packageAfterBuild - If true, we are going to return the process of building
	 * @param {Object} configOverrides - A object of variables to override
	 */
	build(projectType, runMode, packageAfterBuild = false, configOverrides = {}, returnAsProcess = false) {
		const configValues = getConfigsForBuild(true, configOverrides);

		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		if(flexSDKBase==null) {
			nova.workspace.showErrorMessage("Please configure the Flex SDK base, which is required for building this type of project");
			return null;
		}

		// console.log(" ||| build() configOverrides: ");
		// consoleLogObject(configOverrides);
		// console.log(" ||| build() configOverrides: ");

		let destDir = configValues.destDir;
		let mainApplicationPath =  configValues.mainApplicationPath;
		let isFlex = configValues.isFlex;
		let appXMLName = configValues.appXMLName;
		let mainClass = configValues.mainClass;
		let mainSrcDir = configValues.mainSrcDir;
		let exportName = configValues.exportName;
		let copyAssets = configValues.copyAssets;
		let sourceDirs = configValues.sourceDirs;
		let libPaths = configValues.libPaths;
		let anes = configValues.anes;
		let compilerAdditional = configValues.compilerAdditional;

		// console.log("destDir = " + configValues.destDir);
		// console.log("mainApplicationPath =  " + configValues.mainApplicationPath);
		// console.log("isFlex = " + configValues.isFlex);
		// console.log("appXMLName = " + configValues.appXMLName);
		// console.log("mainClass = " + configValues.mainClass);
		// console.log("mainSrcDir = " + configValues.mainSrcDir);
		// console.log("exportName = " + configValues.exportName);
		// console.log("copyAssets = " + configValues.copyAssets);
		// console.log("sourceDirs = " + configValues.sourceDirs);
		// console.log("libPaths = " + configValues.libPaths);
		// console.log("compilerAdditional = " + configValues.compilerAdditional);

		// Check if we are building a Flash project or an AIR one now
		if(projectType=="flash") {
			// If we are asked to build the HTML Wrapper, there's a bunch of stuff we need to do
			if(nova.workspace.config.get("as3.flash.generateHTML")) {
				// Read the application file and look for the [SWF()] block for info.
				let metadata = {};

				// Load main class, and get any SWF Metadata
				var mainAppFile = getStringOfFile(nova.path.join(mainSrcDir,mainApplicationPath));
				if(mainAppFile==null) {
					nova.workspace.showErrorMessage("There was an issue reading the main application file \"" + nova.path.join(mainSrcDir,mainApplicationPath) + "\". Please check the file, making sure it's not empty and there are permissions to read it");
					return;
				}

				// Regex to extract [SWF(...)]
				const swfRegex = /\[SWF\((.*?)\)\]/;
				const match = mainAppFile.match(swfRegex);

				// If there is a match, then we may have some useful SWF metadata
				if (match) {
					const metadataString = match[1]; // Get content inside [SWF(...)]

					// Regex to extract key-value pairs (e.g., width="800")
					const keyValueRegex = /(\w+)="(.*?)"/g;

					let keyValueMatch;
					// Make a object with keys that have the different values so we can grab them later
					while ((keyValueMatch = keyValueRegex.exec(metadataString)) !== null) {
						const key = keyValueMatch[1];
						const value = keyValueMatch[2];
						metadata[key] = value;
					}
				}

				// Set the variables in the index.template.html from any SWF metadata we may have
				let swf_width = metadata?.width || "550";
				let swf_height = metadata?.height || "400";
				let swf_bgcolor = metadata?.backgroundColor || "#FFFFFF";
				let swf_title = metadata?.pageTitle || mainClass;

				// Figure out the Flash Player version
				let swf_version_major = 0;
				let swf_version_minor = 0;
				let swf_version_revision = 0;

				// If they selected to use a specified version, let's just grab the values from those configs
				if(nova.workspace.config.get("as3.flash.options")=="specified") {
					swf_version_major = nova.workspace.config.get("as3.flash.minimum.major");
					swf_version_minor = nova.workspace.config.get("as3.flash.minimum.minor");
					swf_version_revision = nova.workspace.config.get("as3.flash.minimum.revision");
				} else {
					let currentAIRSDKVersion = nova.workspace.context.get("currentAIRSDKVersion");
					let flashVersion = convertAIRSDKToFlashPlayerVersion(currentAIRSDKVersion);
					swf_version_major = flashVersion.major;
					swf_version_minor = flashVersion.minor;
					// Revision always is 0
				}

				// Actually, this might be specified in AIRSDK/ide/flashbuilder/flashbuilder-config.xml (at least on Mac, didn't see it on the Windows one I had)
				let swf_expressInstallSwf = "expressInstall.swf";

				// If we want to use the navigation history, then we need to make this a -- to make the template as an end comment
				let swf_useBrowserHistory = nova.workspace.config.get("as3.flash.navigation") ? "--" : "";

				let swf_application = mainClass;
				let swf_swf = exportName.replace(".swf","");

				ensureFolderIsAvailable(destDir);

				// Replace the variables in the template
				let htmlTemplateFile = getStringOfWorkspaceFile("html-template/index.template.html");
				let newHtml = htmlTemplateFile.replace(/\${(.*?)}/g, (_, variable) => {
					// Try to replace with variable, otherwise, just return empty string
					try {
						return eval("swf_"+variable);
					}catch(error) {
						return "";
					}
				});

				// Create the html page based on the template
				try {
					var newHtmlFile = nova.fs.open(destDir + "/" + swf_title + ".html", "w");
					newHtmlFile.write(newHtml);
					newHtmlFile.close();
				} catch(error) {
					//if(lineCount==0) {
						nova.workspace.showErrorMessage("Error writing HTML file at " + newHtmlFile + ". Please check it's content that it is valid.");
						console.log("*** ERROR: Writing HTML file! error: ",error);
						consoleLogObject(error);
						return null;
					//}
				}

				// Copy the other files in html-template (except index.template.html!)
				fileNamesToExclude = [ "index.template.html" ];
				fileExtensionsToExclude = [];
				this.copyAssetsOf(nova.workspace.path+"/html-template", destDir, false).then(() => {
					if (nova.inDevMode()) {
						console.log("All assets copied successfully.");
					}
				}).catch(error => {
					nova.workspace.showErrorMessage("Error during asset copying: " + error);
					if (nova.inDevMode()) {
						console.error("Error during asset copying:", error);
					}
					return null;
				});
			}
		}

		// Both Flash and AIR projects need to copy assets if they are set to
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

					// Ensure we get the full path of the dest dir too!
					if (destDir.charAt(0) == "~") {
						destDir = nova.path.expanduser(destDir);
					} else if (destDir.charAt(0) != "/") {
						destDir = nova.path.join(nova.workspace.path, destDir);
					}
					ensureFolderIsAvailable(destDir);

					// console.log(`Starting to copy assets from [[${copyDir}]] to [[${destDir}]]`);
					return this.copyAssetsOf(copyDir, destDir, packageAfterBuild); // Return the Promise
				});

				Promise.all(copyPromises).then(() => {
					if (nova.inDevMode()) {
						console.log("All assets copied successfully.");
					}
				})
				.catch(error => {
					nova.workspace.showErrorMessage("Error during asset copying: " + error);
					if (nova.inDevMode()) {
						console.error("Error during asset copying:", error);
					}
					return null;
				});
			}
		}

		// Do this for AIR projects!
		if(projectType!="flash") {
			// This loads the app descriptor file and check the version to match the AIR SDK.
			// FlashBuilder would modify the -app.xml with updated variables, so we will make a copy of the file,
			// changing what FB would have (and possible VSCode for AS3MXML).  Otherwise, this will write a copy.
			let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);
			let appXML = getStringOfFile(appXMLLocation);
			if(appXML!=null) {
				// Read the App XML and make sure the Namespace is the same version!
				let appXMLNS =  new xmlToJson.ns3x2j(appXML).getAttributeFromNodeByName("application","xmlns");
				let appVersion = appXMLNS.split("/").pop();
				let airSDKInfo = getAIRSDKInfo(flexSDKBase);
				let currentAIRSDKVersion = airSDKInfo.version;
				let additionalNote = "";

				// Prior to AIR 3, just <version> was good enough
				if(parseInt(appVersion)<4) {
					let hasVersionNumber = new xmlToJson.ns3x2j(appXML).findNodesByName("versionNumber");
					// If there's no version number tag, then warn the user
					if(hasVersionNumber=="") {
						additionalNote = "\n\nYou will also need to add a <versionNumber> to the descriptor.\n";
					}
				}

				if(appVersion!=currentAIRSDKVersion) {
					nova.workspace.showErrorMessage("Your app descriptor is looking for SDK Version " + appVersion +" but the current AIR SDK is version " + currentAIRSDKVersion + ". " + additionalNote + "Please correct this so that you can build it.");
					return null;
				}
			} else {
				nova.workspace.showErrorMessage("Error opening app descriptor file at " + appXMLLocation);
				return null;
			}

			// Replace content that the IDEs were supposed to and then write the app.xml to the output folder
			try {
				var newAppXML = appXML.replace(/\[This value will be overwritten by .*? app.xml\]/,exportName);         // Change's Flex/Flash Builder's placeholder
 				newAppXML = newAppXML.replace(/\[Path to content will be replaced by Visual Studio Code\]/,exportName); // Just incase you used AS3MXML wiki
				var newAppXMLFile = nova.fs.open(destDir + "/" + appXMLName, "w");
				newAppXMLFile.write(newAppXML);
				newAppXMLFile.close();
			} catch(error) {
				//if(lineCount==0) {
					nova.workspace.showErrorMessage("Error handling app descriptor at " + newAppXMLFile + ". Please check it's content that it is valid.");
					console.log("*** ERROR: APP XML file! error: ",error);
					consoleLogObject(error);
					return null;
				//}
			}
		}

		// Let's compile this thing!!
		var command = flexSDKBase + "/bin/mxmlc";
		var args = new Array();
		/*
		if(runMode=="debug") {
			args.push("--debug=true");
		}
		*/
		args.push("--debug=true");

		args.push("--warnings=true");

		if(projectType=="flash") {
			args.push("+configname=flex");
		} else if(projectType=="airmobile") {
			args.push("+configname=airmobile");
		} else {
			args.push("+configname=air");
		}

		// Push where the final SWF will be outputted
		args.push("--output=" + destDir + "/" + exportName);

		// Add base, just in case there are Embeds that look for stuff here using relative locations
		//args.push("--source-path=./");

		// Push args for the source-paths!
		if(sourceDirs) {
			sourceDirs.forEach((sourceDir) => { args.push("--source-path+=" + sourceDir); });
		}

		// This too should be from settings
		if(libPaths) {
			libPaths.forEach((libPath) => { args.push("--library-path+=" + libPath); });
		}

		if(projectType!="flash") {
			// If we have ANEs, we will need to unzip them to a folder so that ADL can run and point to those
			// ANEs so we can run on desktop. But, if it's building for packing, ADT will incorporate that into
			// the package for us!
			if(anes && anes.length>0) {
				var anePrefix = (packageAfterBuild ? "release-" : "");
				var aneTempPath = determineAneTempPath(anePrefix);
				if(aneTempPath==null) {
					displayANEsProjectUUIDError();
					return null;
				}
				var extdir = aneTempPath;

				// Make folder for unzipped ANEs when building
				if(makeOrClearFolder(extdir)==false) {
					return null;
				};
				// Make folder for packed ANEs when building.
				if(makeOrClearFolder(extdir+"-packed")==false) {
					return null;
				}

				anes.forEach((ane) => {
					args.push("--external-library-path+=" + ane);
					// Needed?
					//args.push("--library-path+=" + ane);
					//if(packageAfterBuild==false) {
						var aneDest = ane.substring(ane.lastIndexOf("/"),ane.length);
						try {
							// Copy ANE to temp folder so we can reference to when using ADL to run
							nova.fs.copy(nova.workspace.path+"/"+ane,extdir + "-packed/"+ane.split('/').pop());

							// Unzip ANE to a temp folder so we can reference
							nova.fs.mkdir(extdir + aneDest);
							var unzip = getProcessResults("/usr/bin/unzip",[ ane, "-d", extdir + aneDest], nova.workspace.path );
							unzip.then((resolve) => {
								// console.log("Unzip successful?!");
							},(reject) => {
								nova.workspace.showErrorMessage("Failed while trying to unzip ANE " + ane + " to temp folder.");
								console.log("Unzip failed");
								return null;
							});
						} catch(error) {
							nova.workspace.showErrorMessage("Failed to unzip ANE " + ane + " to temp folder.");
							console.log("*** ERROR: Couldn't unzip ANE for test runs ***",error);
							return null;
						}
					//}
				});
			}
		}

		// Forcing halo (should/could be replace with theme stuff eventually)
		if(nova.workspace.config.get("as3.themes.forceHalo")==true) {
			args.push("--theme=" + flexSDKBase + "/frameworks/themes/Halo/halo.swc");
		}

		// Additional compiler arguments
		if(compilerAdditional!=null) {
			/** @NOTE Needs work on parsing the additional args.
				Should really parse to make sure that there are no spaces or dash spaces
				Or make sure there's a quote around it if there's paths, or maybe just a
				space after an equal sign.
			*/
			var additional = compilerAdditional;
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

		if(packageAfterBuild || returnAsProcess) {
			if (nova.inDevMode()) {
				console.log(" #### Okay, ready to do Promise!");
			}
			return getProcessResults(command, args, nova.workspace.path);
		} else {
			if (nova.inDevMode()) {
				console.log(" #### Okay, should be built to Nova!");
			}
			return new TaskProcessAction(command, { args: args });
		}
	}

	/**
	 * Run the project with debugger
	 * @param {string} projectType - Which type of project, "air|airmobile|flex"
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {Object} config - The Task's configs
	 * @param {Object} configOverrides - Which type of project, "air|airmobile|flex"
	 */
	debugRun(projectType, projectOS, config, configOverrides) {
		const configValues = getConfigsForBuild(true,configOverrides);

		// console.log("CONFIG VALUES: ");
		// consoleLogObject(configValues);
		// console.log("CONFIG VALUES: ");
		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		let destDir = configValues.destDir;
		let appXMLName = configValues.appXMLName;
		let exportName = configValues.exportName;
		let mainSrcDir = configValues.mainSrcDir;
		// Only needed for AIR:
		let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);
		let anePaths = configValues.anePaths;

		var base = nova.path.join(nova.extension.path, "debugger");

		let args = [];
		// Pass the Flex SDK
		args.push("-Dflexlib=" + flexSDKBase+"/frameworks");

		// For workspaces, pass the folder
		if(isWorkspace()) {
			args.push("-Dworkspace=" + nova.workspace.path);
		}

		//uncomment to debug the SWF debugger JAR
		//args.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005");
		args.push("-cp");
		args.push("" + base + "/bin/*:" + base + "/bundled-debugger/*");
		args.push("com.as3mxml.vscode.SWFDebug");

		var action = new TaskDebugAdapterAction("actionscript3");
		action.command = "/usr/bin/java";
		action.args = args;
		action.cwd = nova.workspace.path;

		// Launch should be used for SWF/AIR Desktop. I believe "attach" is going to be for on devices or simulators. (Which have yet to do!)
		action.adapterStart = "launch";

		/* Need to add ad adjust debugArgs based on the "Launch configuration attributes" depending on type of Task. See debugger/readme.MD for more info! */
		let debugArgs = {};

		if(projectType=="flash") {
			let fpApp;
			if(config.get("as3.launch.type")=="browser") {
				fpApp = nova.config.get("as3.flashPlayer.browser");

				debugArgs.program = destDir + "/" +  exportName.replace(".swf",".html");
				debugArgs.runtimeExecutable = fpApp;

				if(nova.config.get("as3.flashPlayer.browserCustomUser")==true) {
					// Make a temp old user
					const userDataDir = "/tmp/old-chrome-profile";

					// Ensure the custom profile directory exists
					if (!nova.fs.stat(userDataDir)) {
						nova.fs.mkdir(userDataDir);
					}

					// Chrome command-line arguments
					args = [
						"--user-data-dir=" + userDataDir, // Use custom profile
						"--allow-outdated-plugins",       // Allow outdated plugins like Flash
						"--enable-npapi",                 // Enable NPAPI (needed for Flash)
						"--no-first-run",                 // Suppress first-run prompts
						//"--disable-web-security",       // Optional: disable web security for testing
						//"--disable-extensions",           // Disable Chrome extensions
					];
					debugArgs.runtimeArgs = args;
				}

			} else {
				let launchType = config.get("as3.launch.type");

				if(launchType=="ruffle") {
					nova.workspace.showErrorMessage("Using debugger with Ruffle is unsupported. Please change launch type to Flash Player or Browser. Or disable the options to `Enable running with Debugger`.");
					return null;
				}

				fpApp = nova.config.get("as3.flashPlayer.standalone");
				debugArgs.program = destDir + "/" +  exportName;
				debugArgs.runtimeExecutable = fpApp;
			}
		} else {
			var profileType = this.getProfileType(config, projectType, appXMLLocation);
			debugArgs.profile = profileType;

			if(projectType=="airmobile") {
				var simulatorDevice = config.get("as3.task.deviceToSimulate");
				var screenSize = this.getFormattedScreenSize(simulatorDevice);
				debugArgs.screensize = screenSize;

				var screenDPI = this.getFormattedScreenDPI(simulatorDevice);
				if(screenDPI>0) {
					debugArgs.screenDPI = screenDPI;
				}

				var versionPlatform = "MAC";
				if(projectOS!=undefined) {
					if(projectOS=="ios") {
						versionPlatform = "IOS";
					} else if(projectOS=="android") {
						versionPlatform = "AND"
					}
				}
				debugArgs.platform = versionPlatform;
			}

			if(anePaths && anePaths.length>0) {
				var aneTempPath = determineAneTempPath();
				if(aneTempPath==null) {
					displayANEsProjectUUIDError();
					return null;
				}
				debugArgs.exdir = aneTempPath;
			}

			debugArgs.runtimeExecutable = flexSDKBase + "/bin/adl";
			debugArgs.program = destDir + "/" + appXMLName;
		}

		action.debugArgs = debugArgs;

		// Print out all the args so I know what's getting passed!
		if(nova.inDevMode()) {
			var argsOut = "";
			args.forEach(a => argsOut += a + "\n")
			argsOut = "\nDebugger Args:\n";
			console.log(" *** ARGS:: \\/\\/\\/\n\n" + argsOut + "\n");
			consoleLogObject(debugArgs);
			console.log("\n *** ARGS:: /\\/\\/\\");
		}

		return action;
	}

	/**
	 * Runs the project using Nova's task system
	 * @param {string} projectType - Which type of project, "air|airmobile|flex"
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {Object} config - The Task's configs
	 * @param {Object} configOverrides - Which type of project, "air|airmobile|flex"
	 */
	run(projectType, projectOS, config, configOverrides) {
		// console.log("projectType: " + projectType)
		let command = "";
		let args = [];

		const configValues = getConfigsForBuild(true,configOverrides);
		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		let destDir = configValues.destDir;
		let appXMLName = configValues.appXMLName;
		let exportName = configValues.exportName;
		let mainSrcDir = configValues.mainSrcDir;
		// Only needed for AIR:
		let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);

		// console.log(" DEST DIR: " + destDir);
		// If we are running Flash
		if(projectType=="flash") {
			let fpApp;
			if(config.get("as3.launch.type")=="browser") {
				fpApp = nova.config.get("as3.flashPlayer.browser");

				command = getExec(fpApp);
				if(command==null) {
					nova.workspace.showErrorMessage("Flash Player Run/Debug -> " + (config.get("as3.launch.type")=="ruffle" ? "Ruffle" : "Standalone Flash Player") + " Error\n\nProblem finding executable at " + fpApp);
					return null;
				}

				if(nova.config.get("as3.flashPlayer.browserCustomUser")==true) {
					// Make a temp old user
					const userDataDir = "/tmp/old-chrome-profile";

					// Ensure the custom profile directory exists
					if (!nova.fs.stat(userDataDir)) {
						nova.fs.mkdir(userDataDir);
					}

					// Chrome command-line arguments
					args = [
						"--user-data-dir=" + userDataDir, // Use custom profile
						"--allow-outdated-plugins",       // Allow outdated plugins like Flash
						"--enable-npapi",                 // Enable NPAPI (needed for Flash)
						"--no-first-run",                 // Suppress first-run prompts
						//"--disable-web-security",       // Optional: disable web security for testing
						//"--disable-extensions",           // Disable Chrome extensions
					];
				}

				args.push(destDir + "/" +  exportName.replace(".swf",".html"));

				if (nova.inDevMode()) {
					console.log(" *** Attempting to Run a webbrowser with Flash Player with [[" + command + "]] ARG: \n");
					consoleLogObject(args);
				}
			} else {
				// Since Flash Player can actually have an executable of Flash Player Debugger or just Flash Player, let's just look in that
				// .app's Content/MacOS folder! And we can also use that for Ruffle too, that way they user just select's the application!
				fpApp = (config.get("as3.launch.type")=="ruffle" ? nova.config.get("as3.flashPlayer.ruffle") : nova.config.get("as3.flashPlayer.standalone") )

				command = getExec(fpApp);
				if(command==null) {
					nova.workspace.showErrorMessage("Flash Player Run/Debug -> " + (config.get("as3.launch.type")=="ruffle" ? "Ruffle" : "Standalone Flash Player") + " Error\n\nProblem finding executable at " + fpApp);
					return null;
				}

				if (nova.inDevMode()) {
					console.log(" *** Attempting to Run Flash Player application with [[" + command + "]] ARG: \n");
					consoleLogObject(args);
				}
				args.push(destDir + "/" +  exportName);
			}
		} else { // Otherwise, we are running through AIR!
			var runningOnDevice = false;
			// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
			// To launch ADL, we need to point it to the "-app.xml" file
			command = flexSDKBase + "/bin/adl";

			var launchMethod = config.get("as3.task.launchMethod");
			if(launchMethod=="device") {
				// @TODO If we don't find devices, ask if they want to continue on desktop or try again?
			}

			if(projectType=="airmobile") {
				var screenSize = this.getFormattedScreenSize(config.get("as3.task.deviceToSimulate"));
				args.push("-screensize");
				args.push(screenSize);
			}

			args.push("-profile");
			// Check if the Task set's the profile or if we need to check in the app-xml
			var profileType = this.getProfileType(config, projectType, appXMLLocation);
			args.push(profileType);

			// ADL wants the directory with the ANEs
			/** @TODO Change to task pointer, or get Workspace and then replace with task value if available!  */
			/** @NOTE Should check if there's a difference in the Workspace config and the packaging */
			var anes = config.get("as3.packaging.anes");//nova.workspace.config.get("as3.packaging.anes");
			// If there are ANEs, then we need to include the "ane" folder we made with the extracted
			// ones that to the destination dir.
			if (nova.inDevMode()) {
				console.log("anes: " + JSON.stringify(anes));
			}
			if(anes && anes.length>0) {
				var aneTempPath = determineAneTempPath();
				if(aneTempPath==null) {
					displayANEsProjectUUIDError();
					return null;
				}
				args.push("-extdir");
				args.push(aneTempPath);
			}

			// The app.xml file
			args.push(destDir + "/" + appXMLName);

			// Root directory goes next
			// "--" then args go now...
			if (nova.inDevMode()) {
				console.log(" *** Attempting to Run ADL with [[" + command + "]] ARG: \n");
				consoleLogObject(args);
			}

			// Possible errors:
			//
			// application descriptor not found
			// Task Terminated with exit code 6
			// --
			// error while loading initial content
			// Task Terminated with exit code 9
		}

		return new TaskProcessAction(command, {
			shell: true,
			args: args,
			env: {}
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
							return resolveSymLink(currPath)
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
										ensureFolderIsAvailable(destPath);
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
							ensureFolderIsAvailable(destPath);
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
		var isLibrary = false;
		var flexProperties = getStringOfWorkspaceFile(".flexProperties");
		if(flexProperties!=null) {
//			var flexPropertiesXml = pjXML.parse(flexProperties);
			/** @NOTE Not sure we need to check any values, but if it's there, it's MXML vs AS3 project! */
			var flexPropertiesXml = new xmlToJson.ns3x2j(flexProperties,false);
			//console.log("compilerSourcePath> " + flexPropertiesXml.select("//flexProperties"));
			//consoleLogObject(flexPropertiesXml.select("//flexProperties"));
			nova.workspace.config.set("editor.default_syntax","mxml");
			nova.workspace.config.set("as3.application.isFlex",true);
			isFlex = true;
		} else {
			nova.workspace.config.set("editor.default_syntax","actionscript");
			nova.workspace.config.set("as3.application.isFlex",false);
		}

		// If this is a library project, then it will have a .flexLibProperties file!!
		var flexLibProperties = getStringOfWorkspaceFile(".flexLibProperties");
		if(flexLibProperties!=null) {
			nova.workspace.config.set("editor.default_syntax","actionscript");
			nova.workspace.config.set("as3.application.isFlex",true);
			isFlex = true;
			isLibrary = true;
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
		var mainSrcDir = actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","sourceFolderPath");
		// If the main source director is empty or null, set it to "./" so we know that the user isn't
		// using the default "src/" folder! We'll adjust it with the congif-util.js functions!
		if(mainSrcDir==null || mainSrcDir=="") {
			mainSrcDir = "./";
		}
		nova.workspace.config.set("as3.build.source.main",mainSrcDir);

		var flexSDKAskedFor = actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","flexSDK");

		var prefSourceDirs = [];
		actionscriptPropertiesXml.findNodesByName("compilerSourcePathEntry").forEach((sourceDir) => {
			prefSourceDirs.push(sourceDir["@"]["path"]);
		});
		nova.workspace.config.set("as3.build.source.additional",prefSourceDirs);

		nova.workspace.config.set("as3.build.output",actionscriptPropertiesXml.getAttributeFromNodeByName("compiler","outputFolderPath"));

		/**
		 * @NOTE Looks like this is how the library paths work:
		 *
		 * KIND
		 * ----
		 * 1 - Project Relative
		 * 2 - Absolute path to SWC
		 * 3 - Flex SDK built-in (frameworks/libs...)
		 * 4 - Flex SDK Theme (frameworks/themes/...)
		 * 5 - External Folder (not a SWC but a folder, like ANEs)
		 *
		 * LINKTYPE
		 * --------
		 * 1 - Merge into code
		 * 2 - External (runtime shared library)
		 * 3 - Internal (RSL linked in a specific way)
		 *
		 * Now, how to manage all these?!
		 * For now, we're only adding Kind 1 & 3, but we have to check for excludedEntries...
		 */

		var excludedLibs = [];
		// Since the XML may have libraryPathEntries in multiple places, we need to take a look at the top children of it.
		var excludedLibEntries = actionscriptPropertiesXml.findNodesByName("excludedEntries");//
		// console.log("Excluded? ");
		 // consoleLogObject(excludedLibEntries);
		if(excludedLibEntries.length) {
			// If there are entries, then lets go through them and add the to our holder.
			excludedLibEntries[0].children.forEach((duu) => {
				excludedLibs.push(duu["@"]["path"]);
			});
		}
		// console.log("Excluded libraries!");
		// consoleLogObject(excludedLibs);

		var prefLibDirs = [];
		var kind, path;
		actionscriptPropertiesXml.findNodesByName("libraryPathEntry").forEach((libDir) => {
			// consoleLogObject(libDir);
			kind = libDir["@"]["kind"];
			if(kind==1 || kind==3) {
				path = libDir["@"]["path"];
				// console.log(" DO WE ADD PATH: " + path);
				if(excludedLibs.indexOf(path)==-1) {
					// console.log("Add a 'Libs Dirs:` entry of [" + libDir["@"]["path"] + "]");
					prefLibDirs.push(libDir["@"]["path"]);
				}
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

		let themeTag = actionscriptPropertiesXml.findNodesByName("theme");
		if(themeTag!="") {
			nova.workspace.config.set("as3.theme.isDefault",(actionscriptPropertiesXml.getAttributeFromNodeByName("theme","themeIsDefault")=="true" ? true : false));
			nova.workspace.config.set("as3.theme.isSDK",(actionscriptPropertiesXml.getAttributeFromNodeByName("theme","themeIsSDK")=="true" ? true : false));
			nova.workspace.config.set("as3.theme.location",actionscriptPropertiesXml.getAttributeFromNodeByName("theme","themeLocation"));
		}

		// @NOTE Modules and Workers. Never used them, not sure how they get setup here.

		// Let's get to making Tasks!
		let taskName = "";
		let taskJson = this.baseTaskJson;

		if(isLibrary) {
			taskName = "AS3 Library";
			taskJson["extensionTemplate"] = "actionscript-lib";

			var flexLibPropertiesXml = new xmlToJson.ns3x2j(flexLibProperties);

			var includeAllClasses = flexLibPropertiesXml.getAttributeFromNodeByName("flexLibProperties", "includeAllClasses")
			taskJson.extensionValues["as3.lib.includeAllClasses"] = includeAllClasses

			var classEntries = [];
			flexLibPropertiesXml.findNodesByName("classEntry").forEach((classEntry) => {
				classEntries.push(classEntry["@"]["path"]);
			});
			taskJson.extensionValues["as3.lib.classEntries"] = classEntries

			var resourceDestPathEntries = [];
			var resourceSourcePathEntries = [];
			flexLibPropertiesXml.findNodesByName("resourceEntry").forEach((resourceEntry) => {
				resourceDestPathEntries.push(resourceEntry["@"]["destPath"]);
				resourceSourcePathEntries.push(resourceEntry["@"]["sourcePath"]);
			});
			taskJson.extensionValues["as3.lib.resource.dest"] = resourceDestPathEntries
			taskJson.extensionValues["as3.lib.resource.source"] = resourceSourcePathEntries

			var namespaceManifestEntryManifests = [];
			var namespaceManifestEntryNamespaces = [];
			flexLibPropertiesXml.findNodesByName("namespaceManifestEntry").forEach((namespaceManifestEntry) => {
				namespaceManifestEntryManifests.push(namespaceManifestEntry["@"]["manifest"]);
				namespaceManifestEntryNamespaces.push(namespaceManifestEntry["@"]["namespace"]);
			});
			taskJson.extensionValues["as3.lib.nsm.manifest"] = namespaceManifestEntryManifests;
			taskJson.extensionValues["as3.lib.nsm.namespace"] = namespaceManifestEntryNamespaces;

			// Ensure Tasks folder is available and then write this Task!
			this.ensureTaskFolderIsAvailable();
			this.writeTaskFile("AS3 Library", taskJson);
		} else {
			var buildTargets = actionscriptPropertiesXml.findNodesByName("buildTarget");
			// If there are build targets, then we are dealing with AIR, otherwise it's Flash
			if(buildTargets.length>0) {
				// Packaging, make separate tasks for it
				buildTargets.forEach((buildTarget) => {
					taskName = "";
					taskJson = this.baseTaskJson;

					let platformCheck = buildTarget["@"]["platformId"];
					if(platformCheck==undefined) {
						platformCheck = buildTarget["@"]["buildTargetName"];
					}

					switch(platformCheck) {
						case "com.adobe.flexide.multiplatform.ios.platform": {
							taskName = "AIR - iOS";
							taskJson["extensionTemplate"] = "actionscript-ios";
							taskJson.extensionValues["as3.target"] = "ios";
							showNotification("Select Desktop Device for iOS", "Don't forget to set the screen size of the device to simulate when running the iOS Task!","Okay", "ios-task-import");
							break;
						}
						case "com.qnx.flexide.multiplatform.qnx.platform": {
							taskName = "AIR - BlackBerry Tablet OS";
							taskJson["extensionTemplate"] = "actionscript-airmobile";
							taskJson.extensionValues["as3.target"] = "blackberry";
							console.log("BlackBerry not surpported. Not even sure I can download the SDK anymore...");
							showNotification("BlackBerry not surpported", "The project contains an entry for BlackBerry, which isn't supported. You may want to remove this task.","Okay", "bb-task-import");
							break;
						}
						case "com.adobe.flexide.multiplatform.android.platform": {
							taskName = "AIR - Android";
							taskJson["extensionTemplate"] = "actionscript-android";
							taskJson.extensionValues["as3.target"] = "android";
							showNotification("Select Desktop Device for Android", "Don't forget to set the screen size of the device to simulate when running the Android Task!","Okay", "android-task-import");
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

						if(airExcludes) {
							airExcludes["children"].forEach((excludes) => {
								//console.log(" ------- EXCLUDE > " + excludes["@"]["path"]);
								excludedInPackage.push(excludes["@"]["path"]);
							});
						}
						if(excludedInPackage.length>0) {
							taskJson.extensionValues["as3.packaging.excludedFiles"] = excludedInPackage;
						}

						var anePaths = actionscriptPropertiesXml.findChildNodeByName(airSettings["children"], "anePaths");
						var anePathsInPackage = [];

						if(anePaths) {
						//	consoleLogObject(anePaths);
							anePaths["children"].forEach((anePath) => {
						//		consoleLogObject(anePath);
								//console.log(" +++++++ ANE PATH > " + anePath["@"]["path"]);
								anePathsInPackage.push(anePath["@"]["path"]);
							});
						}
						if(anePathsInPackage.length>0) {
							taskJson.extensionValues["as3.packaging.anes"] = anePathsInPackage;
						}

						// Enable Build on Run if enabled
						if(nova.config.get("as3.project.buildOnRun")) {
							taskJson["buildBeforeRunning"] = true;
						}

						// Enable Open report window when run
						if(nova.config.get("as3.project.openOnRun")) {
							taskJson["openLogOnRun"] = "start";
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

				// Enable Build on Run if enabled
				if(nova.config.get("as3.project.buildOnRun")) {
					flashTaskJson["buildBeforeRunning"] = true;
				}

				// Enable Open report window when run
				if(nova.config.get("as3.project.openOnRun")) {
					flashTaskJson["openLogOnRun"] = "start";
				}

				// Ensure Tasks folder is available and then write this Task!
				this.ensureTaskFolderIsAvailable();
				this.writeTaskFile("Flash", flashTaskJson);
			}

		}

		if(flexSDKAskedFor!=null) {
			showNotification("Check SDK Setting", "The project is looking for the Flex SDK of \"" + flexSDKAskedFor + "\". Please make sure you set this project's settings, select ActionScript 3 and change the Compiler -> AIR/Flex SDK version to the specific SDK.","I did");
		}
		// Add a value to keep track that we imported the project, so it doesn't keep asking everytime the project is opened
		nova.workspace.config.set("as3.project.importedFB","done");
	}

	/**
	 * Makes sure that we have  a Task folder so we can generate new tasks
	 */
	ensureTaskFolderIsAvailable() {
		return ensureFolderIsAvailable(nova.workspace.path + "/.nova/Tasks");
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
	 * Handles the Clean/Build/Run stuff from Nova's UI.
	 * @param {class} context - What's coming from the build options
	 */
	resolveTaskAction(context) {
		let data = context.data;
		let config = context.config;
		let action = context.action;

		// Check if task overrides values:
		let configOverrides = {};

		// Check if the task is using a different SDK
		let sdkOverride = config.get("as3.compiler.sdk");
		if(sdkOverride!=null) {
			configOverrides.sdkBase = sdkOverride;
		}

		// Check if there's an application file set in the Task, if so, we need to override those values!
		let appFileOverride = config.get("as3.task.applicationFile")?.trim();
		if(appFileOverride) {
			configOverrides.mainApplicationPath = appFileOverride;
		}

		// If the task sets a different export folder, we'll need to override it!
		let exportFolderOverride = config.get("as3.task.output")?.trim();
//			if(config.get("as3.export.folder")!=null && config.get("as3.export.folder")!="") {
		if(exportFolderOverride) {
			configOverrides.releasePath = exportFolderOverride;
		}

		// Check if the task has custom ANEs set
		if(config.get("as3.packaging.customANEs")) {
			let anePathOverride = config.get("as3.packaging.anes");
			if(anePathOverride) {
				configOverrides.anes = anePathOverride;
			}
		}

		if(action==Task.Build) {
			if(data.type=="library") {
				return this.buildLibrary(
					config.get("as3.lib.classEntries"),
					config.get("as3.lib.resource.dest"),
					config.get("as3.lib.resource.source"),
					config.get("as3.lib.nsm.manifest"),
					config.get("as3.lib.nsm.namespace")
				);
			} else {
				/** @TODO, should this be a different config, like build mode with or without debug? */
				return this.build(data.type,  config.get("actionscript3.request"), false, configOverrides);
			}
		} else if(action==Task.Run) {
			if(config.get("as3.run.withDebugger")) {
				return this.debugRun(data.type, data.os, config, configOverrides);
			} else {
				return this.run(data.type, data.os, config, configOverrides)
			}
		} else if(action==Task.Clean) {
			const configValues = getConfigsForBuild(true, configOverrides);
			return new TaskCommandAction("as3.clean", { args: [configValues.destDir] });
		}
	}
}
