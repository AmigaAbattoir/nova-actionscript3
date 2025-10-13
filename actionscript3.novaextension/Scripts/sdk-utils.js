const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { consoleLogObject, showNotification, doesFileExist, doesFolderExistAndIsAccessible, ensureExpandedUserPath, isWorkspace, getWorkspaceOrGlobalConfig, getStringOfFile } = require("./nova-utils.js");

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

exports.getAIRSDKPath = function(sdkName) {
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
