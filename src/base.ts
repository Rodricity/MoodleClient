/**
 * API client for the moodle web services.
 *
 * This is a thin wrapper around the request-promise module to simplify the
 * common querying Moodle external functions exposed via web services.  The
 * client uses webservice/rest/server.php end-point and supports authentication
 * via permanent tokens (which can be provided explicitly or obtained via login).
 *
 * @module moodle-client
 * @author David Mudrak <david@moodle.com>
 * @license BSD-2-Clause
 */

import request from 'request-promise-native';
import 'colors';









type LoggerFunction = (() => any) | ((...data: any[]) => any);
type Logger = {
    debug: LoggerFunction;
    info: LoggerFunction;
    warn: LoggerFunction;
    error: LoggerFunction;
}

type RawBaseClientOptions = {
    /** The logger to use, defaults to a dummy non-logger. */
    logger?: Logger | true
    /** The moodle hostname to connect to. */
    wwwroot?: string
    /** The web service to use */
    service?: string
    /** If set to false, SSL certificates do not need to be valid. */
    strictSSL?: boolean
}
export type BaseClientOptions = (RawBaseClientOptions & {
    /** The access token to use */
    token: string
}) | (RawBaseClientOptions & {
    /** The username to use to authenticate us (if no token provided). */
    username: string
    /** The password to use to authenticate us (if no token provided). */
    password: string
})

//A default Logger implementation
export var Logger = {
    debug: (...str: any[]) => { console.debug('[' + 'debug'.green + ']', ...str) },
    info: (...str: any[]) => { console.info('[' + 'info '.cyan + ']', ...str) },
    warn: (...str: any[]) => { console.warn('[' + 'warn '.yellow + ']', ...str) },
    error: (...str: any[]) => { console.error('[' + 'error'.red + ']', ...str) }
}

export class BaseClient {
    public logger: Logger = {
        // Set-up a dummy logger doing nothing.
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { }
    };
    private wwwroot?: string;
    private service?: string;
    public token?: string;
    private strictSSL = true;



    constructor(options: BaseClientOptions) {
        var options = options ?? {};
        Object.assign(this, options);
        if (options.logger === true) this.logger = Logger;

        if (!options.wwwroot)
            this.logger.error("[init] wwwroot not defined");


        if (!options.service) {
            this.logger.debug("[init] using default service moodle_mobile_app");
            this.service = "moodle_mobile_app";
        }

        //@ts-ignore
        if (!options.token) this.logger.debug("[init] setting up explicit token");
        else this.logger.debug("[init] no explicit token provided - requires authentication");


        if (!options.strictSSL) {
            this.logger.warn("ssl certificates not required to be valid");
            this.strictSSL = false;
        }
    }



    async call(options: {
        /** The name of the web service function to call. */
        wsfunction: string
        /** Web service function arguments. */
        args?: any
        /** HTTP method to use (GET|POST) */
        method?: 'GET' | 'POST'
        /**  Additional settings affecting the execution. */
        settings?: {
            /** Do not apply format_text() on description/summary/textarea */
            raw?: boolean
            /** Convert file urls to use the webservice/pluginfile.php. */
            fileurl?: boolean
            /** Apply filters during format_text(). */
            filter?: boolean
        }
    }) {
        //Default
        options.args ??= {};
        options.method ??= 'GET';
        //@ts-ignore
        options.method = options.method.toUpperCase();
        options.settings ??= {};
        options.settings.raw ??= false;
        options.settings.fileurl ??= true;
        options.settings.filter ??= false;

        var { wsfunction, args, settings } = options;

        if (!wsfunction) {
            this.logger.error("missing function name to execute");
            throw "missing function name to execute";
        }

        this.logger.debug("[call] calling web service function %s", wsfunction);

        var req_options: { uri: string } & request.RequestPromiseOptions = {
            form: undefined,
            uri: this.wwwroot + "/webservice/rest/server.php",
            json: true,
            qs: {
                ...args,
                wstoken: this.token,
                wsfunction: wsfunction,
                moodlewsrestformat: 'json',
                moodlewssettingraw: settings.raw,
                moodlewssettingfileurl: settings.fileurl,
                moodlewssettingfilter: settings.filter
            },
            qsStringifyOptions: {
                arrayFormat: "indices"
            },
            strictSSL: this.strictSSL,
            method: options.method
        }


        if (options.method === 'POST') {
            req_options.form = req_options.qs;
            delete req_options.qs;
        } else if (options.method !== 'GET') {
            this.logger.error("unsupported request method");
            throw 'unsupported request method';
        }

        return request(req_options);
    };

    async authenticate(username: string, password: string): Promise<this> {
        this.logger.debug("[init] requesting %s token from %s", this.service, this.wwwroot);

        var options = {
            uri: this.wwwroot + "/login/token.php",
            method: "POST",
            form: {
                service: this.service,
                username: username,
                password: password
            },
            strictSSL: this.strictSSL,
            json: true
        }

        try {
            var res = await request(options)
            if (res.token) {
                this.token = res.token;
                this.logger.debug("[init] token obtained");
                return this;
            } else if ("error" in res) {
                this.logger.error("authentication failed: " + res.error);
                throw new Error("authentication failed: " + res.error);
            } else {
                this.logger.error("authentication failed: unexpected server response");
                throw new Error("authentication failed: unexpected server response");
            }

        } catch (err) {
            console.log('R:' + err);
            throw (err);
        };
    };
}