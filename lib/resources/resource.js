import fs from "node:fs";
import path from "node:path";
import Events from "node:events";
import tar from "tar";
import stream from "node:stream";

export default class Resource extends Events {
    #id;
    #location;
    #owner;
    #repo;
    #tag;
    #name;
    #etag;
    #indexPath;
    #remoteIndexUrl;
    #downloadUrl;

    constructor ( id, root ) {
        super();

        this.#id = id;
        this.#location = path.join( root, id.replaceAll( "/", "-" ) );

        [this.#owner, this.#repo, this.#tag, this.#name] = id.split( "/" );

        this.#indexPath = path.join( this.#location, ".index.json" );

        this.#remoteIndexUrl = `https://github.com/${this.#owner}/${this.#repo}/releases/download/${this.#tag}/index.json`;
        this.#downloadUrl = `https://github.com/${this.#owner}/${this.#repo}/releases/download/${this.#tag}/${this.#name}.tar.gz`;

        if ( fs.existsSync( this.#indexPath ) ) {
            const index = this.#readIndex();

            this.#etag = index.etag;
        }
        else {
            fs.mkdirSync( this.#location, { "recursive": true } );
        }
    }

    // properties
    get id () {
        return this.#id;
    }

    get location () {
        return this.#location;
    }

    // public
    async update ( { remote, force } = {} ) {
        var res;

        if ( !remote && this.#etag ) return result( 200 );

        try {
            res = await fetch( this.#remoteIndexUrl );

            const index = await res.json();

            if ( !index?.[this.#name] ) return result( 404 );

            if ( !force && index?.[this.#name].etag === this.#etag ) return result( 304 );

            res = await fetch( this.#downloadUrl );

            await new Promise( resolve => {
                const writable = tar.extract( {
                    "cwd": this.#location,
                } );

                stream.Readable.fromWeb( res.body ).pipe( writable );

                writable.on( "end", () => resolve() );
            } );

            this.#writeIndex( index?.[this.#name] );

            this.emit( "update" );

            return result( 200 );
        }
        catch ( e ) {
            return result.catch( e );
        }
    }

    // private
    #readIndex () {
        return JSON.parse( fs.readFileSync( this.#indexPath ) );
    }

    #writeIndex ( index ) {
        fs.writeFileSync( this.#indexPath, JSON.stringify( index, null, 4 ) );

        this.#etag = index.etag;
    }
}
