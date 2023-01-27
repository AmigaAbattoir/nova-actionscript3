var langserver = null;

// Show a notification with the given title and body when in dev mode.
function showNotification(title, body) {
    //if (nova.inDevMode()) {
        let request = new NotificationRequest("as3mxml-nova-message");

        request.title = nova.localize(title);
        request.body = nova.localize(body);
        nova.notifications.add(request);
    //}
}

exports.activate = function() {
    langserver = new AS3MXMLLanguageServer();
    if (nova.inDevMode()) {
        console.log(">>>> AS3MXML Activated");
        console.log("  >> langserver.languageClient:  " + langserver.languageClient);
        console.log("  >> JSON.stringify(langserver): " + JSON.stringify(langserver));
    }
}

exports.deactivate = function() {
    // Clean up state before the extension is deactivated
    if (nova.inDevMode()) {
        console.log("<<<< AS3MXML Deactivated");
    }

    if (langserver) {
        langserver.deactivate();
        langserver = null;
    }
}

class AS3MXMLLanguageServer {
    languageClient = null;

    constructor() {
        // Observe the configuration setting for the server's location, and restart the server on change
        /*
        nova.config.observe('as3mxml.language-server-path', function(path) {
            this.start(path);
        }, this);
        */
        var path = nova.extension.path;
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Constructor -----------------------------------------------------");
            console.log(" *** Constructing AS3MXML Extension with PATH: ",path);
        }
        this.start(nova.extension.path)
    }

    deactivate() {
        if (nova.inDevMode()) {
            console.log(" *** AS3MXML Deactivated");
        }
        this.stop();
    }

    start(path) {
        if (nova.inDevMode()) {
            console.log("--- AS3MXML Start(path)-----------------------------------------------------");
            console.log(" *** path: " + path);
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log("Language client is active, so let's stop it and remove the subscription!");
            }
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
        }

        var base =  nova.path.join(nova.extension.path, "language-server");

        // Should be setup as an extension variable...
        var flexSDKBase = "/Applications/Apache Flex/SDKs/4.16.1-AIR32/frameworks";

        if (nova.inDevMode()) {
            console.log("     PATH:: [[" + path + "]]");
            console.log("     BASE:: [[" + base + "]]");
            console.log("     FLEX:: [[" + flexSDKBase + "]]");
        }

        // Create the client
        var args = new Array;

        /**
         Commands to start server from: https://github.com/BowlerHatLLC/vscode-as3mxml/wiki/How-to-use-the-ActionScript-and-MXML-language-server-with-Sublime-Text
        */
        args.push("-Droyalelib=" + flexSDKBase);
        args.push("-Dfile.encoding=UTF8");
        args.push("-cp");
        args.push("" + base + "/bundled-compiler/*:" + base + "/bin/*");
        args.push("com.as3mxml.vscode.Main");

        if(nova.inDevMode()) {
            var argsOut = "";
            args.forEach(a => argsOut += a + " ");
            console.log(" *** ARGS:: \\/\\/\\/\n" + argsOut + "\n *** ARGS:: /\\/\\/\\");
        }

        var serverOptions = {
            path: "/usr/bin/java",
            args: args,
            type: "stdio"
        };
/*
        // From https://devforum.nova.app/t/lsp-doesnt-work-unless-re-activate-it/1798
        if (nova.inDevMode()) {
            serverOptions = {
                path: '/bin/bash',
                args: [
                  '-c',
                  `tee "${nova.extension.path}/logs/nova-client.log" | ${path} | tee "${nova.extension.path}/logs/lang-server.log"`,
                ],
            };
        }
*/
        var clientOptions = {
            syntaxes: ["AS3","MXML"],
            debug: true,
        };

        if (nova.inDevMode()) {
            console.log("serverOptions: " + JSON.stringify(serverOptions));
            console.log("clientOptions: " + JSON.stringify(clientOptions));
        }

        var client = new LanguageClient('actionscript', 'ActionScript & MXML Language Server', serverOptions, clientOptions);
        try {
            // Start the client
            if (nova.inDevMode()) {
                console.log(" *** Starting AS3MXML server at " + new Date().toLocaleString() + "--------------------");
            }

            client.start();

            client.onDidStop((error) => { console.log("**** AS3MXML ERROR: " + error + ". It may be still running: ", client.running); });

            nova.subscriptions.add(client);
            this.languageClient = client;
        }
        catch (err) {
            if (nova.inDevMode()) {
                console.error(" *** CAUGHT AN ERROR!!!" + err + " .... " + JSON.stringify(err) + " ***");
            }
        }
    }

    stop() {
        if (nova.inDevMode()) {
            console.log("AS3MXML stop() called!");
        }

        if (this.languageClient) {
            if (nova.inDevMode()) {
                console.log(" *** Attempting to stop this.languageClient! ");
            }
            this.languageClient.stop();
            if (nova.inDevMode()) {
                console.log(" *** Attempting to remove subscriptions of this.languageClient! ");
            }
            nova.subscriptions.remove(this.languageClient);
            if (nova.inDevMode()) {
                console.log(" *** Attempting to NULL this.languageClient! ");
            }
            this.languageClient = null;
        } else {
            if (nova.inDevMode()) {
                console.log(" *** this.languageClient is nothing...");
            }
        }
    }
}

