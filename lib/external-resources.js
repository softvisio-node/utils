import "#lib/result";
import path from "node:path";
import fs from "node:fs";
import ExternalResource from "#lib/external-resources/resource";
import Events from "node:events";
import url from "node:url";
import ansi from "#lib/text/ansi";

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour

class ExternalResources extends Events {
    #resources = {};
    #updateInterval;
    #updateCallbacks = [];

    // public
    get ( id ) {
        return this.#resources[id];
    }

    add ( id, { napi, node, platform, architecture = true } = {} ) {
        const { tag, root } = this.#findRoot();

        id = this.buildResourceId( {
            id,
            tag,
            napi,
            node,
            platform,
            architecture,
        } );

        if ( this.#resources[id] ) return this.#resources[id];

        const autoUpdate = !!( napi || node );

        const resource = new ExternalResource( id, root, {
            autoUpdate,
        } );

        this.#resources[id] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async update ( { remote = true, force, silent = true, autoUpdate } = {} ) {
        var error,
            pad = 0,
            cache = {};

        if ( !silent ) {
            for ( const resource of Object.values( this.#resources ) ) {
                if ( autoUpdate && !resource.autoUpdate ) continue;

                if ( resource.name.length > pad ) pad = resource.name.length;
            }
        }

        for ( const resource of Object.values( this.#resources ) ) {
            if ( autoUpdate && !resource.autoUpdate ) continue;

            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.name}" ... `.padEnd( pad + 26 ) );

            const res = await resource.update( { remote, force, cache } );

            if ( res.ok ) {
                if ( !silent ) console.log( ansi.ok( " " + res.statusText + " " ) );
            }
            else if ( res.status === 304 ) {
                if ( !silent ) console.log( res.statusText );
            }
            else {
                error = true;

                if ( !silent ) console.log( ansi.error( " " + res.statusText + " " ) );
            }
        }

        return result( error ? 500 : 200 );
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

    buildResourceId ( id, { tag, napi, node, platform, architecture } = {} ) {
        const [repoOwner, repoName, repoTag, name] = id.split( "/" );

        id = repoOwner + "/" + repoName;

        if ( !repoTag ) {
            id += "/" + tag;
        }

        if ( !name ) {
            platform ||= process.platform;
            architecture ||= process.arch;

            if ( napi ) {
                if ( napi === true ) napi = process.versions.napi;

                id += `/napi-v${napi}-${platform}-${architecture}`;
            }
            else if ( node ) {
                if ( node === true ) node = process.versions.modules;

                id += `/node-v${node}-${platform}-${architecture}`;
            }
        }

        return id;
    }

    // private
    #findRoot () {
        const stackTraceLimit = Error.stackTraceLimit,
            prepareStackTrace = Error.prepareStackTrace;

        Error.stackTraceLimit = 2;

        Error.prepareStackTrace = function ( trace, callSite ) {
            return callSite;
        };

        const trace = {};

        Error.captureStackTrace( trace, this.#findRoot );

        const stack = trace.stack;

        Error.stackTraceLimit = stackTraceLimit;
        Error.prepareStackTrace = prepareStackTrace;

        var root = stack[1].getFileName();
        if ( root.startsWith( "file:" ) ) root = url.fileURLToPath( root );
        root = fs.realpathSync( root );

        while ( true ) {
            if ( fs.existsSync( root + "/package.json" ) ) break;

            const parent = path.dirname( root );

            if ( root === parent ) throw Error( `Unable to find package root` );

            root = parent;
        }

        const tag = "v" + JSON.parse( fs.readFileSync( root + "/package.json" ) ).version;

        return {
            tag,
            "root": path.join( root, "node_modules/.external-resources" ),
        };
    }
}

export default new ExternalResources();
