const xmlToJson = require('./not-so-simple-simple-xml-to-json.js');
const { getProcessResults, getStringOfFile, consoleLogObject, ensureFolderIsAvailable } = require("./nova-utils.js");

/**
 * Figures out a ProjectUUID for building releases and storing passwords.
 * May not be needed anymore.
 * @returns {Promise} Returns the projects UUID or generates one using Nova's `crypto.randomUUID()`
 * or for Nova 9 and below, a process call to `/usr/bin/uuidgen`
 */
exports.determineProjectUUID = function() {
	return new Promise((resolve,reject) => {
		const existingUUID = nova.workspace.config.get("as3.application.projectUUID");

		if (existingUUID!=null && existingUUID!="") {
			return resolve(existingUUID);
		}

		if(nova.version[0]>=10) {
			const newUUID = nova.crypto.randomUUID();
			nova.workspace.config.set("as3.application.projectUUID", newUUID);
			return resolve(newUUID);
		} else {
			getProcessResults("/usr/bin/uuidgen").then((result) => {
				const newUUID = result.stdout.trim();
				nova.workspace.config.set("as3.application.projectUUID",newUUID);
				resolve(newUUID);
			}, (error) => {
				reject(error);
			});
		}
	});
}

/**
 * Get's the temp path to use for ANEs. Since this isn't async, we could end up with
 * @returns {string} - The location of a temp directory to extract ANEs to.
 */
exports.determineAneTempPath = function(prefix = "") {
	var uuid = nova.workspace.config.get("as3.application.projectUUID");

	if (!uuid || uuid===null) {
		if (nova.version[0] >= 100) {
			// Generate UUID synchronously
			uuid = nova.crypto.randomUUID();
			nova.workspace.config.set("as3.application.projectUUID", uuid);
		} else {
			// Old Nova versions need to fall back to async logic
			// But, let's fire  this off so maybe it will be ready!
			exports.determineProjectUUID();
			return null;
		}
	}

	var anePath = nova.path.join(nova.fs.tempdir, uuid, prefix + "ane");

	// Make sure that the temp dir exists!
	ensureFolderIsAvailable(nova.fs.tempdir);
	ensureFolderIsAvailable(nova.fs.tempdir + "/" + uuid);

	return anePath;
}

/**
 * Converts the status code from ADL to text from Adobe AIR's help pages.
 *
 * @param {int} status - The status that ADL has returned
 */
exports.resolveStatusCodeFromADL = function(status) {
	var title = "AIR ADL Error";
	var message = "";

	switch(status) {
		case 1: {
			title =   "AIR ADL already running";
			message = "Successful invocation of an already running AIR application. ADL exits immediately.";
			break;
		}
		case 2: {
			message = "Usage error. The arguments supplied to ADL are incorrect.";
			break;
		}
		case 3: {
			message = "The runtime cannot be found.";
			break;
		}
		case 4: {
			message = "The runtime cannot be started. Often, this occurs because the version specified in the application does not match the version of the runtime.";
			break;
		}
		case 5: {
			message = "An error of unknown cause occurred.";
			break;
		}
		case 6: {
			message = "The application descriptor file cannot be found.";
			break;
		}
		case 7: {
			message = "The contents of the application descriptor are not valid. This error usually indicates that the XML is not well formed.";
			break;
		}
		case 8: {
			message = "The main application content file (specified in the <content> element of the application descriptor file) cannot be found.";
			break;
		}
		case 9: {
			message = "The main application content file is not a valid SWF or HTML file.";
			break;
		}
		case 10: {
			message = "The application doesn’t support the profile specified with the -profile option.";
			break;
		}
		case 11: {
			message = "The -screensize argument is not supported in the current profile.";
			break;
		}
		case 128: {
			message = "Bad CPU type. Prior to AIR 20, ADL was 32bit, which will no longer run on Macs starting with 10.5. You may need to update the AIR SDK you are using!";
			break;
		}
	}

	return { "title": title, "message": message };
}

/**
 * Converts the status code from ADT to the text from Adobe AIR's help pages:
 * https://help.adobe.com/en_US/air/build/WSBE9908A0-8E3A-4329-8ABD-12F2A19AB5E9.html
 *
 * @param {int} status - The status that ADT has returned
 */
exports.resolveStatusCodeFromADT = function(status) {
	var title = "";
	var message = "";

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
			message += "\n\nThe timestamp server might also be down. For more information check the project's preferences in Build Packaging -> Timestamp";
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

	return { title: title, message: message };
}

/**
 * Used to help figure out the minimum  Flash Player version based upon the SWF Version
 * @note Not sure this is needed
 * @param {Number} swfVersion - The version of the SWF
 * @returns {Object} - An object with the major, minor and revision numbers
 */
exports.convertSWFVersionoFlashPlayerVersion = function(swfVersion) {
	var flashVersion = {};
	flashVersion.major = 0;
	flashVersion.minor = 0;
	flashVersion.revision = 0;

	if(swfVersion>10) {
		if(swfVersion>43) {
			swfVersion.major = 32;
		} else {
			// Prior to AIR SDK 23, there was the possibility of varied major/minor values.
			switch (swfVersion) {
				case 22: {
					flashVersion.major = 11; flashVersion.minor = 9;
					break;
				}
				case 21: {
					flashVersion.major = 11; flashVersion.minor = 8;
					break;
				}
				case 20: {
					flashVersion.major = 11; flashVersion.minor = 7;
					break;
				}
				case 19: {
					flashVersion.major = 11; flashVersion.minor = 6;
					break;
				}
				case 18: {
					flashVersion.major = 11; flashVersion.minor = 5;
					break;
				}
				case 17: {
					flashVersion.major = 11; flashVersion.minor = 4;
					break;
				}
				case 16: {
					flashVersion.major = 11; flashVersion.minor = 3;
					break;
				}
				case 15: {
					flashVersion.major = 11; flashVersion.minor = 2;
					break;
				}
				case 14: {
					flashVersion.major = 11; flashVersion.minor = 1;
					break;
				}
				case 13: {
					flashVersion.major = 11; flashVersion.minor = 0;
					break;
				}
				case 12: {
					flashVersion.major = 10; flashVersion.minor = 3;
					break;
				}
				case 11: {
					flashVersion.major = 10; flashVersion.minor = 2;
					break;
				}
				// After AIR SDK 23, only major values change
				default: {
					flashVersion.major = sdkVersion - 11;
					break;
				}
			}
		}
	}

	return flashVersion;
}

/**
 * Used to help figure out the minimum  Flash Player version based upon the AIR SDK
 * @param {Number} sdkVersion - The version of the AIR/Flex SDK
 * @returns {Object} - An object with the major, minor and revision numbers
 */
exports.convertAIRSDKToFlashPlayerVersion = function(sdkVersion) {
	var flashVersion = {};
	flashVersion.major = 0;
	flashVersion.minor = 0;
	flashVersion.revision = 0;

	// After AIR SDK 11, they changed the numbering of FlashPlayer to match
	if(sdkVersion>11) {
		// And there isn't any Flash version greater than 32.
		if(sdkVersion>31) {
			flashVersion.major = 32;
		} else {
			flashVersion.major = sdkVersion;
		}
	} else {
		switch (sdkVersion) {
			case 11.9: {
				flashVersion.major = 11; flashVersion.minor = 9;
				break;
			}
			case 11.8: {
				flashVersion.major = 11; flashVersion.minor = 8;
				break;
			}
			case 11.7: {
				flashVersion.major = 11; flashVersion.minor = 7;
				break;
			}
			case 11.6: {
				flashVersion.major = 11; flashVersion.minor = 6;
				break;
			}
			case 11.5: {
				flashVersion.major = 11; flashVersion.minor = 5;
				break;
			}
			case 11.4: {
				flashVersion.major = 11; flashVersion.minor = 4;
				break;
			}
			case 11.3: {
				flashVersion.major = 11; flashVersion.minor = 3;
				break;
			}
			case 11.2: {
				flashVersion.major = 11; flashVersion.minor = 2;
				break;
			}
			case 11.1:
			case 3.1: {
				flashVersion.major = 11; flashVersion.minor = 1;
				break;
			}
			case 3.0: {
				flashVersion.major = 11; flashVersion.minor = 0;
				break;
			}
			case 2.7: {
				flashVersion.major = 10; flashVersion.minor = 3;
				break;
			}
			case 2.6: {
				flashVersion.major = 10; flashVersion.minor = 2;
				break;
			}
			case 2.5: {
				flashVersion.major = 10; flashVersion.minor = 1;
				break;
			}
			case 2.0:
			case 1.5: {
				flashVersion.major = 10; flashVersion.minor = 0;
				break;
			}
			case 1.1:
			case 1.0: {
				flashVersion.major = 9; flashVersion.minor = 0; flashVersion.revision = 115
				break;
			}
		}
	}

	return flashVersion;
}
