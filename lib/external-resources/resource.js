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

    // XXX
    // 200 - updated
    // 302 - remote failed, use local
    // 304 - remote checked, not modified
    // 500 - error
    async update ( { force, remote = true, forceRemote, ignoreEtag, silent, cache } = {} ) {
        if ( force ) {
            remote = true;
            forceRemote = true;
            ignoreEtag = true;
        }

        var res;

        const localIndex = this.#readIndex(),
            isInstalled = localIndex.etag;

        // resource exists
        if ( isInstalled && !remote ) return result( 200 );

        let remoteIndex = cache?.[ this.#remoteIndexUrl ];

        // download remote index
        if ( !remoteIndex ) {
            res = await fetch( this.#remoteIndexUrl ).catch( e => result.catch( e, { "log": false } ) );

            if ( res.ok ) {
                remoteIndex = await res.json().catch( e => null );
            }

            // unable to download remote index
            if ( !remoteIndex ) {
                if ( !isInstalled || forceRemote ) {
                    return result( result( [ 500, `Unable to download remote index` ] ) );
                }
                else {
                    return result( [ 302, `Found` ] );
                }
            }

            // cache remote index
            if ( cache ) cache[ this.#remoteIndexUrl ] = remoteIndex;
        }

        // remote resource not found
        if ( !remoteIndex[ this.#name ] ) return result( [ 500, `Remote resource not found` ] );

        remoteIndex = remoteIndex[ this.#name ];

        remoteIndex.id = this.id;
        remoteIndex.lastChecked = new Date();
        remoteIndex.lastUpdated = localIndex.lastUpdated;

        // update is not required
        if ( !ignoreEtag && remoteIndex.etag === localIndex.etag ) {
            this.#writeIndex( remoteIndex );

            return result( [ 304, `Not modified` ] );
        }

        // update
        res = await fetch( this.#downloadUrl ).catch( e => result.catch( e, { "log": false } ) );

        // unable to download remote resource
        if ( !res.ok ) {

            // XXX isInstalled + forceRemote
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
