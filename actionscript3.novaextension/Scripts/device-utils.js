const { determineFlexSDKBase, determineAndroidSDKBase } = require("./config-utils.js");
const { getProcessResults, consoleLogObject } = require("./nova-utils.js");

/**
 * Gets Android devices connected to the computer
 * @returns {Promise<Array>} - With the resolve being an Array of devices
 */
exports.getAndroidDevices = function() {
	// console.log("getAndroidDevices() : ");
	return new Promise((resolve, reject) => {
		let devices = [];

		const androidSDKBase = determineAndroidSDKBase();

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
			// Debug output
			if(!devices.length) {
				console.log("getAndroidDevices No DEVICES!");
			} else {
				console.log("getAndroidDevices DEVICES! " + devices.length);
				devices.forEach((device) => console.log("device: " + device.uuid + " is a " + device.model));
			}
			/*
			*/
			resolve(devices);
		}).catch((error) => {
			if(nova.inDevMode()) {
				console.error("getAndroidDevices: Error fetching Android devices", error);
			}
			reject([]); // Reject the promise with the error
		});
	});
}

/**
 * Gets iOS devices connected to the computer
 * @returns {Promise<Array>} - With the resolve being an Array of devices
 */
exports.getIOSDevices = function() {
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
				// Debug output
				if(!devices.length) {
					console.log("getIOSDevices No DEVICES!");
				} else {
					console.log("getIOSDevices DEVICES! " + devices.length);
					devices.forEach((device) => console.log("device: " + device.uuid + " is an " + device.model));
				}
				/*
				*/
				resolve(devices);
			} else {
				reject([]);
			}
		}).catch((error) => {
			if(nova.inDevMode()) {
				console.error("getIOSDevices: Error fetching iOS devices",error);
			}
			reject([]);
		});
	});
}

/**
 * Gets a list of devices based on which type of device
 * @param {string} os - (ios|android) The type of device to get
 * @returns {Promise<Array>} - An array
 */
exports.getSelectedDevices = function(os) {
	return new Promise((resolve, reject) => {
		if(os=="ios") {
			resolve(exports.getIOSDevices());
		} else if(os=="android") {
			resolve(exports.getAndroidDevices());
		}
	});
}

/**
 * Checks if an application is installed on a particular device for Android (if connected via
 * USB cable).
 * @param {string} deviceId - The ID of the device to check
 * @param {string} packageId - The ID of the application package
 * @returns {Promise<boolean>} - `true` if installed, otherwise `false`
 */
exports.checkIfInstalledOnAndroidDevice = function(deviceId, packageId) {
	return new Promise((resolve, reject) => {
		const androidSDKBase = determineAndroidSDKBase();
		getProcessResults(androidSDKBase + "/platform-tools/adb", ["shell", "pm", "path", packageId]).then((result) => {
			if(nova.inDevMode()) {
				console.info("checkIfInstalledOnAndroidDevice(): Looking for " + packageId + " on device " + deviceId);
				consoleLogObject(result);
			}

			// Only if the item is installed does this string of text show up in the output
			if(result.stdout.indexOf("package:/data/app/")!=-1) {
				resolve(true);
			} else {
				resolve(false);
			}
		}).catch((error) => {
			if(nova.inDevMode()) {
				console.error("checkIfInstalledOnAndroidDevice(): Error checking for app installed '" + packageId + "' on Android device" + deviceId);
				consoleLogObject(error);
			}
			resolve(false);
		});
	});
}

/**
 * Checks if an application is installed on a particular device for iOS. As a note, this will also
 * work over wifi if on the same network.
 * @param {string} deviceId - The ID of the device to check
 * @param {string} packageId - The ID of the application package
 * @returns {Promise<boolean>} - `true` if installed, otherwise `false`
 */
exports.checkIfInstalledOnIOSDevice = function(deviceId, packageId) {
	return new Promise((resolve, reject) => {
		getProcessResults(
			"/usr/bin/xcrun", [
				"devicectl",
				"device",
				"info",
				"apps",
				"--device", deviceId,
				"--bundle-id", packageId,
			]
		).then((result) => {
			if(nova.inDevMode()) {
				console.info("checkIfInstalledOnIOSDevice(): Looking for " + packageId + " on device " + deviceId);
				consoleLogObject(result);
			}

			// If the packageId shows up in the output, then it should be installed
			if(result.stdout.indexOf(packageId)!=-1) {
				resolve(true);
			} else {
				resolve(false);
			}
		}).catch((error) => {
			if(nova.inDevMode()) {
				console.error("checkIfInstalledOnIOSDevice(): Error checking for app installed '" + packageId + "' on iOS device" + deviceId);
				consoleLogObject(error);
			}
			resolve(false);
		});
	});
}

/**
 * Check if the application is installed on a device
 * @param {string} os - (ios|android) The type of device to get
 * @param {string} deviceId - The ID of the device to check
 * @param {string} packageId - The ID of the application package
 * @returns {Promise<boolean>} - `true` if installed, otherwise `false`
 */
exports.checkIfInstalledOnDevice = function(os, deviceId, packageId) {
	return new Promise((resolve, reject) => {
		if(os=="ios") {
			resolve(exports.checkIfInstalledOnIOSDevice(deviceId, packageId));
		} else if(os=="android") {
			resolve(exports.checkIfInstalledOnAndroidDevice(deviceId, packageId));
		}
	});
}
