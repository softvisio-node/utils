require( "@softvisio/result" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const url = require( "node:url" );
const ExternalResource = require( "#lib/external-resources/resource" );
const Events = require( "node:events" );

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60 * 4; // 4 hours

class ExternalResources extends Events {
    #resources = {};
    #updateInterval;
    #updateCallbacks = [];
    #root;

    // public
    get ( id ) {
        return this.#resources[id];
    }

    add ( id, { location = "/data/external-resources", resolve } = {} ) {
        if ( this.#resources[id] ) return this.#resources[id];

        const root = this.#findRoot( location, resolve );

        const resource = new ExternalResource( id, root );

        this.#resources[id] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async update ( { remote, force, silent = true } = {} ) {
        var ok = true;

        var pad = 0;

        if ( !silent ) {
            for ( const resource of Object.values( this.#resources ) ) {
                if ( resource.name.length > pad ) pad = resource.name.length;
            }
        }

        for ( const resource of Object.values( this.#resources ) ) {
            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.name}" ... `.padEnd( pad + 25 ) );

            const res = await resource.update( { remote, force } );

            if ( !silent ) console.log( res + "" );

            if ( !res.ok && res.status !== 304 ) ok = false;
        }

        return result( ok ? 200 : 500 );
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
    #findRoot ( location, resolve ) {
        var root;

        if ( location.startsWith( "/" ) ) {
            if ( !this.#root ) {
                root = fs.realpathSync( global[Symbol.for( "mainThreadArgv1" )] || process.argv[1] );

                const idx = root.indexOf( path.sep + "node_modules" + path.sep );

                if ( idx >= 0 ) {
                    root = root.substring( 0, idx );
                }

                while ( true ) {
                    if ( fs.existsSync( root + "/package.json" ) ) break;

                    const parent = path.dirname( root );

                    if ( parent === root ) throw Error( `Resource package root not found` );

                    root = parent;
                }

                this.#root = root;
            }

            root = this.#root;
        }
        else {
            root = resolve instanceof URL || resolve.startsWith( "file:" ) ? url.fileURLToPath( resolve ) : resolve;

            while ( true ) {
                if ( fs.existsSync( root + "/package.json" ) ) break;

                const parent = path.dirname( root );

                if ( parent === root ) throw Error( `Resource package root not found` );

                root = parent;
            }
        }

        return path.join( root, location );
    }
}

module.exports = new ExternalResources();
