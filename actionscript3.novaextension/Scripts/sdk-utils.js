const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { consoleNoteAndObject, consoleErrorAndObject, showNotification, cancelNotification, doesFileExist, doesFolderExistAndIsAccessible, makeOrClearFolder, ensureExpandedUserPath, isWorkspace, getWorkspaceOrGlobalConfig, getStringOfFile, quickChoicePalette, getProcessResults, copyFileTo } = require("./nova-utils.js");

/**
 * Tries to see if Apache Ant is installed on path or if the extension is installed
 */
exports.checkForAnt = function() {
	return new Promise((resolve, reject) => {
		// First, figure out if we have access to Apache Ant
		var antPath = "ant";
		getProcessResults("/usr/bin/env",["ant","-version"]).then((result) => {
			resolve(antPath);
		}).catch((err) => {
			antPath = null;
			// @NOTE Not sure there's a way to figure this out through Nova, but we will assume it is this:
			var extensionPath = ensureExpandedUserPath("~/Library/Application Support/Nova/Extensions/com.abattoirsoftware.Ant/");
			if(doesFolderExistAndIsAccessible(extensionPath)) {
				var entries = nova.fs.listdir(extensionPath);
				for (var name of entries) {
					if (name.startsWith("apache-ant-")) {
						antPath = extensionPath + "/" + name + "/bin/ant";
						if (doesFileExist(antPath)) {
							resolve(antPath);
						}
					}
				}
			}

			if(antPath==null) {
				reject(null);
			} else {
				resolve(antPath);
			}
		});
	});
}

/**
 * UI for asking if they want to make a Flex SDK from a new Harman AIR SDK
 */
exports.createFlexSDKPrompt = function() {
	return new Promise((resolve, reject) => {
		var flexSDKFile;
		var airSDKFile;
		var destPath;
		var antXmlPath = nova.path.join(nova.extension.path, "/Template/harman-installer.xml");
		var flexSDKVersion = 0
		var airSDKVersion = 0;
		var antPath = null;

		// Make sure Ant is available, otherwise we can't do this
		exports.checkForAnt().then((ant) => {
			antPath = ant;
			nova.workspace.showActionPanel("This will create an Flex AIR SDK. You will need Apache Ant installed (or the extension). Please make sure you have downloaded:\n\n 1) an Apache Flex SDK Binary Distribution (as .tar.gz)\n 2) a Harman AIR SDK for Flex (as .zip)", { buttons: [ "Not ready yet","Proceed"] }, (choice) => {
				if(choice==1) {
					// Make a temp folder, which we will use to extract files from the Flex and AIR SDK to get their versions:
					var tempExtractFolder = nova.fs.tempdir + "/flexsdk";
					// console.log(`Temp Ext: ${tempExtractFolder}`);
					makeOrClearFolder(tempExtractFolder);

					// Select Flex SDK
					nova.workspace.showFileChooser( "Please select the Apache Flex SDK Binary Distribution.\nIt should be a .tar.gz file.", { prompt: "Flex SDK...", allowFiles: true, allowFolders: false, allowMultiple: false, filetype: ".gz" }, (location) => {
						if(location) {
							flexSDKFile = location[0];

							// Get the Flex SDK version, then move on...
							getProcessResults("/usr/bin/tar",["-xzf",flexSDKFile,"-C",tempExtractFolder,"--strip-components=1","*/flex-sdk-description.xml"]).then((result) => {
								try {
									let flexSDKInfo = getStringOfFile(nova.path.join(tempExtractFolder,"flex-sdk-description.xml"));
									let flexSDKXML = new xmlToJson.ns3x2j(flexSDKInfo);
									flexSDKVersion = flexSDKXML.findNodesByName("version")[0]["textContent"];
								}catch(error) {
									nova.workspace.showErrorMessage(`createFlexSDKPropmt() *** ERROR: Problem finding version in "flex-sdk-description.xml" file in archive.`);
									return null;
								}

								// Now get the AIR SDK
								nova.workspace.showFileChooser("Now select the Harman AIR SDK for Flex.\nThis should be a .zip file.", { prompt: "AIR SDK...", allowFiles: true, allowFolders: false, allowMultiple: false, filetype: ".zip" }, (location) => {
									if(location) {
										airSDKFile = location[0];

										// Let's get the AIR SDK version
										getProcessResults("/usr/bin/unzip",["-j",airSDKFile,"air-sdk-description.xml","-d",tempExtractFolder]).then((result) => {
											consoleNoteAndObject("Got results;",result);
											let airSDKInfo = getStringOfFile(nova.path.join(tempExtractFolder,"air-sdk-description.xml"));
											let airSDKXML = new xmlToJson.ns3x2j(airSDKInfo);
											let airVersion = airSDKXML.findNodesByName("version")[0]["textContent"];
											let airBuild = airSDKXML.findNodesByName("build")[0]["textContent"];

											airSDKVersion = airVersion + "." +airBuild;
											if(airSDKVersion==0) {
												nova.workspace.showErrorMessage(`Cannot find AIR SDK version information in the ZIP file at:\n\n${airSDKFile}. Please make sure you selected a Harman AIR SDK for Flex ZIP and try again!`);
												return null;
											}

											nova.workspace.showFileChooser(`Now, create or select a folder to save this SDK!\nFlex SDK: ${flexSDKVersion}  AIR SDK: ${airSDKVersion}.\nThe Flex SDK will be extracted to this folder!`, { prompt: "Save here...", allowFiles: false, allowFolders: true, allowMultiple: false }, (location) => {
												if(location) {
													destPath = location[0];
													// console.log("Destination ....",destPath);

													showNotification("🗃️ Make Flex SDK...","Extracting Flex SDK","Please wait...", "-makeFlexSDK");
													// Extract FlexSDK to temp.
													getProcessResults("/usr/bin/tar", ["-xzf",flexSDKFile,"--strip-components=1","-C",destPath],"",{},true).then((result) => {
														var copiedAirSDK = copyFileTo(airSDKFile, destPath);
														var copiedAntFile = copyFileTo(antXmlPath, destPath);

														if(copiedAirSDK!=null && copiedAntFile!=null) {
															var command;
															var args = [];

															if(antPath=="ant") {
																command = "/usr/bin/env"
																args = [ "ant" ];
															} else {
																command = antPath;
															}

															args.push("-f");
															args.push("harman-installer.xml");
															args.push(`-Dair.sdk.version=${airSDKVersion}`);

															showNotification("🗃️ Make Flex SDK...","Running ANT script to build SDK. This may take a while.","Please wait...", "-makeFlexSDK");
															// ANT the XML...
															getProcessResults(command, args, destPath, {}, true, true).then((result) => {
																cancelNotification("-makeFlexSDK");
																try {
																	// Delete Harman XML
																	nova.fs.remove(copiedAntFile);
																} catch(release) { }

																nova.workspace.showActionPanel(
																	"🗃️ Make Flex SDK Completed!\n\nWould you like to install this SDK too?",
																	{ buttons: [ "No" , "Yes", "Make Default" ] },
																	(result) => {
																		if(result==1) { // Add to list
																			exports.installSDK(destPath);
																		} else if(result==2) { // Make default
																			exports.makeSDKDefault(destPath);
																		}
																	}
																);
															}).catch((error) => {
																cancelNotification("-makeFlexSDK");
																consoleErrorAndObject("createFlexSDKPrompt() *** ERROR: Failed Processing ANT XML. ***",error);
																nova.workspace.showErrorMessage(`🗃️ Make Flex SDK failed:\n\n${error.stderr}`);
															});
														}
													});
												}
											});
										}).catch((error) => {
											nova.workspace.showErrorMessage(`Problem extracting "airsdk.xml" file from archive ${airSDKFile}`);
											return null;
										});
									}
								});

							}).catch((error) => {
								nova.workspace.showErrorMessage(`Problem extracting "flex-sdk-description.xml" file from archive ${flexSDKFile}`);
								return null;
							});
						}
					});
				}
			});
		}).catch((error) => {
			nova.workspace.showErrorMessage("You need to have either Apache Ant in your system's path, or the Apache Ant extension for Nova to make the Flex with AIR SDK!");
			resolve(null);
		});
	});
}

/**
 * UI to prompt to add an SDK to list of know SDKs
 * @param {string} specificSDK - The full path to the SDK
 */
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

/**
 * UI to remove an SDK.
 */
exports.removeSDKPrompt = function() {
	return new Promise((resolve, reject) => {
		let sdkCompleteList = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
		let sdkList = nova.config.get("as3.sdk.installed");

		if(sdkList==null || sdkList.length==0) {
			nova.workspace.showInformativeMessage("The SDK list is empty and you cannot forget any.\n\nThe extension will always default to using `~/Applications/AIRSDK`.");
		} else {
			var sdkChoicePromise;
			if(sdkList.length==1) {
				sdkChoicePromise = Promise.resolve( { "value": sdkList[0], "index": 0 } );
			} else {
				sdkChoicePromise = quickChoicePalette(sdkList, "Forget which SDK?").then((choice) => choice);
			}

			sdkChoicePromise.then((sdk) => {
				if(sdk!==undefined && sdk.index!=null) {
					var removedDefault = false;

					var message = "Are you sure you want to forget the ";
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
							if(nova.inDevMode()) {
								consoleNoteAndObject("BEFORE::",sdkList);
							}
							sdkList.splice(sdk.index, 1);
							if(nova.inDevMode()) {
								consoleNoteAndObject("after::",sdkList);
							}

							nova.config.set("as3.sdk.installed",sdkList);

							message = "SDK was forgotten.";
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

/**
 * UI to ask which SDK to make the default one
 */
exports.changeDefaultSDKPrompt = function() {
	return new Promise((resolve, reject) => {
		let sdkCompleteList = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
		let sdkList = nova.config.get("as3.sdk.installed");

		if(sdkList==null || sdkList.length==0) {
			nova.workspace.showInformativeMessage("The SDK list is empty and you cannot remove any.\n\nThe extension will always default to using `~/Applications/AIRSDK`.");
		} else if(sdkList.length==1) {
			nova.workspace.showInformativeMessage("There is only 1 SDK installed, so this will be the default");
		} else {
			var sdkChoicePromise = sdkChoicePromise = quickChoicePalette(sdkList, "Remove which SDK?").then((choice) => choice);
			sdkChoicePromise.then((sdk) => {
				if(sdk!==undefined && sdk.index!=null) {
					if(sdk.index==0) {
						nova.workspace.showInformativeMessage("This is already the default SDK!");
					} else {
						var message = "Are you sure you want to make the default SDK:\n\n" + exports.getAIRSDKNameFromPath(sdk.value) + "?\n\n";
						nova.workspace.showActionPanel(message, { buttons: [ "Make Default","Cancel" ] },(result) => {
							if(result==0) {
								if(nova.inDevMode()) {
									consoleNoteAndObject("BEFORE::",sdkList);
								}
								sdkList.unshift(sdkList.splice(sdk.index, 1)[0]);
								if(nova.inDevMode()) {
									consoleNoteAndObject("after::",sdkList);
								}

								//nova.config.set("as3.sdk.installed",sdkList);

								message = "Default SDK was changed.";
								// Refresh list
								sdkList = nova.config.get("as3.sdk.installed");
								if(sdkList!=null && sdkList.length>0) {
									message += "\n\nThe default extension will now be:\n\n" + exports.getAIRSDKNameFromPath(sdkList[0]);
								}
								nova.workspace.showInformativeMessage(message);
							}
						});
					}
				}
			});
		}
	});
}

/**
 * UI to handle resetting the list of known SDKs
 */
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
		// console.log("This may be a path? Just return it")
		flexSDKBase = sdkName;
	} else {
		var currentSDKsInstalled = JSON.parse(nova.workspace.context.get("currentSDKsInstalled"));
		// consoleNoteAndObject("currentSDKsInstalled: ",currentSDKsInstalled);
		for(sdk of currentSDKsInstalled) {
			// console.log(`Is ${sdkName} the same as sdk[0]: ${sdk[0]} or [1]: ${sdk[1]}`);
			if(sdk[1]==sdkName) {
				// console.log(`SETTING IT TO ${sdk[0]}`);
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
	// consoleNoteAndObject("currentSDKsInstalled: ",currentSDKsInstalled);
	for(sdk of currentSDKsInstalled) {
		// console.log(`Is ${sdkName} the same as sdk[0]: ${sdk[0]} or [1]: ${sdk[1]}`);
		if(sdk[0]==sdkPath) {
			// console.log(`SETTING IT TO ${sdk[1]}`);
			flexSDKName = sdk[1];
			continue;
		}
	}

	return flexSDKName;
}

/**
 * Checks if a particular SDK is alreadu installed
 * @param {string} sdkName - The name of the SDK
 * @returns {boolean}  - If that SDK is installed `true`, otherwise `false`
 */
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
		if (nova.inDevMode()) { consoleErrorAndObject("checkSDKFolderForInfo() *** ERROR ***",err); }
		return [sdkPath, sdkPath];
	}
}

/**
 * Adds SDK to list of known SDKs
 * @param {string} sdkPath - The full path to the SDK
 */
exports.installSDK = function(sdkPath) {
	var installed = nova.config.get("as3.sdk.installed")
	if(installed==null) {
		installed = [];
	}
	installed.push(sdkPath);
	nova.config.set("as3.sdk.installed",installed);
}

/**
 * Adds SDK to the top of the list of known SDKs
 * @param {string} sdkPath - The full path to the SDK
 */
exports.installSDKAsDefault = function(sdkPath) {
	var installed = nova.config.get("as3.sdk.installed")
	if(installed==null) {
		installed = [];
	}
	installed.unshift(sdkPath);
	nova.config.set("as3.sdk.installed",installed);
}

/**
 * Moves the SDK to the top of the list of known SDKs
 * @param {string} sdkPath - The full path to the SDK
 */
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
