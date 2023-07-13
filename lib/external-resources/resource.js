const fs = require( "node:fs" );
const path = require( "node:path" );
const Events = require( "node:events" );
const tar = require( "tar" );
const stream = require( "node:stream" );

module.exports = class ExternalResource extends Events {
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

        [this.#owner, this.#repo, this.#tag, this.#name] = id.split( "/" );

        this.#location = path.join( root, `${this.#owner}-${this.#repo}-${this.#tag}`, this.#name );

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

    get name () {
        return this.#name;
    }

    get location () {
        return this.#location;
    }

    // public
    async check ( { remote, force } = {} ) {
        const res = await this.update( { remote, force, "silent": true } );

        if ( !res.ok && res.status !== 304 ) {
            throw Error( `Unable to update resource "${this.is}": ${res}` );
        }

        return this;
    }

    async update ( { remote, force, silent } = {} ) {
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

            if ( !silent ) this.emit( "update", this );

            return result( 200 );
        }
        catch ( e ) {
            return result.catch( e );
        }
    }

    toString () {
        return this.#id;
    }

    toJSON () {
        return this.#id;
    }

    // private
    #readIndex () {
        return JSON.parse( fs.readFileSync( this.#indexPath ) );
    }

    #writeIndex ( index ) {
        fs.writeFileSync( this.#indexPath, JSON.stringify( index, null, 4 ) );

        this.#etag = index.etag;
    }
};
