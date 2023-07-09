import "@softvisio/result";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import Resource from "#lib/resources/resource";

const DEFAULT_UPDATE_INTERVAL = 1000 * 60 * 60 * 4; // 4 hours

class Resources {
    #resources = {};
    #updateInterval;
    #updateCallbacks = [];

    // public
    get ( id ) {
        return this.#resources[id];
    }

    async add ( id, importedFrom, { location = "data/resources" } = {} ) {
        if ( this.#resources[id] ) throw Error( `Resource id "${id}" already added` );

        var root = path.dirname( url.fileURLToPath( importedFrom ) );

        while ( true ) {
            if ( fs.existsSync( root + "/package.json" ) ) break;

            const parent = path.dirname( root );

            if ( parent === root ) throw Error( `Resource package root not found` );

            root = parent;
        }

        root = path.join( root, location );

        const resource = new Resource( id, root );

        this.#resources[id] = resource;

        return resource;
    }

    async update ( { force, silent = true } = {} ) {
        var ok = true;

        for ( const resource of Object.values( this.#resources ) ) {
            if ( !silent ) process.stdout.write( `Updating resounrce "${resource.id}" ... ` );

            const res = await resource.update( { force } );

            if ( !silent ) console.log( res + "" );

            if ( !res.ok && res.status !== 304 ) ok = false;
        }

        return result( ok ? 200 : 500 );
    }

    startUpdate () {
        if ( !this.#updateInterval ) {
            this.#updateInterval = setInterval( () => this.update(), DEFAULT_UPDATE_INTERVAL );
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

export default new Resources();
