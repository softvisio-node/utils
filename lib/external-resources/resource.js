import fs from "node:fs";
import path from "node:path";
import Events from "node:events";
import tar from "#lib/tar";
import stream from "node:stream";

export default class ExternalResource extends Events {
    #id;
    #location;
    #owner;
    #repo;
    #tag;
    #name;
    #indexPath;
    #remoteIndexUrl;
    #downloadUrl;
    #autoUpdate;
    #index;

    constructor ( id, packageRoot, { autoUpdate } = {} ) {
        super();

        this.#id = id;

        this.#autoUpdate = !!autoUpdate;

        [ this.#owner, this.#repo, this.#tag, this.#name ] = id.split( "/" );

        this.#location = path.join( packageRoot, "node_modules/.external-resources", `${ this.#owner }-${ this.#repo }-${ this.#tag }`, this.#name );

        this.#indexPath = path.join( this.#location, ".index.json" );

        this.#remoteIndexUrl = `https://github.com/${ this.#owner }/${ this.#repo }/releases/download/${ this.#tag }/index.json`;

        this.#downloadUrl = `https://github.com/${ this.#owner }/${ this.#repo }/releases/download/${ this.#tag }/${ this.#name }.tar.gz`;
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

    get autoUpdate () {
        return this.#autoUpdate;
    }

    get etag () {
        return this.#index?.etag;
    }

    get meta () {
        return this.#index?.meta;
    }

    // public
    async check ( { remote = false, force } = {} ) {
        const res = await this.update( { remote, force, "silent": true } );

        if ( !res.ok && res.status !== 304 ) {
            if ( res.status === 302 ) {
                console.warn( `Unable to update resource "${ this.id }":`, res + "" );
            }
            else {
                throw Error( `Unable to update resource "${ this.id }": ${ res }` );
            }
        }

        return this;
    }

    async update ( { remote = true, force, silent, cache } = {} ) {
        var res;

        const localIndex = this.#readIndex(),
            isInstalled = localIndex.etag;

        // resource exists
        if ( !remote && isInstalled ) return result( 200 );

        let remoteIndex = cache?.[ this.#remoteIndexUrl ];

        // download remote index
        if ( !remoteIndex ) {
            res = await fetch( this.#remoteIndexUrl ).catch( e => result.catch( e, { "log": false } ) );

            // unable to download remote index
            if ( !res.ok ) {
                if ( isInstalled ) {
                    return result( 302 );
                }
                else {
                    return result( res );
                }
            }

            remoteIndex = await res.json().catch( e => null );

            if ( !remoteIndex ) {
                if ( isInstalled ) {
                    return result( 302 );
                }
                else {
                    return result( [ 500, `Remote index not found` ] );
                }
            }

            if ( cache ) cache[ this.#remoteIndexUrl ] = remoteIndex;
        }

        // remote resource not found
        if ( !remoteIndex[ this.#name ] ) return result( 404 );

        remoteIndex = remoteIndex[ this.#name ];

        remoteIndex.id = this.id;
        remoteIndex.lastChecked = new Date();
        remoteIndex.lastUpdated = localIndex.lastUpdated;

        // update is not required
        if ( !force && remoteIndex.etag === localIndex.etag ) {
            this.#writeIndex( remoteIndex );

            return result( 304 );
        }

        // update
        res = await fetch( this.#downloadUrl ).catch( e => result.catch( e, { "log": false } ) );

        // unable to download remote resource
        if ( !res.ok ) {
            this.#writeIndex( remoteIndex );

            return result( res );
        }

        this.#createResourceDir();

        res = await new Promise( resolve => {
            const writable = tar.extract( {
                "cwd": this.#location,
            } );

            stream.Readable.fromWeb( res.body ).pipe( writable );

            writable.once( "error", e => resolve( result.catch( e ) ) );

            writable.once( "end", () => resolve( result( 200 ) ) );
        } );

        // update error
        if ( !res.ok ) {
            return res;
        }

        remoteIndex.lastUpdated = new Date();

        this.#writeIndex( remoteIndex );

        if ( !silent ) this.emit( "update", this );

        return result( 200 );
    }

    toString () {
        return this.#id;
    }

    toJSON () {
        return this.#id;
    }

    // private
    #createResourceDir () {
        if ( !fs.existsSync( this.#location ) ) {
            fs.mkdirSync( this.#location, { "recursive": true } );
        }
    }

    #readIndex () {
        let index;

        if ( fs.existsSync( this.#indexPath ) ) {
            index = JSON.parse( fs.readFileSync( this.#indexPath ) );
        }

        this.#index = index;

        return index || {};
    }

    #writeIndex ( index ) {
        this.#index = index;

        this.#createResourceDir();

        fs.writeFileSync( this.#indexPath, JSON.stringify( index, null, 4 ) + "\n" );
    }
}
