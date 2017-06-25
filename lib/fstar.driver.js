/* exported FStarDriver */
var FStarDriver = (function(JSOO_FStar, JSOO_FStar_Stdlib, console) {
    // function quit(exitCode) {
    //     window.console.log("F* exited with exit code", exitCode);
    //     window.console.error("No quit handler set up.");
    // }

    var settings = {
        catchExceptions: true
    };

    function freshJsooGlobalObject() {
        var obj = { console: console,
                    Array: Array,
                    Object: Object,
                    Error: Error };
        if (typeof(RangeError) !== "undefined")
            obj.RangeError = RangeError; /* global RangeError */
        if (typeof(Uint8Array) !== "undefined")
            obj.Uint8Array = Uint8Array; /* global Uint8Array */
        if (typeof(InternalError) !== "undefined")
            obj.InternalError = InternalError; /* global InternalError */
        return obj;
    }

    // Start a new instance of F* with arguments ‘args’.
    function newFStar(args) {
        var obj = freshJsooGlobalObject();
        obj.fstar_args = args;
        JSOO_FStar_Stdlib(obj);
        JSOO_FStar(obj);
        return obj;
    }

    // Initialize a new F* REPL in --ide mode, working on file ‘fname’ with
    // arguments ‘args’.  ‘fcontents_callback’ is called (with no arguments)
    // every time F* tries to read the contents of ‘fname’.  ‘message_callback’ is
    // called (with one argument, a JSON message) every time F* sends an
    // out-of-band message.
    function newIDE(fname, fcontents, args, message_callback) {
        var IDE_FLAG = "--ide";
        if (!args.includes(IDE_FLAG)) {
            args = args.concat([IDE_FLAG]);
        }

        var instance = newFStar(args.concat([fname]));
        instance.writeFile(fname, fcontents);

        var repl = instance.repl;
        repl.init(fname, function (messageStr) {
            message_callback(JSON.parse(messageStr))
        });

        // Run ‘query’ synchronously.  This is mostly for debugging purposes,
        // since F*'s --ide mode might become asynchronous some day.
        function evalSync(query) {
            return JSON.parse(repl.evalStr(JSON.stringify(query)));
        }

        // Run ‘query’, passing the results to ‘callback’.  This currently calls
        // ‘callback’ immediately, but clients shouldn't rely on this.
        function eval(query, callback) {
            callback(evalSync(query));
        }

        // Set contents of ‘fname’ to ‘fcontents’.
        function updateFile(fcontents) {
            instance.writeFile(fname, fcontents);
        }

        return { eval: eval,
                 evalSync: evalSync,
                 updateFile: updateFile };
    }

    function Flusher(channel) {
        var lines = [];
        var label = channel + ":";
        this.lines = lines;
        this.write = function(line) {
            console.log(label, line.replace(/[\r\n]+$/, ""));
            lines.push(line);
        };
    }

    function verify(fname, fcontents, args, stdout, stderr) {
        var instance = newFStar(args.concat([fname]));
        instance.setChannelFlushers(stdout, stderr);
        instance.writeFile(fname, fcontents);
        if (settings.catchExceptions) {
            return instance.callMain();
        } else {
            return instance.callMainUnsafe();
        }
    }

    function verifySync(fname, fcontents, args) {
        var stdout = new Flusher("stdout"), stderr = new Flusher("stderr");
        var retv = verify(fname, fcontents, args, stdout.write, stderr.write);
        return { "exitCode": retv,
                 "stdout": stdout.lines,
                 "stderr": stderr.lines };
    }

    return { ide: { newIDE: newIDE },
             cli: { verify: verify,
                    verifySync: verifySync },
             newFStar: newFStar,
             settings: settings };
})(JSOO_FStar, JSOO_FStar_Stdlib, console);
/* global JSOO_FStar JSOO_FStar_Stdlib console */

/* global module */
if (typeof(module) !== "undefined" && module.hasOwnProperty("exports")) {
    module.exports = FStarDriver;
}