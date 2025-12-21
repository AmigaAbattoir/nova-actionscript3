const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { showNotification, cancelNotification, isWorkspace, getWorkspaceOrGlobalConfig, getProcessResults, saveAllFiles, consoleLogObject, resolveSymLink, getStringOfWorkspaceFile, getStringOfFile, ensureFolderIsAvailable, makeOrClearFolder, listFilesRecursively, getExec, quickChoicePalette, doesFileExist, getIPAddress, doesFolderExist, checkIfFileWasModifiedAfterOther, shouldIgnoreFileName, checkIfModifiedAfterFileDate } = require("./nova-utils.js");
const { determineFlexSDKBase, determineAndroidSDKBase, getAppXMLNameAndExport, getConfigsForBuildAndPacking } = require("./config-utils.js");
const { determineProjectUUID, determineTempPath, determineAneTempPath, resolveStatusCodeFromADT, convertAIRSDKToFlashPlayerVersion } = require("./as3-utils.js");
const { getCertificatePasswordInKeychain, setCertificatePasswordInKeychain, promptForPassword, getSessionCertificatePassword, setSessionCertificatePassword } = require("./certificate-utils.js");
const { installSDKPrompt, getAIRSDKInfo, isAIRSDKInstalled } = require("./sdk-utils.js");
const { getSelectedDevices, checkIfInstalledOnDevice } = require("./device-utils.js");
const { md5HashBinaryFile } = require("/md5.js");

var fileExtensionsToExclude = [];
var fileNamesToExclude = [];

/**
 * Helps to display if there is a UUID error.
 */
function displayProjectUUIDError() {
	var uuidMessage = "Project UUID Missing\n\nPlease use the Import Flash Builder option in the menu,";
	if(nova.version[0]<10) {
		uuidMessage += "ensure that `uuidgen` is on your system's path, update to Nova 10+,"
	}
	uuidMessage += " or run from the menu `Check Project UUID` to ensure a project UUID is created. Once it's created, you can try again!";
	nova.workspace.showErrorMessage(uuidMessage);
}

/**
 * Used to notify the user if there is a problem with the ANE temporary path
 * @param {string} path - The full path to where the ANE temporary path should be.
 */
function displayANEsTempPathError(path) {
	var message = "ANE Temp Path Errror\n\nThere was a problem extracting ANEs to it's temporary path of:\n" + path + ".\n\n";
	message += "If you try to build again and this error comes up, please check if that path is a valid one. You can also get this path from the menu `Check ANE temp dir`.";
	nova.workspace.showErrorMessage(message);
}

/**
 * Used to notify the user if there is a problem with the temporary path
 * @param {string} path - The full path to where the temporary path should be.
 */
function displayTempPathError(path) {
	var message = "Temp Path Errror\n\nThere was a problem extracting copying file to it's temporary path of:\n" + path + ".\n\n";
	message += "If you try to build again and this error comes up, please check if that path is a valid one.";
	nova.workspace.showErrorMessage(message);
}

/**
 * Parse through the App XML to see if there are the appropriate files needed for an application icon
 * @param {Array<object>} taskConfig - The taskConfigs array
 */
function checkMacBuildForIcons(taskConfig) {
	const configValues = getConfigsForBuildAndPacking(taskConfig, true);
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

/**
 * Helper to show device type in correct uppercase (iOS/Android) format
 * @param {string} type - The lowercase version (ios|android) of the device type
 */
function displayDeviceType(type) {
	switch(type) {
		case "ios": {
			type = "iOS";
			break;
		}
		case "android": {
			type = "Android";
			break;
		}
	}
	return type;
}

/**
 * Figures out the password for the certificate when building. Prompts if needed and asks how to store it.
 * @param {Promise<object>} certificateLocation - An object containing `saveType` () and the `password`
 */
function determineCertificatePassword(certificateLocation) {
	return new Promise((resolve, reject) => {
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
					resolve(null);
					return;
					break;
				}
			}

			resolve({ saveType: "This time", password: password });
		});
	});
}

/**
 * The Task Assistant that handles all the things for Task.
 */
exports.ActionScript3TaskAssistant = class ActionScript3TaskAssistant {
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

	// ---- Launch Metadata related ----
	/**
	 * Loads the metadata file that keeps track of launching on devices
	 * @returns {object} - Object with the metadata used for tracking installs/launches on devices.
	 */
	loadLaunchMetadata() {
		const path = nova.workspace.path + "/.nova/ActionScript3Launcher.json";

		if(nova.fs.stat(path)) {
			try {
				let file = nova.fs.open(path);
				let json = file.read();
				file.close();
				return JSON.parse(json);
			} catch (error) {
				console.log("No ActionScript3Launcher.json for project found.");
			}
		}

		return { devices: {} };
	}

	/**
	 * Updates the launch metadata file
	 * @param {object} launcherMetadata - Object with the metadata used for tracking installs/launches on devices.
	 * @param {boolean} debugMode - `true` if the package was a debug version otherwise `false` for a regular run
	 * @param {string} deviceId - The device's ID which had the package installed
	 * @param {string} packageHash - the MD5 of the package that was installed
	 * @param {number} installTime - The timestamp of when the install was performed
	 * @param {string} packageId - The packageId of what was installed/launched
	 */
	updateLauncherMetadata(launcherMetadata, debugMode, deviceId, packageHash, installTime, packageId) {
		if(!launcherMetadata.devices) {
			launcherMetadata.devices = {};
		}

		if(!launcherMetadata.devices[deviceId]) {
			launcherMetadata.devices[deviceId] = {};
		}

		if(!launcherMetadata.devices[deviceId][debugMode ? "debug" : "run"]) {
			launcherMetadata.devices[deviceId][debugMode ? "debug" : "run"] = {};
		}

		launcherMetadata.devices[deviceId][debugMode ? "debug" : "run"] = {
			md5: packageHash,
			installTime: installTime,
			packageId: packageId
		};

		this.saveLaunchMetadata(launcherMetadata);

		return launcherMetadata;
	}

	/**
	 * Saves the metadata file
	 * @param {object} launcherMetadata - Object with the metadata used for tracking installs/launches on devices.
	 */
	saveLaunchMetadata(launcherMetadata) {
		var launcherFile = nova.fs.open(nova.workspace.path + "/.nova/ActionScript3Launcher.json", "w");
		launcherFile.write(JSON.stringify(launcherMetadata, null, 2));
		launcherFile.close();
	}

	// ---- Task ----
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

				if(nova.inDevMode()) {
					console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
					consoleLogObject(taskConfig);
					console.log("-==-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
				}

				// We need a project UUID which we use to save the certificate password in a later step, but let's check
				// first. It should generate one if possible, but on the unlikely event, we should abort.
				var getProjectUUID = determineProjectUUID();
				getProjectUUID.then((resolve) => { // Now that we have the UUID, let's try to make a build
					var projectUUID = resolve;
					/** @TODO Get a setting from the task maybe*/
					var releasePath = "bin-release-temp";

					// Force the task to use a different output for packaging the we will remove if packaging is complete...
					taskConfig["as3.task.output"] = nova.path.join(nova.workspace.path, releasePath);

					// Check for iOS Provisioning Profile, if not set abort before even building!!
					var provisioningProfile;
					// If we are packaing for iOS, we want to make sure that the provisioning profile is set before attempting to build
					if(taskConfig["as3.target"]=="ios") {
						provisioningProfile = taskConfig["as3.packaging.provisioningFile"];
						if(provisioningProfile==undefined || provisioningProfile==null) {
							nova.workspace.showErrorMessage("When exporting a package for iOS, you must set a provisioningProfile in the Task!");
							return;
						}
					}

					// If default (desktop), then for Mac, certain icons aren't set, then it will be a default empty icon
					if(taskConfig["as3.target"]=="default" || taskConfig["as3.target"]=="mac") {
						checkMacBuildForIcons(taskConfig);
					}

					showNotification("Export Release Build started","Attempting to package " + taskFileName.replace(".json","") + "...","Please wait", "-packaging");
					this.build(projectType, taskConfig, true).then((resolve) => {
						// Check if the Task has a custom certificate set for it!
						if(taskConfig["as3.packaging.certificate"] && taskConfig["as3.packaging.certificate"]!="") {
							certificateLocation = taskConfig["as3.packaging.certificate"];
						}

						determineCertificatePassword(certificateLocation).then((results) => {
							var password = results.password;
/*
console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
console.log("&&&& PACKAGE BUILDER TASKCONFIG &&&&&&&&&&&&&&&&&&&&&&&&")
consoleLogObject(taskConfig);
console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&")
*/
							this.package(projectType, taskConfig, releasePath, certificateLocation, password);
						},(reject) => {
							// console.log("passwordGet.then((reject): ");
							nova.workspace.showErrorMessage("Password failed!\n\n" + reject);
						});
					}, (reject) => {
						cancelNotification("-packaging");
						// To make this a little neater, remove the workspace's path from the stderr messages
						var message = reject.stderr.replaceAll(nova.workspace.path,"");
						nova.workspace.showErrorMessage("Export Release Build failed!\n\nOne or more errors were found while trying to build the release version. Unable to export.\n\n" + message);
					});
				},
				(reject) => {
					displayProjectUUIDError();
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
	 * @param {Array} namespaceManifestEntryNamespaces - The namespace used for these manifest XMLs. There needs to be the same amount of `namespaceManifestEntryManifests` and `namespaceManifestEntryNamespaces`!
	 */
	buildLibrary(taskConfig) { //},classEntries, resourceDestPathEntries, resourceSourcePathEntries, namespaceManifestEntryManifests, namespaceManifestEntryNamespaces) {
		const configValues = getConfigsForBuildAndPacking(taskConfig, false);

		let classEntries = taskConfig["as3.lib.classEntries"];
		let resourceDestPathEntries = taskConfig["as3.lib.resource.dest"];
		let resourceSourcePathEntries = taskConfig["as3.lib.resource.source"];
		let namespaceManifestEntryManifests = taskConfig["as3.lib.nsm.manifest"];
		let namespaceManifestEntryNamespaces = taskConfig["as3.lib.nsm.namespace"];

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
		if(screenSize==null || screenSize=="none" || screenSize==false) {
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
	 * Packages the AIR project. This can be used for final export.
	 * @param {string} projectType - Which type of build, "air|airmobile|flex"
	 * @param {Object} taskConfig - Values from the Task (converted to an object array of the elements needed)
	 * @param {string} releaseFolder - The path where to place the final output
	 * @param {string} certificateLocation - The path of the certificate used to sign the package
	 * @param {string} password - The password used for signing the package
	 * @param {boolean} forRunOrDebug - Default is `false` for packaging a release, otherwise `true` if this is going to be used for run/debug
	 */
	package(projectType, taskConfig, releaseFolder, certificateLocation, password, forRunOrDebug = false, debugMode = false) {
		console.log("RELEASE PATH for package(): " + releaseFolder);

		const configValues = getConfigsForBuildAndPacking(taskConfig, true);

		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		let appXMLName = configValues.appXMLName;
		let doTimestamp= configValues.doTimestamp;
		let timestampURL= configValues.timestampURL;

		// Check for iOS Provisioning Profile
		var provisioningProfile;
		// If we are packaging for iOS, we want to make sure that the provisioning profile is set before attempting to build
		if(taskConfig["as3.target"]=="ios") {
			provisioningProfile = taskConfig["as3.packaging.provisioningFile"];
			if(provisioningProfile==undefined || provisioningProfile==null) {
				nova.workspace.showErrorMessage("When exporting a package for iOS, you must set a provisioningProfile in the Task!");
				return Promise.reject({success: false});
			}
		}

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

		// When packaging, unless for run on devices, we will use the workspace path
		let basePath = nova.workspace.path;
		if(forRunOrDebug) {
			basePath = determineTempPath();
			if(basePath==null) { /** @NOTE: Hmm, error should be in determineTempPath()... */
				displayTempPathError(basePath);
				return Promise.reject({success: false});
			}
		}

		if(alsoIgnore) {
			alsoIgnore.forEach((ignore) => {
				//console.log("Ignroe: " + ignore);
				//console.log("[["+ + "/" + releaseFolder + "/" + ignore +"]]");
				try{
					if(nova.fs.stat(basePath + "/" + releaseFolder + "/" + ignore).isFile()) {
						//console.log("    REMOVE FILE + " + ignore + " !");
						nova.fs.remove(basePath + "/" + releaseFolder + "/" + ignore);
					} else if(nova.fs.stat(basePath + "/" + releaseFolder + "/" + ignore).isDirectory()) {
						//console.log("    REMOVE DIR + " + ignore + " !");
						nova.fs.rmdir( + "/" + releaseFolder + "/" + ignore);
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

		var command = flexSDKBase + "/bin/adt";
		var args = [];
		var env = {};

		var archType = taskConfig["as3.deployment.arch"];
		var currentAIRSDKVersion = nova.workspace.context.get("currentAIRSDKVersion");

		// Replace with function, passing the certificateLocation and password?!
		if(taskConfig["as3.packaging.type"]=="intermediate") {
			args.push("-prepare");
			packageName = packageName.replace(/\.air$/, ".airi");
		} else {
			args.push("-package");

			var targetType = taskConfig["as3.deployment.target"];
			var connectionType = taskConfig["as3.task.deviceType"];
			var address;
			if(connectionType=="network") {
				address = getIPAddress();
				if(!address) {
					nova.workspace.showErrorMessage("There were issues getting this machine's IP address, please change to using USB for `Which type of device` to use for launching.");
					return Promise.reject({success: false});
				}
			}

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
				if(forRunOrDebug) {
					targetType = "apk-debug";
					args.push(targetType);

					if(debugMode) {
						if(connectionType=="usb") {
							args.push("-listen");
							args.push("7936");
						} else {
							args.push("-connect");
							args.push(address.ip+":7936");
						}
					}
					packageName = packageName.replace(/\.air$/, ".apk");
				} else {
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
				}

				args.push("-arch");
				if(archType==null) {
					archType = "armv7";  // Or should this now be armv8?
				} else {
					if(archType=="armv8") {
						// If less than 33.1, there's no armv8 support, so we definitely can fail now!
						if(currentAIRSDKVersion<33.1) {
							console.log(currentAIRSDKVersion);
							nova.workspace.showErrorMessage("When exporting for Android armv8, make sure you are using AIR SDK 33.1.1.533 or greater, current version is " + currentAIRSDKVersion);
							return Promise.reject({success: false});
						}
					}
				}
				args.push(archType);
			}else if(taskConfig["as3.target"]=="ios") {
				args.push("-target");

				if(forRunOrDebug) {
					if(taskConfig["as3.task.packagingMethod"]=="fast") {
						args.push(debugMode ? "ipa-debug-interpreter" : "ipa-test-interpreter");
					} else {
						args.push(debugMode ? "ipa-debug" : "ipa-test");
					}

					if(debugMode) {
						if(connectionType=="usb") {
							args.push("-listen");
							args.push("7936");
						} else {
							args.push("-connect");
							args.push(address.ip+":7936");
						}
					}
				} else {
					if(targetType==null) {
						targetType = "ipa-test";
					}
					args.push(targetType);
				}

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

			if(taskConfig["as3.target"]!="ios" && taskConfig["as3.target"]!="android") {
				if(doTimestamp==false ) {
					args.push("-tsa");
					args.push("none");
				} else {
					if(timestampURL!=null && timestampURL!="") {
						args.push("-tsa");
						args.push(timestampURL);
					}
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
		// For Running, we will force using the `basePath` which is in a temp folder!
		if(forRunOrDebug) {
			exportLocation = basePath;
		} else {
			if(taskConfig["as3.export.folder"]) {
				exportLocation = nova.path.join(basePath, taskConfig["as3.export.folder"]);
			}
		}
		if(ensureFolderIsAvailable(exportLocation)==false) {
			cancelNotification("-packaging");
			nova.workspace.showErrorMessage("Export Release Build failed!\n\nCannot export to folder "+exportLocation);
		}

		let outputFile = nova.path.join(exportLocation, packageName);
		args.push(outputFile);

		// Descriptor
		args.push(appXMLName);

		// Usage
		let baseFolderPath = nova.path.join(basePath, releaseFolder);
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
		if(anes && anes.length>0) {
			var aneTempPath = determineAneTempPath((forRunOrDebug ? "" : "release-"));
			if(aneTempPath==null) {
				cancelNotification("-packaging");
				displayANEsTempPathError(aneTempPath);
				return Promise.reject({success: false});
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
		return new Promise((resolve, reject) => {
			process.onDidExit((status) => {
				cancelNotification("-packaging");
				if (nova.inDevMode()) {
					consoleLogObject(status);
				}
				if(status==0) {
					if(forRunOrDebug==false) {
						if(taskConfig["as3.export.deleteAfterSuccess"]!==false) {
							nova.fs.rmdir(nova.path.join(basePath, releaseFolder));
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
					}
					// Check for warnings
					// For Android, if permissions were not set properly, this will show (@NOTE could check earlier)
					if(stdout.indexOf("Warning: Application has not specified its permission requirements in application.xml")!=-1) {
						showNotification("Packaging warning!","Application has not specified its permission requirements in application.xml which may cause it not to run properly on the device!","I will fix!","-package-warning");
					}
					resolve({ success: true, packageName: outputFile });
				} else {
					var result = resolveStatusCodeFromADT(status, stderr);
					var message = result.message;
					if (nova.inDevMode()) {
						console.log("Final RESULT: ");
						console.log("STDOUT: " + stdout);
						console.log("STDERR: " + stderr);
					}
					var shortError = "Unknown error";
					if(stderr.length==0) {
						shortError = stdout;
					} else {
						shortError = (stderr.split("\nusage:")[0] || stderr).trim();
						var title = "Export Package Failed";
						if(forRunOrDebug) {
							title = "Issue Packaging for Device Run";
						}
						if(shortError.indexOf("-arch must be followed by (armv7 | x86)")!=-1) {
							shortError += "\n\n" + "Please select an appropriate architecture in your Task setting.";
							if(archType=="armv8") {
								let currentAIRSDKVersion = parseFloat(nova.workspace.context.get("currentAIRSDKVersion"));
								if(currentAIRSDKVersion<33.2) {
									shortError += "\n\n" + "Please make sure you are using AIR SDK 33.1.1.533 or greater!";
								}
							}
						}
					}

					nova.workspace.showErrorMessage(title + "\n\n" + message + "\n\n" + shortError);
					reject({ success: false, message, stderr });
				}
			});
		});
	}

	/**
	 * Builds the SWF for the project
	 * @param {string} projectType - Which type of build, "air|airmobile|flex"
	 * @param {Object} taskConfig - Values from the Task (converted to an object array of the elements needed)
	 * @param {boolean} packageAfterBuild - If true, we are going to return the process of building
	 * @param {boolean} returnAsProcess - If we should return as process like a packageAfterBuild? Not really used
	 */
	build(projectType, taskConfig, packageAfterBuild = false, returnAsProcess = false) {
		var runMode = taskConfig["actionscript3.request"];

		const configValues = getConfigsForBuildAndPacking(taskConfig, true);

		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		if(flexSDKBase==null) {
			nova.workspace.showErrorMessage("Please configure the Flex SDK base, which is required for building this type of project");
			return null;
		}

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
				this.copyAssetsOf(nova.workspace.path+"/html-template", destDir).then(() => {
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

/** @NOTE, checks the source files if things have changed... Might need this at some point
if(doesFileExist(destDir + "/" + exportName)) {
	console.log("Hey! The output file already exists?! Did anything sources get modified?");
	if(checkIfModifiedAfterFileDate(destDir + "/" + exportName, copyDirs, fileExtensionsToExclude, fileNamesToExclude, )) {
		console.log("Yep, stuff changed... should copy!");
	} else {
		console.log("Dude, what a waste! I don't need to copy this!!!");
	}
}
*/
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
					return this.copyAssetsOf(copyDir, destDir);
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
					displayANEsTempPathError(aneTempPath);
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
	 * @param {Object} taskConfig - The Task's configs
	 */
	debugRun(projectType, projectOS, taskConfig) {
		const configValues = getConfigsForBuildAndPacking(taskConfig, true);

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
		let anes = configValues.anes;

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
			if(taskConfig["as3.launch.type"]=="browser") {
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
				let launchType = task["as3.launch.type"];

				if(launchType=="ruffle") {
					nova.workspace.showErrorMessage("Using debugger with Ruffle is unsupported. Please change launch type to Flash Player or Browser. Or disable the options to `Enable running with Debugger`.");
					return null;
				}

				fpApp = nova.config.get("as3.flashPlayer.standalone");
				debugArgs.program = destDir + "/" +  exportName;
				debugArgs.runtimeExecutable = fpApp;
			}
		} else {
			// If launching on device is selected, let this function figure it out!
			if(taskConfig["as3.task.launchMethod"]=="device") {
				if(taskConfig["as3.task.deviceType"]=="network") {
					console.info("Not implemented yet... shouldn't be too long");
				} else {
					// return this.runOnDeviceViaUSB(projectType, projectOS, taskConfig, true);
				}
				return this.runOnDeviceViaUSB(projectType, projectOS, taskConfig, true);
			}

			var profileType = this.getProfileType(taskConfig, projectType, appXMLLocation);
			debugArgs.profile = profileType;

			if(projectType=="airmobile") {
				var simulatorDevice = taskConfig["as3.task.deviceToSimulate"];
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

			if(anes && anes.length>0) {
				var aneTempPath = determineAneTempPath();
				if(aneTempPath==null) {
					displayANEsTempPathError(aneTempPath);
					return null;
				}
				debugArgs.exdir = aneTempPath + "/";
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
	 * Used to determine which device to try and run on. Makes a palette choice option showing the device's
	 * UUID and name. If the user enters a valid device, it will modify the `taskConfid` with the approriate
	 * value to launch on a device.
	 * @param {Array} devices - Results from a call to get the devices for that platform
	 * @param {Object} taskConfig - The Task's configs
	 * @returns {Object} - An update `taskConfig` with the selected UUID of the device to launch on
	 */
	selectDeviceToLaunchOn(devices, taskConfig) {
		return new Promise((resolve, reject) => {
			var deviceChoice = quickChoicePalette(devices.map(d => `${d.uuid} - ${d.model}`), "Launch on which device?").then((choice) => {
				if(choice) { // If there was a choice made
					let deviceSplit = choice.value.split(" - ");
					if(deviceSplit.length>0) {
						let device = deviceSplit[0].trim();
						if(device!=null && device!="") {
							taskConfig["as3.task.deviceID"] = device;
							resolve(taskConfig);
						}
					}
				}
			});
		});
	}

	/**
	 * Tries to figure out how to launch on a device. First checking available devices. Then if there is
	 * no preferred device, launch on the first if there's one device, otherwise ask which one. If there
	 * is a preferred device, check if we found it, other wise ask what to do. If there are no devices
	 * either, we'll ask too.
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {Object} taskConfig - The Task's configs
	 */
	resolveDeviceSelection(projectOS, taskConfig) {
		return getSelectedDevices(projectOS).then((devices) => {
			let deviceId = taskConfig["as3.task.deviceID"];

			// console.log(" WANT DEVICE: [[ " + deviceId);
			// // Adding fake devices to test selection and fallbacks
			// devices.push({ uuid: "123456789ABCDEF", model: "Fake Device 1"} );
			// devices.push({ uuid: "ABCDEF123456789", model: "Fake Device 3"} );
			// consoleLogObject(devices);

			// If no preferred devices are set and we have devices, then we just default to first or ask which one and return!
			if(!deviceId && devices.length>0) {
				if(devices.length==1) { // Only found one, use that!
					taskConfig["as3.task.deviceID"] = devices[0].uuid;
					return { taskConfig, devices };
				} else if(devices.length>1) { // Found multiple devices, ask which one!
					return this.selectDeviceToLaunchOn(devices, taskConfig).then(() => ({ taskConfig, devices }));
				}
			} else {
				let foundPreferredDevice = devices.find(d => d.uuid==deviceId);
				if(foundPreferredDevice==undefined || devices.length==0) {
					let message;
					let deviceButtons = ["🔄 Recheck", "🖥️ Run in Simulator", "❌ Cancel"];
					if(nova.inDevMode()) {
						deviceButtons.push("DEV CHEAT");
					}
					if (devices.length === 0) {
						// No devices at all — then we don't have any other options than those above
						message = "No connected " + displayDeviceType(projectOS) + " devices were found. ";
					} else {
						// If there was a preferred device that wasn't found
						if(deviceId) {
							message = "Your preferred device was not found. "
						}
						if(devices.length==1) {
							message += "However, a device " +  devices[0].uuid + " - " + devices[0].model + " was found. ";
							deviceButtons.unshift("📱Use found device");
						} else if(devices.length>1) {
							message += "However, other devices were found. ";
							deviceButtons.unshift("📲 Select device");
						}
					}

					return new Promise((resolve) => {
						nova.workspace.showActionPanel(message, { buttons: deviceButtons }, (result) => {
							switch (deviceButtons[result]) {
								case "DEV CHEAT": { // Only use for testing/developing extension
									taskConfig["as3.task.deviceID"] = "no devices[0].uuid";
									resolve({taskConfig, devices});
									break;
								}
								case "🔄 Recheck": {
									resolve(this.resolveDeviceSelection(projectOS, taskConfig));
									break;
								}
								case "🖥️ Run in Simulator":
									taskConfig["as3.task.launchMethod"] = "simulator";
									resolve({taskConfig, devices});
									break;
								case "📱 Use found device": {
									taskConfig["as3.task.deviceID"] = devices[0].uuid;
									resolve({taskConfig, devices});
									break;
								}
								case "📲 Select device": {
									resolve(this.selectDeviceToLaunchOn(devices, taskConfig).then(() => resolve({taskConfig, devices})));
									break;
								}
								default: {
									resolve(null);
									break;
								}
							}
						});
					});
				}
			}
			// Preferred device was found and ready to go
			return {taskConfig, devices} ;
		});
	}

	/**
	 * Hanldes the actual call to launch the debugger
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {string} flexSDKBase - The location of the SDK base
	 * @param {string} anes - The location of the extracted ANEs that the app used
	 * @param {boolean} connect - If it should be connected via USB
	 * @param {string} debugRequest - How the debugger should be connected
	 */
	launchSWFDebug(projectOS, flexSDKBase, anes, connect = true, debugRequest = "attach") {
		var connectIP = "127.0.0.1";
		var connectPort = 7936;

		var base = nova.path.join(nova.extension.path, "debugger");

		var actionArgs = [];
		// Pass the Flex SDK
		actionArgs.push("-Dflexlib=" + flexSDKBase+"/frameworks");
		if(isWorkspace()) { // For workspaces, pass the folder
			actionArgs.push("-Dworkspace=" + nova.workspace.path);
		}
		//uncomment to debug the SWF debugger JAR
		// actionArgs.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005");
		actionArgs.push("-cp");
		actionArgs.push("" + base + "/bin/*:" + base + "/bundled-debugger/*");
		actionArgs.push("com.as3mxml.vscode.SWFDebug");
		// actionArgs.push("--connect", connectIP + ":" + connectPort);

		var debugArgs = {};
		debugArgs.request = "attach";
		debugArgs.port = connectPort;
		if(anes) {
			debugArgs.exdir = anes
		}

		debugArgs.connect = connect;
		debugArgs.platform = projectOS;

		var action = new TaskDebugAdapterAction("actionscript3");
		action.adapterStart = "launch"; // We want Nova to launch it!
		action.args = actionArgs;
		action.command = "/usr/bin/java";
		action.cwd = nova.workspace.path;

		action.debugArgs = debugArgs;
		action.debugRequest = debugRequest;

		return action;
	}

	/**
	 * Handles deciding how to launch the app and then the debugger.
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {string} flexSDKBase - The location of the SDK base
	 * @param {string} deviceId - The ID used to launch on the device
	 * @param {string} debugPackageId - The Package ID of the the app to launch
	 * @param {string} anes - The location of the extracted ANEs that the app used
	 */
	launchDebugViaUSB(projectOS, flexSDKBase, deviceId, debugPackageId, anes) {
		const androidSDKBase = determineAndroidSDKBase();
		let launchCommand, launchArgs;

		if(projectOS=="ios") {
			/** @NOTE, do we add an option to use ios-deploy for really old Xcode? */
			launchCommand = "/usr/bin/xcrun";
			launchArgs = [
				"devicectl",
				"device",
				"process",
				"launch",
				"--device",	deviceId,
				debugPackageId
			];

			// Launch the app, don't wait for it and attach debugger!!
			return getProcessResults(launchCommand, launchArgs).then((result) => {
				// console.log("LAUNCHING ON IOS DEVICE BY USB!");
				// consoleLogObject(result);
				if(result.status==0) {
					// console.log("HOLD ON! for a bit....");
					// Wait for runtime to connect?
					return new Promise(r => setTimeout(r, 100)).then(() => {
						return this.launchSWFDebug(projectOS, flexSDKBase, anes, true, "attach");
					});
				} else {
					return Promise.reject(new Error("SOmething went wrong with the launchypoo"));
				}
			});
		} else if(projectOS=="android") {
			var adb = androidSDKBase + "/platform-tools/adb";
			// var adb = flexSDKBase + "/lib/android/bin/adb";
			// Setup port forwarding on Android...
			return getProcessResults(adb, [ "forward", "tcp:7936", "tcp:7936"]).then(() => {
				// Now, enable AIR debugger mode on device...
				return getProcessResults(adb, [ "shell", "setprop", "debug."+debugPackageId, "1"]).then(() => {
					// Now we can launch the app!
					return getProcessResults(adb,  [
							"shell", "am", "start",
							"-n", debugPackageId + "/.AIRAppEntry",
							"--ez", "debuggable", "true",
							"--ez", "remoteDebug", "true",
							"--ez", "port", "7936"
						], "", {}, true).then((result) => {
							// console.log("Launched ANDROID.");
							// console.log("RESULTS FROM LAUNCH...");
							// consoleLogObject(result);
							if(result.status==0) {
								// Wait for runtime to connect?
								return new Promise(r => setTimeout(r, 1000)).then(() => {
									return this.launchSWFDebug(projectOS, flexSDKBase, anes, true, "attach");
								});
							} else {
								return Promise.reject(new Error("Something went wrong with the launching on Android"));
							}
					});
				});
			}).catch((error) => {
				return Promise.reject(error);
			});
		}
	}

	/**
	 * Handles launching on the device, selecting it, packaging, installing then launching.
	 * @param {string} projectType - Which type of project, "air|airmobile|flex"
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {Object} taskConfig - The Task's configs
	 * @param {boolean} debugMode - `true` if we want to do this as a debug, otherwise `false`
	 */
	runOnDeviceViaUSB(projectType, projectOS, taskConfig, debugMode = false) {
		console.log("------------------------- LAUNCH ON DEVICE CALLED _--------------------");
		let command = "";
		let args = [];

		const configValues = getConfigsForBuildAndPacking(taskConfig, true);
		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		let destDir = configValues.destDir;
		if(doesFolderExist(destDir)==false) {
			nova.workspace.showErrorMessage("Project has not been built yet. Either build manually, or enable \"Build before running\" in the Task's Run options");
			return;
		}

		let destDirRelative = nova.path.relative(destDir,nova.workspace.path);
		let appXMLName = configValues.appXMLName;
		let exportName = configValues.exportName;
		let mainSrcDir = configValues.mainSrcDir;
		let certificate = configValues.certificate;
		// Only needed for AIR:
		let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);
		let anes = configValues.anes;
		//
		let packageName = configValues.packageName;
		if(taskConfig["as3.export.basename"] && taskConfig["as3.export.basename"].trim()!="") {
			packageName = taskConfig["as3.export.basename"];
			if(packageName.endsWith(".air")==false) {
				packageName += ".air";
			}
		}
		if(projectOS=="ios") {
			packageName = packageName.replace(/\.air$/, ".ipa");
		} else if(projectOS=="android") {
			packageName = packageName.replace(/\.air$/, ".apk");
		}

		// Later in thens...
		var deviceHandle = null;
		var debugPackageId = "";

		// Used if packaging and getting the results
		var packageFileName = null;

		// Quick checks before even checking devices.
		// iOS - Make sure we have a Certificate and Provisioning Profile!!
		if(projectOS=="ios") {
			let hasCertificate = (certificate==null) ? false : true;
			let provisioningProfile = taskConfig["as3.packaging.provisioningFile"];
			let hasProvisioningProfile = (provisioningProfile==undefined || provisioningProfile==null)  ? false : true;

			if(hasCertificate==false || hasProvisioningProfile==false) {
				let message = "Even when testing on an iOS device, your project and/or Tasks will need to have";
				message += (hasCertificate==false && hasProvisioningProfile==false) ? " both" : "";
				message += (hasCertificate==false)                                  ? " an Apple iOS developer certificate converted into P12 format set as the Certificate" : "";
				message += (hasCertificate==false && hasProvisioningProfile==false) ? " and" : "";
				message += (hasProvisioningProfile==false)                          ? " a Provisioning file value set." : ".";
				nova.workspace.showErrorMessage(message);
				return;
			}
		}

		var deviceId = taskConfig["as3.task.deviceID"];

		var needToCopyAssets = true;
		var needToPackage = true;
		var needToInstall = true;
		var needToClearAppData = taskConfig["as3.task.clear"];

		var tempOutputFolder;
		// Let's make sure we have a temp folder to dump stuff to
		var tempDirBase = determineTempPath();
		if(tempDirBase==null) {
			displayTempPathError(tempDirBase);
			return Promise.reject(new Error("Issues with temp path"));
		}

		var launcherMetadata = this.loadLaunchMetadata();
		var packageHash;

		var marquee = "\"" + nova.workspace.config.get("workspace.name") + "\" for " + (debugMode ? "debugging" : "running") + " on a " + (projectOS=="ios" ? "Apple iOS" : "Google Android") + " device."

		const androidSDKBase = determineAndroidSDKBase();
		const adb = androidSDKBase + "/platform-tools/adb";
try {
		return this.resolveDeviceSelection(projectOS, taskConfig).then((result) => {
			if(!result) {
				return null;
			}

			taskConfig = result.taskConfig;
			// If we resolved to the simulator, jump to that...
			if(taskConfig["as3.task.launchMethod"]=="simulator") {
				if(debugMode) {
					return this.debugRun(projectType, projectOS, taskConfig);
				} else {
					return this.run(projectType, projectOS, taskConfig);
				}
			}

			// Otherwise, let's try the device
			var devices = result.devices;
			deviceId = taskConfig["as3.task.deviceID"];
			let deviceInfo = devices.find(d => d.uuid==deviceId);
			if(deviceInfo) {
				deviceHandle = deviceInfo.transportID; // Needed for iOS stuff
			}

			// We'll need to copy the build to a temporary folder as we need to modify the app.xml a bit
			// Make sure that the temp folder is available!
			tempOutputFolder = nova.path.join(tempDirBase, destDirRelative); // Change to temp dir + destDir
			if(ensureFolderIsAvailable(tempOutputFolder)==false) {
				displayTempPathError(tempDirBase);
				return Promise.reject(new Error("Issues with temp path output file"));
			}

			// At this point, the package could have been built previously. If nothing has changed in the
			// export folder since the package was made then we really don't need to copy the files to package them
			if(doesFileExist(tempOutputFolder + "/../" + packageName)) {
				// If there's a package, first check if the compiled SWF has changed.
				if(checkIfFileWasModifiedAfterOther(destDir + "/" + exportName, tempOutputFolder + "/../" + packageName)==false) {
					// Then check if anything changes in either the destDir or the tempOutputFolder after the package was made,  has changed since.
					if(checkIfModifiedAfterFileDate(tempOutputFolder + "/../" + packageName,[destDir, tempOutputFolder], fileExtensionsToExclude, fileNamesToExclude)==false) {
						needToCopyAssets = false;
					}
				}
			}

			// If we have ANEs, we also have to make sure they are up-to-date and they are in the temp folder too!
			// Since this is not included in the temp build folder, we'll handle this now...
			if(anes && anes.length>0) {
				var aneTempPath = determineAneTempPath();
				if(aneTempPath==null) {
					displayANEsTempPathError(aneTempPath);
					return Promise.reject(new Error("Issues with determining temp ANE path"));
				}

				if(doesFolderExist(aneTempPath + "-packed/")==false) {
					// Make folder for packed ANEs when building.
					if(makeOrClearFolder(aneTempPath+"-packed")==false) {
						return Promise.reject(new Error("Issues with temp ANE path"));
					}
				}

				anes.forEach((ane) => {
					var tempAnePath = aneTempPath + "-packed/"+ane.split('/').pop();
					var realAnePath = nova.workspace.path+"/"+ane;
					// Only copy if the file doesn't exist or the original has been modified after this temp one
					if(doesFileExist(tempAnePath)==false || checkIfFileWasModifiedAfterOther(realAnePath, tempAnePath)) {
						var aneDest = ane.substring(ane.lastIndexOf("/"),ane.length);
						try {
							nova.fs.copy(nova.workspace.path+"/"+ane,aneTempPath + "-packed/"+ane.split('/').pop());
						} catch(error) {
							return Promise.reject(new Error("Error copying ANE to temp ANE path"));
						}
					}
				});
			}

			return;
		}).then(() => { // If we need to copy the files for packaging, do so, otherwise, check the existing files to get the package name
			if(needToCopyAssets) {
				return this.copyAssetsOf(destDir, tempOutputFolder, true).then(() => {
					// Now, that we copied the files, modify the app.xml so both a real release and the debug can be installed, and our debug certificate doesn't interfere.
					let appXMLLocation = nova.path.join(tempOutputFolder, appXMLName);
					let appXML = getStringOfFile(appXMLLocation);
					if(appXML==null) {
						return Promise.reject(new Error("Failed modifying APP XML for debug packaing at: " + appXMLLocation));
					}

					try {
						// On Android, let's replace the app.xml <id> so we can use our debug certificate
						if(projectOS=="android") {
							appXML = appXML.replace("</id>",".DEBUG</id>");
						}
						debugPackageId = appXML.match(/<id>([^<]*)<\/id>/i)[1];
						// If "No AIR Flare" is not turned on or set, we need to adjust the package id that we will use!
						if(projectOS=="android") {
							var noAndroidAirFlair = taskConfig["as3.deployment.noFlair"];
							if(noAndroidAirFlair==undefined || noAndroidAirFlair==false) {
								debugPackageId = "air." + debugPackageId; // The package will have AIR flair
							}
						}
						// Replace the app.xml <name> for the debug version for both iOS and Android
						appXML = appXML.replace("</name>"," Debug</name>");
						var appXMLFile = nova.fs.open(appXMLLocation, "w");
						appXMLFile.write(appXML);
						appXMLFile.close();
					} catch(error) {
						console.log("*** ERROR: APP XML file! error: ",error);
						consoleLogObject(error);
						return Promise.reject(new Error("Error handling app descriptor at " + newAppXMLFile + ". Please check it's contents that it is valid."));
					}
					return;
				});
			} else {
				// Since this should have been modified on a previous build, let's get the debugPackageId:
				let appXMLLocation = nova.path.join(tempOutputFolder, appXMLName);
				let appXML = getStringOfFile(appXMLLocation);
				if(appXML==null) {
					return Promise.reject(new Error("Failed modifying APP XML for debug packaing at: " + appXMLLocation));
				}

				debugPackageId = appXML.match(/<id>([^<]*)<\/id>/i)[1];
				// If "No AIR Flair" is not turned on or set, we need to adjust the package id that we will use!
				if(projectOS=="android") {
					var noAndroidAirFlair = taskConfig["as3.deployment.noFlair"];
					if(noAndroidAirFlair==undefined || noAndroidAirFlair==false) {
						debugPackageId = "air." + debugPackageId; // The package will have AIR flair
					}
				}

				// Now, check if there is a package already made, if so, compare with the last hash that was installed on the device.
				if(nova.fs.stat(tempOutputFolder + "/../" + packageName)) {
					md5HashBinaryFile(tempOutputFolder + "/../" + packageName).then((hash) => {
						try {
							if(hash==launcherMetadata.devices[deviceId][debugMode ? "debug" : "run"]["md5"]) {
								needToPackage = false;
							}
						} catch(error) {
							if(nova.inDevMode()) {
								consoleLogObject(error);
							}
						}
						return;
					});
				} else {
					return;
				}
			}
		}).then(() => { // If we need to package, we need the certificate and password
			if(needToPackage) {
				showNotification("📦 Packaging...","Trying to package " + marquee,"Please wait...", "-runOnDevice");
				if(projectOS=="android") {
					return Promise.resolve({
						certificateLocation: nova.extension.path + "/Defaults/android-debug.p12",
						password: "password"
					});
				} else {
					// iOS needs to use user's certificate, no way around it.
					let certificateLocation = taskConfig["as3.packaging.certificate"];
					// and we need their password...
					return determineCertificatePassword(certificateLocation).then((result) => {
						return {
							certificateLocation: certificateLocation,
							password: result.password
						};
					});
				}
			} else {
				return { certificateLocation: "", password: "" };
			}
		}).then(({ certificateLocation, password }) => { // If we need to package, do so, otherwise check if it's already installed on the device
			if(needToPackage) {
				return this.package(projectType, taskConfig, destDirRelative, certificateLocation, password, true, debugMode).then((results) => ({ results }));
			} else {
				return checkIfInstalledOnDevice(projectOS, deviceId, debugPackageId).then((installed) => {
					if(installed) {
						needToInstall = false;
					}
					return { results: { success: true, packageName: tempDirBase + "/" + packageName } };
				})
			}
		}).then(({ results }) => { // If we need to clear app data, do it now. Android can just clear data, iOS needs to uninstall :-(
			if(needToClearAppData) {
				if(projectOS=="android") { // Since we can just zap the data with Android,
					return getProcessResults(adb, ["shell","pm","clear",debugPackageId]).then(() => ({ results }));
				}
				if(projectOS=="ios") {
					// For a simulator, I think we can do simctl uninstall/install
					return getProcessResults("/usr/bin/xcrun", [
							"devicectl",
							"device",
							"uninstall",
							"app",
							"--device",	deviceId,
							debugPackageId
					]).then(() => {
						needToInstall = true;
						return { results };
					});
				}
			}
			return { results };
		}).then(({ results }) => { // If we need to install, do so, otherwise let's just move on!
			if(needToInstall) {
				// Check if the install worked
				if(results.success==false) {
					return Promise.reject(new Error("Problem building package to install on device."));
				}

				var installDeviceId = deviceId;
				// For some reason, iOS uses the "device handle" to install/launch instead of the UUID like Android
				if(projectOS=="ios") {
					installDeviceId = deviceHandle.toString();
				}

				showNotification("📲  Installing...","Trying to install " + marquee,"Please wait...", "-runOnDevice");
				packageFileName = results.packageName;
				command = flexSDKBase + "/bin/adt";
				args = [
					"-installApp",
					"-device", installDeviceId,
					"-package", packageFileName,
					"-platform", projectOS
				];

				return getProcessResults(command, args, "", {}, true).then(() => ({ debugPackageId }));
			} else {
				return { debugPackageId };
			}
		}).then(() => {
			return md5HashBinaryFile(tempOutputFolder + "/../" + packageName).then((hash) => {
				packageHash = hash;
				this.updateLauncherMetadata(launcherMetadata, debugMode, deviceId, packageHash, Date.now(), debugPackageId);

				showNotification("🏃 Running...", "Trying to run " + marquee,"", "-runOnDevice");
				// FINALLY!!! We can really launch this thing!!
				if(debugMode) {
					return this.launchDebugViaUSB(projectOS, flexSDKBase, deviceId, debugPackageId, anes);
				} else { // Regular old run on a device... How nice...
					let launchCommand, launchArgs;
					if(projectOS=="ios") {
						/** @NOTE, do we add an option to use ios-deploy for really old Xcode? */
						launchCommand = "/usr/bin/xcrun";
						launchArgs = [
							"devicectl",
							"device",
							"process",
							"launch",
							"--console",
							"--device",	deviceId,
							debugPackageId
						];
					} else if(projectOS=="android") {
						launchCommand = adb;
						launchArgs = [
							"shell",
							"monkey",
							"-p",
							debugPackageId,
							"-c",
							"android.intent.category.LAUNCHER",
							"1"
						];
					}
					return new TaskProcessAction(launchCommand, {
						shell: true,
						args: launchArgs,
						env: {}
					});
				}
			});
		}).catch(error => {
			cancelNotification("-runOnDevice");
			if(nova.inDevMode()) {
				console.error("Launch on device error: ");
				console.error(error);
				console.error(error.stack);
			}
			var message = "";
			if(error.status) {
				var result = resolveStatusCodeFromADT(error.status, error.stderr);
				message = result.message;
				if(error.stderr.match(/adb server version \(([0-9]*)\) doesn't match this client \(([0-9]*)\); killing/)) {
					message += "\n\nThe version of ADB does not match with the installed device. For SWF-Debug to work, these need to match up. You may need to update your Android SDK with:\n`sdk/cmdline-tools/latest/bin/sdkmanager --update`";
				}
				nova.workspace.showErrorMessage("Issue Installing Package for Device Run" + "\n\n" + message + "\n\nADT Error: " + error.stderr);
			} else {
				message = (error.message) ? error.message : error;
				nova.workspace.showErrorMessage("Issue Installing Package for Device Run" + "\n\n" + message + "\n\nError: " + error.stderr);
			}
			return Promise.reject(new Error("RETURNING Issue Installing Package for Device Run"));
		});
} catch(error) { console.error("runOnDeviceViaUSB() Issue!"); console.error(error.message); console.error(error.stack); return Promise.reject(new Error("Try/Catch on whole function failed...")); }
	}

	/**
	 * Runs the project using Nova's task system
	 * @param {string} projectType - Which type of project, "air|airmobile|flex"
	 * @param {string} projectOS - Which type of OS the project uses, "null|ios|android"
	 * @param {Object} taskConfig - The Task's configs
	 */
	run(projectType, projectOS, taskConfig) {
		let command = "";
		let args = [];

// console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=");
// consoleLogObject(taskConfig);
// console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=");

		const configValues = getConfigsForBuildAndPacking(taskConfig, true);
		let flexSDKBase = determineFlexSDKBase(configValues.flexSDKBase);
		let destDir = configValues.destDir;
		let appXMLName = configValues.appXMLName;
		let exportName = configValues.exportName;
		let mainSrcDir = configValues.mainSrcDir;
		// Only needed for AIR:
		let appXMLLocation = nova.path.join(mainSrcDir, appXMLName);
		let anes = configValues.anes;

		// console.log(" DEST DIR: " + destDir);
		// If we are running Flash
		if(projectType=="flash") {
			let fpApp;
			let launchType = taskConfig["as3.launch.type"];
			if(launchType=="browser") {
				fpApp = nova.config.get("as3.flashPlayer.browser");

				command = getExec(fpApp);
				if(command==null) {
					nova.workspace.showErrorMessage("Flash Player Run/Debug -> " + (launchType=="ruffle" ? "Ruffle" : "Standalone Flash Player") + " Error\n\nProblem finding executable at " + fpApp);
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
				fpApp = (launchType=="ruffle" ? nova.config.get("as3.flashPlayer.ruffle") : nova.config.get("as3.flashPlayer.standalone") )

				command = getExec(fpApp);
				if(command==null) {
					nova.workspace.showErrorMessage("Flash Player Run/Debug -> " + (launchType=="ruffle" ? "Ruffle" : "Standalone Flash Player") + " Error\n\nProblem finding executable at " + fpApp);
					return null;
				}

				if (nova.inDevMode()) {
					console.log(" *** Attempting to Run Flash Player application with [[" + command + "]] ARG: \n");
					consoleLogObject(args);
				}
				args.push(destDir + "/" +  exportName);
			}
		} else { // Otherwise, we are running through AIR, possibly on a device!
			// @NOTE See https://help.adobe.com/en_US/air/build/WSfffb011ac560372f-6fa6d7e0128cca93d31-8000.html
			// To launch ADL, we need to point it to the "-app.xml" file
			command = flexSDKBase + "/bin/adl";

			if(taskConfig["as3.task.launchMethod"]=="device") {
				if(taskConfig["as3.task.deviceType"]=="network") {
					console.info("Not implemented yet... shouldn't be too long");
				} else {
					// return this.runOnDeviceViaUSB(projectType, projectOS, taskConfig, false);
				}
				return this.runOnDeviceViaUSB(projectType, projectOS, taskConfig, false);
			} else {
				if(projectType=="airmobile") {
					var screenSize = this.getFormattedScreenSize(taskConfig["as3.task.deviceToSimulate"]);
					if(screenSize==null || screenSize==false) {
						return null;
					}
					args.push("-screensize");
					args.push(screenSize);
				}

				args.push("-profile");
				// Check if the Task set's the profile or if we need to check in the app-xml
				var profileType = this.getProfileType(taskConfig, projectType, appXMLLocation);
				args.push(profileType);

				// ADL wants the directory with the ANEs
				if(anes && anes.length>0) {
					var aneTempPath = determineAneTempPath();
					if(aneTempPath==null) {
						displayANEsTempPathError(aneTempPath);
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
	}

	/**
	 * Copies the files from one place to another.
	 *
	 * @param {string} src - The source of the files to copy
	 * @param {string} dest - The destination folder location
	 * @param {boolean} forceAll - Default is `false`. If true, it will copy all files, ignoring any "ignore" settings
	 * @returns {Promise} - A resolve if everything copies, otherwise a reject with an error message
	 */
	copyAssetsOf(src, dest, forceAll = false) {
		return new Promise((resolve, reject) => {
			try {
				// Get all the entries in this folder
				const entries = nova.fs.listdir(src);
				const copyPromises = entries.map(filename => {
					// Check if it's a file that doesn't need to be included when packaging in general. (We also remove user specifics later)
					if(forceAll || shouldIgnoreFileName(filename,fileNamesToExclude, fileExtensionsToExclude)==false) {
						const currPath = nova.path.normalize(nova.path.join(src, filename)); // @NOTE Had to add normalize, some files wouldn't copy to temp without it!
						const stats = nova.fs.stat(currPath);
						if (!stats) {
							return Promise.reject(new Error(`Unable to stat path: ${currPath}`));
						}

						const destPath = nova.path.normalize(nova.path.join(dest, filename)); // @NOTE Had to add normalize, some files wouldn't copy to temp without it!
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
										return this.copyAssetsOf(resolvedPath, destPath, forceAll);
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
							return this.copyAssetsOf(currPath, destPath, forceAll);
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
		var flexProperties = getStringOfWorkspaceFile(".flexProperties", false);
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
		var flexLibProperties = getStringOfWorkspaceFile(".flexLibProperties",false);
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
			if(isAIRSDKInstalled(flexSDKAskedFor)==false) {
				var noticePromise;
				var notice = nova.notifications.cancel("as3-import-missing-sdk");
				notice = new NotificationRequest("as3-import-missing-sdk");
				notice.title = "Check SDK Setting";
				notice.body = "The project is looking for the Flex SDK of:\n" + flexSDKAskedFor + "\n\nBut it is not installed. Do you want to... ";
				notice.actions = ["Install an SDK", "Remove this setting", "Ignore for now"];
				noticePromise = nova.notifications.add(notice);
				noticePromise.then((reply) => {
					switch(reply.actionIdx) {
						case 0: {
							installSDKPrompt(flexSDKAskedFor);
							break;
						}
						case 1: {
							nova.workspace.config.remove("as3.compiler.sdk");
							break;
						}
					}
				});
			}

			nova.workspace.config.set("as3.compiler.sdk",flexSDKAskedFor);
		}

		// Add a value to keep track that we imported the project, so it doesn't keep asking everytime the project is opened
		nova.workspace.config.set("as3.project.importedFB","done");

		// Let the context know that it's done.
		nova.workspace.context.set("importingProjectSetting",false);
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

		// We're going to convert our "config" to an array so that we can pass them to our run/build/clean
		// and package so that even if we launch them manually without Nova's Build/Run and we can
		// manually package them.
		var taskConfig = {};

		var getConfigs = [
			// Needed for building, running and packaging
			"as3.compiler.sdk",
			"as3.packaging.anes",
			"as3.packaging.customANEs",
			"as3.task.applicationFile",
			"as3.task.launchMethod",
			"as3.task.output",
			"as3.task.clear",
			"as3.task.packagingMethod",

			// Needed for packaging!
			"as3.deployment.arch",
			"as3.deployment.noFlair",
			"as3.deployment.platfromsdk",
			"as3.deployment.target",
			"as3.export.basename",
			"as3.export.deleteAfterSuccess",
			"as3.export.folder",
			"as3.packaging.certificate",
			"as3.packaging.customSignature",
			"as3.packaging.customContents",
			"as3.packaging.excludedFiles",
			"as3.packaging.provisioningFile",
			"as3.packaging.timestamp",
			"as3.packaging.type",
			"as3.target",

			// For Flash Browser runs
			"as3.launch.type",

			// For Mobile runs
			"as3.run.withDebugger",
			"as3.task.deviceID",
			"as3.task.deviceToSimulate",
			"as3.task.profile",
			"as3.task.launchOnDevice",
			"as3.task.deviceType",

			// For Library Builds
			"as3.lib.classEntries",
			"as3.lib.nsm.namespace",
			"as3.lib.nsm.manifest",
			"as3.lib.resource.dest",
			"as3.lib.resource.source",

			// For Other Builds
			"actionscript3.request",
			"as3.buildtype"
		]

		// Lop through the configs to see if we got them
		getConfigs.forEach((configItem) => {
			if(config.get(configItem)) {
				taskConfig[configItem] = config.get(configItem);
			}
		})
		// consoleLogObject(taskConfig);

		// Unless Tasks were made by importing from Flash Builder, they didn't include this.
		if(!taskConfig["as3.target"]) {
			taskConfig["as3.target"] = data.os;
		}

		if(action==Task.Build) {
			if(data.type=="library") {
				return this.buildLibrary(taskConfig);
			} else {
				/** @TODO, should this be a different config, like build mode with or without debug? */
				return this.build(data.type, taskConfig);
			}
		} else if(action==Task.Run) {
			/**
			 * @TODO We could check here to see if there were changes in the source and force a build
			 * similar to how FB had that option
			if(config.get["<<Check files before running key>>"]) {
				// Need to get configsForBuild here...
				if(checkIfModifiedAfterFileDate(destDir + "/" + exportName,[ mainSrcDir, <lib dirs>, <ane dir> ], fileExtensionsToExclude, fileNamesToExclude)==false) { // May need to modify this to include the files to ignore
					console.warn("  Source dir is unchanged...")
				} else {
					console.warn("  Source dir has been changed so it really needs building!!");
					this.build(data.type, taskConfig).then((result) => {
						// Fill in the blanks
						if(config.get("as3.run.withDebugger")) {
							return this.debugRun(data.type, data.os, taskConfig);
						} else {
							return this.run(data.type, data.os, taskConfig)
						}
					}).catch(error) {
						return null;
					})
				}
			}
			*/

			if(config.get("as3.run.withDebugger")) {
				return this.debugRun(data.type, data.os, taskConfig);
			} else {
				return this.run(data.type, data.os, taskConfig)
			}
		} else if(action==Task.Clean) {
			const configValues = getConfigsForBuildAndPacking(taskConfig, true);
			return new TaskCommandAction("as3.clean", { args: [configValues.destDir] });
		}
	}
}
