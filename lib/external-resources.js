import "#lib/result";
import Events from "node:events";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import env from "#lib/env";
import ExternalResource from "#lib/external-resources/resource";
import ansi from "#lib/text/ansi";

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60 * 4; // 4 hours

class ExternalResources extends Events {
    #defaultLocation = "global";
    #resources = {};
    #updateInterval;

    // public
    get ( id ) {
        id = this.buildResourceId( id );

        return this.#resources[ id ];
    }

    add ( id, { autoUpdate, location } = {} ) {
        autoUpdate ??= true;

        id = this.#parseResourceId( id, {
            location,
        } );

        if ( this.#resources[ id.id ] ) return this.#resources[ id ];

        const resource = new ExternalResource( id.id, id.location, {
            autoUpdate,
        } );

        this.#resources[ resource.id ] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async install ( { force, remote = true, forceRemote = true, ignoreEtag, log = true } = {} ) {
        if ( force ) {
            remote = true;
            forceRemote = true;
            ignoreEtag = true;
        }

        return this.#update( {
            remote,
            forceRemote,
            ignoreEtag,
            log,
        } );
    }

    async update ( { remote = true, forceRemote, ignoreEtag, log } = {} ) {
        return this.#update( {
            remote,
            forceRemote,
            ignoreEtag,
            log,
        } );
    }

    startUpdate () {
        if ( !this.#updateInterval ) {
            this.#updateInterval = setInterval(
                () =>
                    this.#update( {
                        "autoUpdate": true,
                        "remote": true,
                        "forceRemote": false,
                        "ignoreEtag": false,
                        "log": false,
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
        id = this.#parseResourceId( id );

        return id.id;
    }

    // private
    #parseResourceId ( id, { location } = {} ) {
        var napi, node, platform, architecture, caller;

        if ( typeof id === "object" ) {
            ( { id, napi, node, platform, architecture, caller } = id );
        }

        var packageRoot,
            [ owner, repo, tag, name ] = id.split( "/" );

        if ( !name ) {
            id = owner + "/" + repo;

            // set tag from package varsion
            if ( !tag ) {
                packageRoot = this.#findPackageRoot( caller );

                const version = JSON.parse( fs.readFileSync( packageRoot + "/package.json" ) ).version;

                if ( !version ) throw new Error( "Package version not defined" );

                tag = "v" + version;
            }

            id += "/" + tag;

            platform ||= process.platform;
            architecture ||= process.arch;

            // napi
            if ( napi ) {
                if ( napi === true ) napi = process.versions.napi;

                name = `napi-v${ napi }-${ platform }-${ architecture }`;
            }

            // node
            else if ( node ) {
                if ( node === true ) node = process.versions.modules;

                name = `node-v${ node }-${ platform }-${ architecture }`;
            }

            // error
            else {
                throw new Error( "Node or napi version is required" );
            }

            id += "/" + name;
        }

        // location
        if ( !location ) {
            if ( napi || node ) {
                location = "package";
            }
            else {
                location = this.#defaultLocation;
            }
        }

        // global
        if ( location === "global" ) {
            location = path.join( env.getDataDir( "softvisio" ), "external-resources", `${ owner }-${ repo }-${ tag }`, name );
        }

        // package
        else if ( location === "package" ) {
            packageRoot ??= this.#findPackageRoot( caller );

            location = path.join( packageRoot, "node_modules/.external-resources", `${ owner }-${ repo }-${ tag }`, name );
        }

        // invalid location
        else {
            throw new Error( "Location is not valid" );
        }

        return {
            id,
            location,
        };
    }

    #findPackageRoot ( location ) {
        if ( !location ) throw new Error( "Location is required" );

        if ( location instanceof URL ) {
            location = url.fileURLToPath( location );
        }
        else if ( location.startsWith( "file:" ) ) {
            location = url.fileURLToPath( location );
        }

        while ( true ) {
            if ( fs.existsSync( location + "/package.json" ) ) break;

            const parent = path.dirname( location );

            if ( location === parent ) throw new Error( `Unable to find package root` );

            location = parent;
        }

        if ( !location ) throw new Error( "Package not found" );

        return location;
    }

    async #update ( { remote, forceRemote, ignoreEtag, log, autoUpdate } = {} ) {
        if ( autoUpdate ) log = false;

        var error,
            pad = 0;

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
                remote,
                forceRemote,
                ignoreEtag,
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
}

export default new ExternalResources();
