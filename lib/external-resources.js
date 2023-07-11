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

    // public
    get ( id ) {
        return this.#resources[id];
    }

    add ( id, importedFrom, { location = "data/external-resources" } = {} ) {
        if ( this.#resources[id] ) return this.#resources[id];

        var root = path.dirname( importedFrom instanceof URL ? url.fileURLToPath( importedFrom ) : importedFrom );

        while ( true ) {
            if ( fs.existsSync( root + "/package.json" ) ) break;

            const parent = path.dirname( root );

            if ( parent === root ) throw Error( `Resource package root not found` );

            root = parent;
        }

        root = path.join( root, location );

        const resource = new ExternalResource( id, root );

        this.#resources[id] = resource;

        resource.on( "update", resource => this.emit( "update", resource ) );

        return resource;
    }

    async update ( { remote, force, silent = true } = {} ) {
        var ok = true;

        for ( const resource of Object.values( this.#resources ) ) {
            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.name}" ... ` );

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
}

module.exports = new ExternalResources();
