// NOTE: https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md

const NAME_RE = /^[\da-z-]{1,32}$/,
    VALUE_RE = /^[\d+./A-Za-z-]+$/,
    PHC_RE = new RegExp( String.raw`^` +
            String.raw`\$(?<id>[\da-z-]{1,32})` + // id
            String.raw`(?:\$v=(?<version>\d+))?` + // version
            String.raw`(?:\$(?<params>[\da-z-]{1,32}=[\d+./A-Za-z-]+(?:,[\da-z-]{1,32}=[\d+./A-Za-z-]+)*))?` + // params
            String.raw`(?:\$(?<salt>[\d+./A-Za-z-]+))?` + // salt
            String.raw`(?:\$(?<hash>[\d+/A-Za-z]+))?` + // hash
            String.raw`$` );

// public
export function toPhc ( { id, version, params, salt, hash, defaultParams, sortParams } = {} ) {
    if ( !NAME_RE.test( id ) ) throw "ID must be in the kebab-case";

    var string = "$" + id;

    // version
    if ( version != null ) {
        if ( typeof version !== "number" ) throw "Version must be a number";

        if ( defaultParams?.v == null || Number( defaultParams.v ) !== version ) {
            string += "$v=" + version;
        }
    }

    // params
    if ( params ) {
        const values = [];

        params = Object.entries( params );

        if ( sortParams ) {
            params = params.sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) );
        }

        let name, value;

        for ( [ name, value ] of params ) {

            // name
            if ( !NAME_RE.test( name ) ) throw "Name must be in the kebab-case";
            if ( name === "v" ) throw 'Parameter name should not be a "v"';

            // value
            value ??= defaultParams?.[ name ];

            if ( value == null ) {
                continue;
            }
            else if ( value instanceof Buffer ) {
                value = value.toString( "base64" ).replace( /=+$/, "" );
            }
            else if ( !VALUE_RE.test( value ) ) {
                throw "Parameter value is not valid";
            }

            if ( defaultParams?.[ name ] == null || String( defaultParams[ name ] ) !== String( value ) ) {
                values.push( name + "=" + value );
            }
        }

        if ( values.length ) {
            string += "$" + values.join( "," );
        }
    }

    // salt
    if ( salt != null ) {
        if ( typeof salt === "string" ) {
            if ( !VALUE_RE.test( salt ) ) throw "Salt is not valid";
        }
        else if ( salt instanceof Buffer ) {
            salt = salt.toString( "base64" ).replace( /=+$/, "" );
        }
        else {
            throw "Salt is not valid";
        }

        if ( salt.length ) {
            string += "$" + salt;

            // hash
            if ( hash != null ) {
                if ( hash instanceof Buffer ) {
                    hash = hash.toString( "base64" ).replace( /=+$/, "" );
                }
                else {
                    throw "Hash is not valid";
                }

                if ( hash.length ) {
                    string += "$" + hash;
                }
            }
        }
    }

    return string;
}

export function fromPhc ( string, { defaultParams, decodeSalt = true, decodeHash = true } = {} ) {
    const match = string.match( PHC_RE );
    if ( !match ) throw "PHC string is not valid";

    const data = {
        "id": match.groups.id,
        "version": undefined,
        "params": undefined,
        "salt": match.groups.salt
            ? ( decodeSalt
                ? Buffer.from( match.groups.salt, "base64" )
                : match.groups.salt )
            : undefined,
        "hash": match.groups.hash
            ? ( decodeHash
                ? Buffer.from( match.groups.hash, "base64" )
                : match.groups.hash )
            : undefined,
    };

    // apply default values
    if ( defaultParams ) {
        for ( const [ name, value ] of Object.entries( defaultParams ) ) {
            if ( name === "v" ) {
                data.version = value == null
                    ? value
                    : Number( value );
            }
            else {
                data.params ??= {};
                data.params[ name ] = value;
            }
        }
    }

    // version
    if ( match.groups.version ) {
        data.version = Number( match.groups.version );
    }

    // params
    if ( match.groups.params ) {
        data.params ??= {};

        for ( const param of match.groups.params.split( "," ) ) {
            const [ name, value ] = param.split( "=" );

            if ( name === "v" ) throw "PHC params are not valid";

            data.params[ name ] = value;
        }
    }

    return data;
}
