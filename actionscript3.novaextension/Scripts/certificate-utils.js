const { getProcessResults, consoleLogObject, getStringOfWorkspaceFile, quickChoicePalette } = require("./nova-utils.js");
const { determineFlexSDKBase } = require("./config-utils.js");

/**
 * Menu function to clear an certificate's password. It goes through and checks if there's any
 * stored Keychain stored certificates and will ask which one to remove. If there are more than 1
 * certificate with a stored password a choice palette will ask which one. It will also allow you
 * to remove all passwords.
 */
exports.clearExportPassword = function() {
	return new Promise((resolve) => {
		// Store certificates that have a password in this array, please.
		let certs = [];

		// Used to track if there are any certificates for message after check.
		let hasCertificates = false;

		// Check if there's a certificate that is used for all Tasks set in the project prefs
		let projectCert = nova.workspace.config.get("as3.packaging.certificate");
		if(projectCert) {
			hasCertificates = true;
			// Check if there is a stored password
			if(exports.getCertificatePasswordInKeychain(projectCert)!="") {
				certs.push(projectCert);
			}
		}

		// Check if there are Tasks, and see if they contain a value for a certificate
		// @NOTE Unfortunately, it doesn't seem there is a way to get these from Nova, so we have to manually read and hope they are good!
		if(nova.fs.access(nova.workspace.path + "/.nova/Tasks", nova.fs.F_OK | nova.fs.X_OK)) {
			var files = nova.fs.listdir(nova.workspace.path + "/.nova/Tasks/");
			files.forEach((file) => {
				if(file.indexOf(".json")!=-1) {
					try {
						taskJson = JSON.parse(getStringOfWorkspaceFile("/.nova/Tasks/" + file));

						// Only add those that have an extension identifier of our extension!
						var certCheck = taskJson["extensionValues"]["as3.packaging.certificate"];
						if(certCheck!=null) {
							// If it's already in the list, we don't need to add it!
							if(certs.includes(certCheck)==false) {
								hasCertificates = true;
								if(exports.getCertificatePasswordInKeychain(certCheck)!="") {
									certs.push(certCheck);
								}
							}
						}
					} catch(error) {
						// If there is an error, it may be that it's not our extensions's Task or
						// there is no value, so we can just ignore this error
					}
				}
			});
		}

		if(certs.length==0) {
			if(hasCertificates) {
				nova.workspace.showErrorMessage("You currently do not have any certificate passwords stored in Keychain for this project.");
			} else {
				nova.workspace.showErrorMessage("Your project and/or Tasks do not contain a certifcate to clear");
			}
		} else {
			var certNamePromise;
			if(certs.length==1) {
				certNamePromise = Promise.resolve(certs[0]);
			} else {
				certNamePromise = quickChoicePalette(certs, "Which certificate to clear?", true).then((choice) => choice.value);
			}

			certNamePromise.then((certName) => {
				if(certName!==undefined) {
					if(certName=="All") {
						nova.workspace.showActionPanel("Are you sure you want to clear the password for the all following certificates:\n\n"
							+ certs.join("\n") + "\n\nDoing so will remove the password for all Nova projects that may use them!", { buttons: [ "Remove","Cancel" ] },
							(result) => {
								if(result==0) {
									certs.forEach((certName) => {
										if(certName!="All") {
											exports.removeCertificatePasswordInKeychain(certName);
										}
									});
									nova.workspace.showInformativeMessage("Should have removed all of the certificates...");
								// } else {
								// 	nova.workspace.showInformativeMessage("No certificate removed.");
								}
							}
						);
					} else {
						nova.workspace.showActionPanel("Are you sure you want to clear the password for the following certificate:\n\n"
							+ certName + "\n\nDoing so will remove the password for all projects that may use this certificate!", { buttons: [ "Remove","Cancel" ] },
							(result) => {
								if(result==0) {
									exports.removeCertificatePasswordInKeychain(certName);
									nova.workspace.showInformativeMessage("Should have removed it...");
								// } else {
								// 	nova.workspace.showInformativeMessage("No certificate removed.");
								}
							}
						);
					}
				}
			});
		}
	});
}

/**
 * Menu function to store a certificate's password. If there are more than 1 certificate used in the
 * project and Tasks, it will present a choice palette to ask which one. It will also prompt until
 * a valid password is entered for that certificate.
 */
exports.storeExportPassword = function() {
	return new Promise((resolve) => {
		// Store certificates for this project.
		let certs = [];

		// Check if there's a certificate that is used for all Tasks set in the project prefs
		let projectCert = nova.workspace.config.get("as3.packaging.certificate");
		if(projectCert) {
			certs.push(projectCert);
		}

		// Check if there are Tasks, and see if they contain a value for a certificate
		// @NOTE Unfortunately, it doesn't seem there is a way to get these from Nova, so we have to manually read and hope they are good!
		if(nova.fs.access(nova.workspace.path + "/.nova/Tasks", nova.fs.F_OK | nova.fs.X_OK)) {
			var files = nova.fs.listdir(nova.workspace.path + "/.nova/Tasks/");
			files.forEach((file) => {
				if(file.indexOf(".json")!=-1) {
					try {
						taskJson = JSON.parse(getStringOfWorkspaceFile("/.nova/Tasks/" + file));

						// Only add those that have an extension identifier of our extension!
						var certCheck = taskJson["extensionValues"]["as3.packaging.certificate"];
						if(certCheck!=null) {
							// If it's already in the list, we don't need to add it!
							if(certs.includes(certCheck)==false) {
								certs.push(certCheck);
							}
						}
					} catch(error) {
						// If there is an error, it may be that it's not our extensions's Task or
						// there is no value, so we can just ignore this error
					}
				}
			});
		}

		if(certs.length==0) {
			nova.workspace.showErrorMessage("Your project and/or Tasks do not contain a certifcate.");
		} else {
			var certNamePromise;
			if(certs.length==1) {
				certNamePromise = Promise.resolve(certs[0]);
			} else {
				certNamePromise = quickChoicePalette(certs, "Set which certificate password?").then((choice) => choice.value);
			}

			certNamePromise.then((certName) => {
				if(certName!==undefined) {
					let storedPasswordExists = exports.getCertificatePasswordInKeychain(certName);
					exports.promptForPassword(certName,storedPasswordExists).then((password) => {
						// console.log("PROMPT PASSWORD RESOLVED WITH " + password);
						if(password!==undefined) {
							// Store Password
							exports.setCertificatePasswordInKeychain(certName,password);
							nova.workspace.showInformativeMessage("The password was " + (storeExportPassword ? "updated" : "saved") + "!");
						}
					});
				}
			});
		}
	});
}

/**
 * Shows an prompt to input a password for a certificate. It will also check that password is valid and if it isn't
 * it will prompt again and again until they cancel.
 * @param {String} certificateLocation - The location of the certificate
 * @param {boolean} storedPasswordExists - Flag to let the user know if there is already a Keychain password stored,
 * this needs to be supplied (see `getCertificatePasswordInKeychain()`).
 * @returns {String|undefined} - The password that was correct, otherwise if the user cancels, it will be undefined
 */
exports.promptForPassword = function(certificateLocation, storedPasswordExists = false) {
	return new Promise((resolve) => {
		function askPassword(retry = false, storedPasswordExists = false) {
			let message = (retry ? "❗️Password was invalid. Try again!\n\n" : "");
			message += (storedPasswordExists ? "This password is already stored in Keychain. Enter a new " : "Enter the ");
			message += "password for the certificate:\n\n" + certificateLocation;

			nova.workspace.showInputPanel(message,
				{ label: "Password", prompt: "Store", secure: true }, (result) => {
				// console.log("RESULT [[" + result + "]]");
				// If user cancelled, this will be undefined
				if(result===undefined) {
					resolve(result);
				} else {
					exports.checkCertificatePassword(certificateLocation,result).then((checkPass) => {
						if(checkPass) {
							resolve(result);
						} else {
							askPassword(true, storedPasswordExists);
						}
					});
				}
			});
		}

		askPassword(false, storedPasswordExists);
	});
}

/**
 * Calls ADT to check if a certificate's password is correct
 * @param {String} certificateLocation - Location of the certificate file
 * @param {String} password - The password (hopefully) for the certificate
 * @returns {Promise} - Resolves as a Boolean, true if the password is good, otherwise false
 */
exports.checkCertificatePassword = function(certificateLocation, password) {
	return new Promise((resolve) => {
		let flexSDKBase = determineFlexSDKBase();
		var command = flexSDKBase + "/bin/adt";
		var args = [
			"-checkstore",
			"-storetype", "pkcs12",
			"-keystore",  certificateLocation,
			"-storepass", password
		];

		// This command will resolve if good, otherwise reject. But there was an issue where my Promise wouldn't get the `reject`
		getProcessResults(command, args).then(() => {
			resolve(true);
		}).catch((error) => {
			resolve(false);
		});
	});
}

exports.createCertificate = function() {
	return new Promise((resolve) => {
		console.log("Called... as3.packaging.certificateCreate");
		nova.workspace.showErrorMessage("Create Certificate\n\nStill need to do... " + msg);
	});
}

/**
 * Checks if there is a stored password for a certain certificate using the certificate's path.
 * @param {String} certificateLocation - The path to the certificate
 */
exports.getCertificatePasswordInKeychain = function(certificateLocation) {
	var certificateName = certificateLocation.split("/").pop();

	// Check if we have the password stored in the user's Keychain
	var passwordCheck = nova.credentials.getPassword("export-with-"+certificateName,certificateLocation);
	if(passwordCheck==null) {
		passwordCheck = "";
	}

	return passwordCheck;
}

/**
 * Stores a password for a certificate. When stored, the certificate file name is prefixed with "exports-with"
 * @param {String} certificateLocation - The path to the certificate
 * @param {String} value - The password to store
 */
exports.setCertificatePasswordInKeychain = function(certificateLocation, value) {
	var certificateName = certificateLocation.split("/").pop();
	nova.credentials.setPassword("export-with-"+certificateName,certificateLocation);
}

/**
 * Removes a stored Keychain password for a certificate.
 * @param {String} certificateLocation - The path to the certificate
 */
exports.removeCertificatePasswordInKeychain = function(certificateLocation) {
	var certificateName = certificateLocation.split("/").pop();
	nova.credentials.removePassword("export-with-"+certificateName,certificateLocation);
}

/**
 * Checks if there is a session password for a certain certificate using the certificate's path.
 * @param {String} certificateLocation - The path to the certificate
 */
exports.getSessionCertificatePassword = function(certificateLocation) {
	var value = "";
	var sessionCertPassJSON = nova.workspace.context.get("as3.sessionCertPass");
	if(sessionCertPassJSON!=null) {
		sessionCerts = JSON.parse(sessionCertPassJSON);

		if(sessionCerts[certificateLocation]) {
			value = sessionCerts[certificateLocation];
		}
	}
	return value;
}

/**
 * Stores a password for a session in a workspace context. Have to convert the context to JSON and back.
 * @param {String} certificateLocation - The path to the certificate
 * @param {String} value - The password to store
 */
exports.setSessionCertificatePassword = function(certificateLocation, value) {
	var sessionCertPassJSON = nova.workspace.context.get("as3.sessionCertPass");
	if(sessionCertPassJSON==null) {
		sessionCerts = {};
	} else {
		sessionCerts = JSON.parse(sessionCertPassJSON);
	}

	sessionCerts[certificateLocation] = value;
	sessionCertPassJSON = nova.workspace.context.set("as3.sessionCertPass",JSON.stringify(sessionCerts));
}
