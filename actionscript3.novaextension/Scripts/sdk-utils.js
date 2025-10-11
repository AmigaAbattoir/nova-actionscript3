const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { consoleLogObject, showNotification, doesFileExist, doesFolderExist, ensureExpandedUserPath, isWorkspace, getStringOfFile } = require("./nova-utils.js");

exports.checkSDKFolderForInfo = function(sdkPath) {
	try {
		let label = sdkPath;
		let airSDKInfo;
		// If it has a flex-sdk-description.xml, use that, otherwise it should check `airsdk.xml`
		if(doesFileExist(nova.path.join(sdkPath,"flex-sdk-description.xml"))) {
			airSDKInfo = getStringOfFile(nova.path.join(sdkPath,"flex-sdk-description.xml"));
			let flexSDKXML = new xmlToJson.ns3x2j(airSDKInfo);
			let name = flexSDKXML.findNodesByName("name");
			let build = flexSDKXML.findNodesByName("build");

			label = " " + name[0]["textContent"] + " (" + build[0]["textContent"] + ")";
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
