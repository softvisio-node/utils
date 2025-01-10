import Events from "node:events";
import fs from "node:fs";
import path from "node:path";
import stream from "node:stream";
import tar from "#lib/tar";

const DEFAULT_CHECK_TIMEOUT = 1000 * 60 * 60 * 24; // 24 hours

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
    #isInstalled;
    #autoUpdate;
    #index;

    constructor ( id, location, { autoUpdate } = {} ) {
        super();

        this.#id = id;
        this.#location = location;
        this.#autoUpdate = Boolean( autoUpdate );

        [ this.#owner, this.#repo, this.#tag, this.#name ] = id.split( "/" );

        this.#indexPath = this.#location + ".json";

        this.#remoteIndexUrl = `https://github.com/${ this.#owner }/${ this.#repo }/releases/download/${ this.#tag }/${ this.#name }.json`;

        this.#downloadUrl = `https://github.com/${ this.#owner }/${ this.#repo }/releases/download/${ this.#tag }/${ this.#name }.tar.gz`;
    }

    // properties
    get id () {
        return this.#id;
    }

    get name () {
        return this.#name;
    }

    get isInstalled () {
        if ( this.#isInstalled == null ) {
            if ( fs.existsSync( this.#indexPath ) ) {
                this.#isInstalled = JSON.parse( fs.readFileSync( this.#indexPath ) ).lastUpdated;
            }
            else {
                this.#isInstalled = false;
            }
        }

        return this.#isInstalled;
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

    get expires () {
        return this.#index?.expires;
    }

    get isExpired () {
        return this.expires && this.expires <= Date.now();
    }

    get meta () {
        return this.#index?.meta;
    }

    get lastChecked () {
        return this.#index?.lastChecked;
    }

    get lastUpdated () {
        return this.#index?.lastUpdated;
    }

    // public
    async check ( { install = true, remote = false, forceRemote } = {} ) {

        // do not install
        if ( !install && !this.isInstalled ) return this;

        const res = await this.update( {
            remote,
            forceRemote,
            "silent": true,
        } );

        if ( !res.ok ) {
            if ( res.is3xx ) {
                if ( res.status !== 304 ) {
                    console.warn( `Unable to update resource "${ this.id }":`, res + "" );
                }
            }
            else {
                throw new Error( `Unable to update resource "${ this.id }": ${ res }` );
            }
        }

        return this;
    }

    async update ( { remote = true, forceRemote, ignoreEtag, silent } = {} ) {
        const localIndex = await this.#readIndex(),
            isInstalled = localIndex?.etag;

        // resource is expired
        if ( this.isExpired ) remote = true;

        // last checked interval
        if ( this.lastChecked && this.lastChecked + DEFAULT_CHECK_TIMEOUT < Date.now() ) remote = true;

        // resource exists
        if ( isInstalled && !remote ) return result( 304 );

        const errorOnRemoteFailed = !isInstalled || forceRemote;

        var res, remoteIndex;

        // download remote index
        res = await fetch( this.#remoteIndexUrl ).catch( e => result.catch( e, { "log": false } ) );

        if ( res.ok ) {
            remoteIndex = await res.json().catch( e => null );
        }

        // unable to download remote index
        if ( !remoteIndex ) {
            if ( errorOnRemoteFailed ) {
                return result( result( 404 ) );
            }
            else {
                return result( 302 );
            }
        }

        remoteIndex.lastUpdated = localIndex?.lastUpdated;

        if ( remoteIndex.buildDate ) remoteIndex.buildDate = new Date( remoteIndex.buildDate );
        if ( remoteIndex.expires ) remoteIndex.expires = new Date( remoteIndex.expires );

        // update is not required
        if ( !ignoreEtag && remoteIndex.etag === localIndex?.etag ) {
            await this.#writeIndex( remoteIndex );

            return result( 304 );
        }

        // update
        try {
            res = await fetch( this.#downloadUrl ).catch( e => result.catch( e, { "log": false } ) );
            if ( !res.ok ) throw res;

            await this.#createResourceDir();

            // unpack
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

        return result( [ 200, "Updated" ] );
    }

    toString () {
        return this.#id;
    }

    toJSON () {
        return this.#id;
    }

    getResourcePath ( resource ) {
        return path.join( this.location, resource );
    }

    // private
    async #readIndex () {
        var index = await fs.promises.readFile( this.#indexPath ).catch( e => null );

        if ( index ) {
            index = JSON.parse( index );

            if ( index.buildDate ) index.buildDate = new Date( index.buildDate );
            if ( index.lastChecked ) index.lastChecked = new Date( index.lastChecked );
            if ( index.expires ) index.expires = new Date( index.expires );

            if ( index.lastUpdated ) {
                index.lastUpdated = new Date( index.lastUpdated );

                this.#isInstalled = true;
            }
            else {
                this.#isInstalled = false;
            }
        }
        else {
            this.#isInstalled = false;
        }

        this.#index = index;

        return index;
    }

    async #writeIndex ( index ) {
        var id, lastChecked, lastUpdated;

        index ||= {};

        ( { id, lastChecked, lastUpdated, ...index } = index );

        id = this.id;
        lastChecked = new Date();

        index = {
            id,
            lastChecked,
            lastUpdated,
            ...index,
        };

        this.#index = index;

        await this.#createResourceDir();

        // write index
        await fs.promises.writeFile( this.#indexPath, JSON.stringify( index, null, 4 ) + "\n" );

        if ( index.lastUpdated ) {
            this.#isInstalled = true;
        }
        else {
            this.#isInstalled = false;
        }
    }

    async #createResourceDir () {
        return fs.promises.mkdir( this.#location, {
            "force": true,
            "recursive": true,
        } );
    }
}
