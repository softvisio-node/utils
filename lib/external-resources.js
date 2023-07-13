require( "@softvisio/result" );
const path = require( "node:path" );
const fs = require( "node:fs" );
const ExternalResource = require( "#lib/external-resources/resource" );
const Events = require( "node:events" );

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour

class ExternalResources extends Events {
    #resources = {};
    #updateInterval;
    #updateCallbacks = [];
    #root;

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
        var ok = true;

        var pad = 0;

        if ( !silent ) {
            for ( const resource of Object.values( this.#resources ) ) {
                if ( resource.name.length > pad ) pad = resource.name.length;
            }
        }

        for ( const resource of Object.values( this.#resources ) ) {
            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.name}" ... `.padEnd( pad + 26 ) );

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

        // update now
        this.update( { "remote": true, "silent": true } );

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
        var root;

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

        return path.join( root, "node_modules/.external-resources" );
    }
}

module.exports = new ExternalResources();
