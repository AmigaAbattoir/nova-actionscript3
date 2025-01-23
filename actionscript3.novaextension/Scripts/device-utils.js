const { determineFlexSDKBase, determineAndroidSDKBase } = require("./config-utils.js");
const { getProcessResults, consoleLogObject } = require("./nova-utils.js");

/**
 * Gets Android devices connected to the computer
 * @returns {Promise} - With the resolve being an Array of devices
 */
exports.getAndroidDevices = function() {
	console.log("getAndroidDevices() : ");
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
			console.error("getAndroidDevices: Error fetching Android devices", error);
			reject([]); // Reject the promise with the error
		});
	});
}

/**
 * Gets iOS devices connected to the computer
 * @returns {Promise} - With the resolve being an Array of devices
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
			console.error("getIOSDevices: Error fetching iOS devices",error);
			reject([]);
		});
	});
}
