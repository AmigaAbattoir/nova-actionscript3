const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { consoleLogObject, showNotification, doesFileExist, doesFolderExistAndIsAccessible, ensureExpandedUserPath, isWorkspace, getWorkspaceOrGlobalConfig, getStringOfFile, quickChoicePalette } = require("./nova-utils.js");

exports.installSDKPrompt = function(specificSDK = "") {
	return new Promise((resolve, reject) => {
		nova.workspace.showFileChooser(
			"Select " + (specificSDK!="" ? "the " + specificSDK : "an AIR/FLEX" ) + " SDK folder",
			{ prompt: "Select SDK", allowFiles: false, allowFolders: true, allowMultiple: false },
			(location) => {
				if(location) {
					let sdkPath = location[0];
					let sdkCheck = exports.checkSDKFolderForInfo(sdkPath);

					var installed = nova.config.get("as3.sdk.installed")
					if(installed==null) {
						installed = [];
					}

					// Check if it's already installed
					var installedIndex = installed.indexOf(sdkPath);

					if(sdkCheck[0]==sdkCheck[1]) { // No AIR/FLEX ID found...
						if(installedIndex!=-1) {
							nova.workspace.showActionPanel("The SDK at " + sdkPath + " is not recognised as an AIR/FLEX SDK.\n\nAre you sure you want to add this? ", { buttons: [ "Yes, Add it", "Cancel" ] },
								(answer) => {
									if(answer==0) {
										exports.installSDK(sdkPath);
										resolve(sdkPath);
									}
								}
							);
						} else {
							nova.workspace.showActionPanel("The SDK at " + sdkpath + "\n\nis already installed!");
						}
					} else {
						// It's already default!
						if(installedIndex==0) {
							nova.workspace.showActionPanel("The SDK for:\n\n" + sdkCheck[1] + "\n\nis already installed and is the default!");
						} else if(installedIndex!=-1) {
							nova.workspace.showActionPanel("The SDK for\n\n" + sdkCheck[1] + "\n\nIs already installed, do you want to make it the default?", { buttons: [ "Make Default","Cancel"] },
								(answer) => {
									if(answer==0) {
										exports.makeSDKDefault(sdkPath);
										resolve(sdkPath);
									}
								}
							);
						} else {
							if(installed.length==0) {
								nova.workspace.showActionPanel("Found\n\n" + sdkCheck[1] + "\n\nDo you want to add this, which will make it the default for further project?", { buttons: [ "Add","Cancel"] },
									(answer) => {
										if(answer!=2) {
											if(answer==0) {
												exports.installSDK(sdkPath);
												resolve(sdkPath);
											}
										}
									}
								);
							} else {
								nova.workspace.showActionPanel("Found\n\n" + sdkCheck[1] + "\n\nDo you want to add this and/or make it the default?", { buttons: [ "Add","Make Default","Cancel"] },
									(answer) => {
										if(answer!=2) {
											if(answer==0) {
												exports.installSDK(sdkPath);
												resolve(sdkPath);
											} else  if(answer==1) {
												exports.installSDKAsDefault(sdkPath);
												resolve(sdkPath);
											}
										}
									}
								);
							}
						}
					}
				}
			}
		);
	});
}

exports.removeSDKPrompt = function() {
	return new Promise((resolve, reject) => {
		let sdkCompleteList = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
		let sdkList = nova.config.get("as3.sdk.installed");

		if(sdkList==null || sdkList.length==0) {
			nova.workspace.showInformativeMessage("The SDK list is empty and you cannot remove any.\n\nThe extension will always default to using `~/Applications/AIRSDK`.");
		} else {
			var sdkChoicePromise;
			if(sdkList.length==1) {
				sdkChoicePromise = Promise.resolve( { "value": sdkList[0], "index": 0 } );
			} else {
				sdkChoicePromise = quickChoicePalette(sdkList, "Remove which SDK?").then((choice) => choice);
			}

			sdkChoicePromise.then((sdk) => {
				if(sdk!==undefined && sdk.index!=null) {
					var removedDefault = false;

					var message = "Are you sure you want to remove the ";
					if(sdk.index==0) {
						removedDefault =true;
						message += "default ";
					}
					message += "SDK of:\n\n" + exports.getAIRSDKNameFromPath(sdk.value) + "?\n\n";

					if(sdk.index==0) {
						if(sdk.length==1) {
							message += "This will default to using `~/Applications/AIRSDK`. If there is no SDK is there, the extension will not function properly";
						} else {
							message += "The next SDK in the list will become the default."
						}
					}

					nova.workspace.showActionPanel(message, { buttons: [ "Remove","Cancel" ] },	(result) => {
						if(result==0) { // Only Remove is pressed
							console.log("BEFORE::")
							consoleLogObject(sdkList);
							sdkList.splice(sdk.index, 1);
							console.log("after::")
							consoleLogObject(sdkList);

							nova.config.set("as3.sdk.installed",sdkList);

							message = "SDK was removed.";
							// Refresh list
							sdkList = nova.config.get("as3.sdk.installed");
							if(sdkList!=null && sdkList.length>0) {
								if(removedDefault) {
									message += "\n\nThe default extension will now be:\n\n" + exports.getAIRSDKNameFromPath(sdkList[0]);
								}
							} else {
								message += "\n\nThe extension will attempt to use `~/Applications/AIRSDK` as the default.";
							}
							nova.workspace.showInformativeMessage(message);
						}
					});
				}
			});
		}
	});
}

exports.resetSDKListPrompt = function() {
	return new Promise((resolve, reject) => {
		let sdkList = nova.config.get("as3.sdk.installed");
		if(sdkList==null || sdkList.length==0) {
			nova.workspace.showActionPanel("The SDK list is empty.\n\nIt will default to using `~/Applications/AIRSDK`. ", { buttons: [ "Okay" ] } );
		} else {
			nova.workspace.showActionPanel("This will remove all the SDKs listed as installed and then will default to using `~/Applications/AIRSDK` for this extension. Are you sure? ", { buttons: [ "No, don't", "Yes, clear it" ] },
				(answer) => {
					if(answer==1) {
						nova.config.remove("as3.sdk.installed");
					}
				}
			);
		}
	});
}

/**
 * Looks for the `airsdk.xml` in the directory to check what versions of AIR we have. If it's a really old
 * version of the Flex SDK, we'll try to figure out the AIR version with the template of the air descriptor
 *
 * @param {string} flexSDKBase - The location of the AIR/Flex SDK to check
 * @returns {Object} - An object with a `float` containing the `version` of the SDK, as well as an array `appVersions` with the
 * application namespaces (as a `descriptorNamespace` and `swfVersion`), and an array `extensionNamespaces` with the extension
 * namespaces (also as a `descriptorNamespace` and `swfVersion`)
 */
exports.getAIRSDKInfo = function(flexSDKBase) {
	let version = 0;
	let appVersions = [];
	let extensionNamespaces = [];
	let sdkLabel = "";
	let currentNS = "";

	// Grab the airsdk.xml to check for version numbers
	try {
		var airSDKInfo = getStringOfFile(nova.path.join(flexSDKBase,"airsdk.xml"),false);
		// If it's not empty, let's parse it from XML and convert it to JSON for easier reference
		if(airSDKInfo!="") {
			var airSDKXML = new xmlToJson.ns3x2j(airSDKInfo);

			currentNS = airSDKXML.getAttributeFromNodeByName("airSdk","xmlns");
			// break into chunks on "/" and then get the last item for the version number
			version = currentNS.split("/").pop();

			// Used to keep track of what the minimum SWF version is for each descriptor namespace
			var airAppVersions = airSDKXML.getNodeChildrenByName("applicationNamespaces", "versionMap");
			airAppVersions.forEach((airAppVersion) => {
				appVersions.push({
					"descriptorNamespace": airSDKXML.findChildNodeByName(airAppVersion["children"], "descriptorNamespace")["textContent"],
					"swfVersion": parseInt(airSDKXML.findChildNodeByName(airAppVersion["children"], "swfVersion")["textContent"])
				});
			});

			// Used to keep track of what the minimum SWF version is for ANEs
			var airExtensionNamespaces = airSDKXML.getNodeChildrenByName("extensionNamespaces", "versionMap");
			airExtensionNamespaces.forEach((airExtensionNamespace) => {
				extensionNamespaces.push({
					"descriptorNamespace": airSDKXML.findChildNodeByName(airExtensionNamespace["children"], "descriptorNamespace")["textContent"],
					"swfVersion": parseInt(airSDKXML.findChildNodeByName(airExtensionNamespace["children"], "swfVersion")["textContent"])
				});
			});

			// Get the label/name for the SDK:
			var sdkInfo = exports.checkSDKFolderForInfo(flexSDKBase);
			sdkLabel = sdkInfo[1];
		}
	} catch(error) {
		// Older SDK don't have the airsdk.xml
		var airTemplate = getStringOfFile(nova.path.join(flexSDKBase,"/templates/air/descriptor-template.xml"),false);
		if(airTemplate) {
			var airTemplateXML = new xmlToJson.ns3x2j(airTemplate);

			currentNS = airTemplateXML.getAttributeFromNodeByName("application","xmlns");
			version = currentNS.split("/").pop();
		}
	}

	return { version: version, appVersions: appVersions, extensionNamespaces: extensionNamespaces, label: sdkLabel }
}

/**
 * Returns the path of the default SDK from the list of installed ones.
 */
exports.getAIRSDKDefaultPath = function() {
	var flexSDKBase = "~/Applications/AIRSDK";

	var sdksInstalled = getWorkspaceOrGlobalConfig("as3.sdk.installed");
	if(getWorkspaceOrGlobalConfig("as3.sdk.installed")!=null) {
		flexSDKBase = getWorkspaceOrGlobalConfig("as3.sdk.installed")[0];
	}

	// If a user folder, then expand it!
	flexSDKBase = ensureExpandedUserPath(flexSDKBase);

	// Final check...
	if(doesFolderExistAndIsAccessible(flexSDKBase)==false) {
		return null;
	}

	return flexSDKBase;
}

/**
 * Returns the path of an SDK based on the name of the SDK that is given.
 * @param {string} sdkName - The name of the SDK
 * @returns {string|null} - The path of the SDK installed, if it's not installed, then `null` is returned
 */
exports.getAIRSDKPathFromName = function(sdkName) {
	var flexSDKBase = null;

	if(sdkName.indexOf("/")!=-1) {
		console.log("This may be a path? Just return it")
		flexSDKBase = sdkName;
	} else {
		var currentSDKsInstalled = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
		// consoleLogObject(currentSDKsInstalled);
		for(sdk of currentSDKsInstalled) {
			// console.log("Is " + sdkName + "  the same as sdk[0]: " + sdk[0] + " or [1]: " + sdk[1]);
			if(sdk[1]==sdkName) {
				// console.log("SETTING IT TO "+sdk[0])
				flexSDKBase = sdk[0];
				continue;
			}
		}
	}

	flexSDKBase = ensureExpandedUserPath(flexSDKBase);
	return flexSDKBase;
}

/**
 * Returns the name of an SDK based on the path of the SDK that is given.
 * @param {string} sdkName - The path of the SDK
 * @returns {string|null} - The name of the SDK installed, if it's not installed, then `null` is returned
 */
exports.getAIRSDKNameFromPath = function(sdkPath) {
	var flexSDKName = null;

	var currentSDKsInstalled = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
	// consoleLogObject(currentSDKsInstalled);
	for(sdk of currentSDKsInstalled) {
		console.log("Is " + sdkPath + "  the same as sdk[0]: " + sdk[0] + " or [1]: " + sdk[1]);
		if(sdk[0]==sdkPath) {
			console.log("SETTING IT TO "+sdk[1])
			flexSDKName = sdk[1];
			continue;
		}
	}

	return flexSDKName;
}

exports.isAIRSDKInstalled = function(sdkName) {
	var result = false;

	var currentSDKsInstalled = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
	for(sdk of currentSDKsInstalled) {
		if(sdk[1]==sdkName) {
			return true;
		}
	}

	return result;
}

/**
 * Goes through the installed SDKs in the config and get's the information about it.
 */
exports.generateAIRSDKInstalledInformation = function() {
	let sdks = nova.config.get("as3.sdk.installed") || [];
	let results = [];
	for (let sdkPath of sdks) {
		var installed = exports.checkSDKFolderForInfo(sdkPath)
		results.push(installed);
	}

	return results;
}

/**
 * Checks a path to see if it is an AIR or FLEX SDK.
 * @param {Array} sdkPath - In Panic Nova's resolve object of `[ value, display ]`
 */
exports.checkSDKFolderForInfo = function(sdkPath) {
	try {
		let label = sdkPath;
		let airSDKInfo;
		// If it has a flex-sdk-description.xml, use that, otherwise it should check `airsdk.xml`
		if(doesFileExist(nova.path.join(sdkPath,"flex-sdk-description.xml"))) {
			airSDKInfo = getStringOfFile(nova.path.join(sdkPath,"flex-sdk-description.xml"));
			let flexSDKXML = new xmlToJson.ns3x2j(airSDKInfo);
			let name = flexSDKXML.findNodesByName("name");
			let build = flexSDKXML.findNodesByName("build"); // Flash Builder would show the build number in the UI, but didn't store it in the project settings.

			label = name[0]["textContent"]
		} else {
			airSDKInfo = getStringOfFile(nova.path.join(sdkPath,"airsdk.xml"));
			let airSDKXML = new xmlToJson.ns3x2j(airSDKInfo);
			let currentNS = airSDKXML.getAttributeFromNodeByName("airSdk","xmlns");

			label = "AIR SDK " + currentNS.split("/").pop();
		}
		return [sdkPath,label];
	} catch (err) { // Fallback: use path for both
		if (nova.inDevMode()) { console.error(err); }
		return [sdkPath, sdkPath];
	}
}

exports.installSDK = function(sdkPath) {
	var installed = nova.config.get("as3.sdk.installed")
	if(installed==null) {
		installed = [];
	}
	installed.push(sdkPath);
	nova.config.set("as3.sdk.installed",installed);
}

exports.installSDKAsDefault = function(sdkPath) {
	var installed = nova.config.get("as3.sdk.installed")
	if(installed==null) {
		installed = [];
	}
	installed.unshift(sdkPath);
	nova.config.set("as3.sdk.installed",installed);
}

exports.makeSDKDefault = function(sdkPath) {
	var installed = nova.config.get("as3.sdk.installed")
	if(installed==null) {
		installed = [];
	}
	var installedIndex = installed.indexOf(sdkPath);

	if(installedIndex!=-1) {
		installed.splice(installedIndex,1);
	}

	installed.unshift(sdkPath);
	nova.config.set("as3.sdk.installed",installed);
}
