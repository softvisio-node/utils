import Events from "node:events";
import fs from "node:fs";
import path from "node:path";
import stream from "node:stream";
import tar from "#lib/tar";

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
    async check ( { remote = false, forceRemote } = {} ) {
        const res = await this.update( {
            remote,
            forceRemote,
            "silent": true,
        } );

        if ( !res.ok ) {
            if ( res.is3xx ) {
                console.warn( `Unable to update resource "${ this.id }":`, res + "" );
            }
            else {
                throw new Error( `Unable to update resource "${ this.id }": ${ res }` );
            }
        }

        return this;
    }

    async update ( { force, remote = true, forceRemote, ignoreEtag, silent, cache } = {} ) {
        if ( force ) {
            remote = true;
            forceRemote = true;
            ignoreEtag = true;
        }

        const localIndex = await this.#readIndex(),
            isInstalled = localIndex?.etag;

        // resource exists
        if ( isInstalled && !remote ) return result( 200 );

        const errorOnRemoteFailed = !isInstalled || forceRemote;

        var res,
            remoteIndex = cache?.[ this.#remoteIndexUrl ];

        // download remote index
        if ( !remoteIndex ) {
            res = await fetch( this.#remoteIndexUrl ).catch( e => result.catch( e, { "log": false } ) );

            if ( res.ok ) {
                remoteIndex = await res.json().catch( e => null );
            }

            // unable to download remote index
            if ( !remoteIndex ) {
                if ( errorOnRemoteFailed ) {
                    return result( result( [ 500, `Unable to download remote index` ] ) );
                }
                else {
                    return result( 302 );
                }
            }

            // cache remote index
            if ( cache ) cache[ this.#remoteIndexUrl ] = remoteIndex;
        }

        // remote resource not found
        if ( !remoteIndex[ this.#name ] ) {
            if ( errorOnRemoteFailed ) {
                return result( [ 500, `Resource not found` ] );
            }
            else {
                return result( 302 );
            }
        }

        remoteIndex = remoteIndex[ this.#name ];
        remoteIndex.lastUpdated = localIndex?.lastUpdated;

        // update is not required
        if ( !ignoreEtag && remoteIndex.etag === localIndex?.etag ) {
            await this.#writeIndex( remoteIndex );

            return result( [ 304, `Not modified` ] );
        }

        // update
        try {
            res = await fetch( this.#downloadUrl ).catch( e => result.catch( e, { "log": false } ) );
            if ( !res.ok ) throw res;

            await this.#createResourceDir();

            res = await new Promise( resolve => {
                const writable = tar.extract( {
                    "cwd": this.#location,
                } );

                stream.Readable.fromWeb( res.body ).pipe( writable );

                writable.once( "error", e => resolve( result.catch( e ) ) );

                writable.once( "end", () => resolve( result( 200 ) ) );
            } );
        }
        catch {}

        // update failed
        if ( !res.ok ) {

            // update index
            await this.#writeIndex( localIndex );

            if ( errorOnRemoteFailed ) {
                return res;
            }
            else {
                return result( 302 );
            }
        }

        remoteIndex.lastUpdated = new Date();

        await this.#writeIndex( remoteIndex );

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
    async #readIndex () {
        var index = await fs.promises.readFile( this.#indexPath ).catch( e => null );

        if ( index ) {
            index = JSON.parse( index );
        }

        this.#index = index;

        return index;
    }

    async #writeIndex ( index ) {
        index ||= {};

        index.id = this.id;
        index.lastChecked = new Date();

        this.#index = index;

        await this.#createResourceDir();

        return fs.promises.writeFile( this.#indexPath, JSON.stringify( index, null, 4 ) + "\n" );
    }

    async #createResourceDir () {
        return fs.promises.mkdir( this.#location, {
            "force": true,
            "recursive": true,
        } );
    }
}
