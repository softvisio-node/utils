require( "@softvisio/result" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const ExternalResource = require( "#lib/external-resources/resource" );
const Events = require( "node:events" );
const url = require( "node:url" );

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour

class ExternalResources extends Events {
    #resources = {};
    #updateInterval;
    #updateCallbacks = [];

    // public
    get ( id ) {
        return this.#resources[id];
    }

    add ( id = {} ) {
        if ( this.#resources[id] ) return this.#resources[id];

        const root = this.#findRoot();

        const resource = new ExternalResource( id, root );

        this.#resources[id] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async update ( { remote, force, silent = true } = {} ) {
        var error,
            pad = 0,
            cache = {};

        if ( !silent ) {
            for ( const resource of Object.values( this.#resources ) ) {
                if ( resource.name.length > pad ) pad = resource.name.length;
            }
        }

        for ( const resource of Object.values( this.#resources ) ) {
            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.name}" ... `.padEnd( pad + 26 ) );

            const res = await resource.update( { remote, force, cache } );

            if ( !silent ) console.log( res + "" );

            if ( !res.ok && res.status !== 304 ) error = true;
        }

        return result( error ? 500 : 200 );
    }

    startUpdate () {
        if ( !this.#updateInterval ) {
            this.#updateInterval = setInterval( () => this.update( { "remote": true, "silent": true } ), DEFAULT_UPDATE_INTERVAL );
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

        var root = fs.realpathSync( url.fileURLToPath( stack[1].getFileName() ) );

        while ( true ) {
            if ( fs.existsSync( root + "/package.json" ) ) break;

            const parent = path.dirname( root );

            if ( root === parent ) throw Error( `Unable to find package root` );

            root = parent;
        }

        return path.join( root, "node_modules/.external-resources" );
    }
}

module.exports = new ExternalResources();
