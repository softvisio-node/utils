import "#lib/result";
import Events from "node:events";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import ExternalResource from "#lib/external-resources/resource";
import ansi from "#lib/text/ansi";

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour

class ExternalResources extends Events {
    #resources = {};
    #updateInterval;

    // public
    get ( id ) {
        id = this.buildResourceId( id );

        return this.#resources[ id ];
    }

    add ( id ) {
        const caller = this.#getCaller();

        const packageRoot = this.#findPackageRoot( caller );

        var autoUpdate = true;

        if ( typeof id === "object" ) {
            if ( id.napi || id.node ) autoUpdate = false;

            id = this.buildResourceId( {
                ...id,
                packageRoot,
            } );
        }

        if ( this.#resources[ id ] ) return this.#resources[ id ];

        const resource = new ExternalResource( id, packageRoot, {
            autoUpdate,
        } );

        this.#resources[ id ] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async install ( { force, remote = true, forceRemote = true, ignoreEtag, log = true } = {} ) {
        return this.update( {
            force,
            remote,
            forceRemote,
            ignoreEtag,
            log,
        } );
    }

    async update ( { force, remote = true, forceRemote, ignoreEtag, log, autoUpdate } = {} ) {
        if ( autoUpdate ) log = false;

        var error,
            pad = 0,
            cache = {};

        if ( log || autoUpdate ) {
            for ( const resource of Object.values( this.#resources ) ) {
                if ( autoUpdate && !resource.autoUpdate ) continue;

                if ( resource.name.length > pad ) pad = resource.name.length;
            }
        }

        for ( const resource of Object.values( this.#resources ) ) {
            if ( autoUpdate && !resource.autoUpdate ) continue;

            const logHeader = `Updating resounrce "${ resource.name }" ... `.padEnd( pad + 26 );

            if ( log ) process.stdout.write( logHeader );

            const res = await resource.update( {
                force,
                remote,
                forceRemote,
                ignoreEtag,
                cache,
            } );

            let logResult;

            if ( res.ok ) {
                logResult = ansi.ok( " " + res.statusText + " " );
            }
            else if ( res.is3xx ) {
                logResult = res.statusText;
            }
            else {
                error = true;

                logResult = ansi.error( " " + res.statusText + " " );
            }

            if ( log ) {
                console.log( logResult );
            }
            else if ( autoUpdate && res.status !== 304 ) {
                console.log( logHeader + logResult );
            }
        }

        return result( error
            ? 500
            : 200 );
    }

    startUpdate () {
        if ( !this.#updateInterval ) {
            this.#updateInterval = setInterval(
                () =>
                    this.update( {
                        "autoUpdate": true,
                    } ),
                DEFAULT_UPDATE_INTERVAL
            );
        }

        return this;
    }

    stopUpdate () {
        if ( this.#updateInterval ) {
            clearInterval( this.#updateInterval );

            this.#updateInterval = null;
        }

        return this;
    }

    buildResourceId ( id ) {
        if ( typeof id === "string" ) return id;

        var tag, napi, node, platform, architecture, packageRoot;

        ( { id, tag, napi, node, platform, architecture, packageRoot } = id );

        var [ repoOwner, repoName, repoTag, name ] = id.split( "/" );

        if ( name ) return id;

        id = repoOwner + "/" + repoName;

        if ( !repoTag ) {
            if ( !tag ) {
                packageRoot = this.#findPackageRoot( packageRoot );

                tag = "v" + JSON.parse( fs.readFileSync( packageRoot + "/package.json" ) ).version;
            }

            repoTag = tag;
        }

        id += "/" + repoTag;

        platform ||= process.platform;
        architecture ||= process.arch;

        if ( napi ) {
            if ( napi === true ) napi = process.versions.napi;

            id += `/napi-v${ napi }-${ platform }-${ architecture }`;
        }
        else if ( node ) {
            if ( node === true ) node = process.versions.modules;

            id += `/node-v${ node }-${ platform }-${ architecture }`;
        }

        return id;
    }

    // private
    #findPackageRoot ( packageRoot ) {
        if ( packageRoot instanceof URL ) {
            packageRoot = url.fileURLToPath( packageRoot );
        }
        else if ( packageRoot.startsWith( "file:" ) ) {
            packageRoot = url.fileURLToPath( packageRoot );
        }

        while ( true ) {
            if ( fs.existsSync( packageRoot + "/package.json" ) ) break;

            const parent = path.dirname( packageRoot );

            if ( packageRoot === parent ) throw new Error( `Unable to find package root` );

            packageRoot = parent;
        }

        return packageRoot;
    }

    #getCaller () {
        const stackTraceLimit = Error.stackTraceLimit,
            prepareStackTrace = Error.prepareStackTrace;

        Error.stackTraceLimit = 2;

        Error.prepareStackTrace = function ( trace, callSite ) {
            return callSite;
        };

        const trace = {};

        Error.captureStackTrace( trace, this.#getCaller );

        const stack = trace.stack;

        Error.stackTraceLimit = stackTraceLimit;
        Error.prepareStackTrace = prepareStackTrace;

        var caller = stack[ 1 ].getFileName();

        if ( caller.startsWith( "file:" ) ) caller = url.fileURLToPath( caller );

        caller = fs.realpathSync( caller );

        return caller;
    }
}

export default new ExternalResources();
