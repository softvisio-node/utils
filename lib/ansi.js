import stream from "node:stream";
import { makeCallable } from "#lib/callable";

const ESC = "\x1B",
    CSI = ESC + "[",
    OSC = ESC + "]",
    ST = ESC + "\\",
    ANSI_REGEXP = new RegExp( /(?:\x1B\[|\u009B)[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/, "g" ),

    // ANSI SGR code ends with the "m"
    ANSI_KEEP_STYLES_REGEXP = new RegExp( /(?:\x1B\[|\u009B)[\x30-\x3F]*[\x20-\x2F]*[\x40-\x6Cn~]/, "g" ),
    ANSI_LINK_REGEXP = new RegExp( /\x1B]8;;(.*?)\x1B\\(.*?)\x1B]8;;\x1B\\/, "g" ),
    RESET = CSI + "0m",
    RESET_FOREGROUND = CSI + "39m",
    RESET_BACKGROUND = CSI + "49m",
    COLOR_BUFFER = Buffer.alloc( 4 ),
    DEFAULT_STYLES = {
        "reset": [ 0, null ],

        "bold": [ 1, 22 ],
        "dim": [ 2, 22 ],
        "italic": [ 3, 23 ],
        "underline": [ 4, 24 ],
        "blink": [ 5, 25 ],
        "inverse": [ 7, 27 ],
        "hidden": [ 8, 28 ],
        "strikethrough": [ 9, 29 ],
        "doubleUnderline": [ 21, 24 ],
        "overline": [ 53, 55 ],

        "black": [ 30, 39 ],
        "red": [ 31, 39 ],
        "green": [ 32, 39 ],
        "yellow": [ 33, 39 ],
        "blue": [ 34, 39 ],
        "magenta": [ 35, 39 ],
        "cyan": [ 36, 39 ],
        "white": [ 37, 39 ],
        "gray": [ 90, 39 ], // alias for brightBlack
        "grey": [ 90, 39 ], // alias for brightBlack

        "onBlack": [ 40, 49 ],
        "onRed": [ 41, 49 ],
        "onGreen": [ 42, 49 ],
        "onYellow": [ 43, 49 ],
        "onBlue": [ 44, 49 ],
        "onMagenta": [ 45, 49 ],
        "onCyan": [ 46, 49 ],
        "onWhite": [ 47, 49 ],
        "onGray": [ 100, 49 ], // alias for onBrightBlack
        "onGrey": [ 100, 49 ], // alias for onBrightBlack

        "brightBlack": [ 90, 39 ],
        "brightRed": [ 91, 39 ],
        "brightGreen": [ 92, 39 ],
        "brightYellow": [ 93, 39 ],
        "brightBlue": [ 94, 39 ],
        "brightMagenta": [ 95, 39 ],
        "brightCyan": [ 96, 39 ],
        "brightWhite": [ 97, 39 ],

        "onBrightBlack": [ 100, 49 ],
        "onBrightRed": [ 101, 49 ],
        "onBrightGreen": [ 102, 49 ],
        "onBrightYellow": [ 103, 49 ],
        "onBrightBlue": [ 104, 49 ],
        "onBrightMagenta": [ 105, 49 ],
        "onBrightCyan": [ 106, 49 ],
        "onBrightWhite": [ 107, 49 ],
    };

function parseEnabled ( enabled ) {
    if ( enabled == null ) {
        enabled = null;
    }
    else if ( enabled instanceof stream.Writable ) {
        enabled = enabled.isTTY;
    }
    else {
        enabled = Boolean( enabled );
    }

    return enabled;
}

const ansiStyle = ansi =>
    class AnsiStyle {
        #ansi = ansi;
        #name;
        #isEnabled;
        #on;
        #off;

        constructor ( { name, on, off, enabled } ) {
            this.#name = name;
            this.#on = on;
            this.#off = off;
            this.#isEnabled = parseEnabled( enabled );
        }

        // properties
        get ansi () {
            return this.#ansi;
        }

        get name () {
            return this.#name;
        }

        get on () {
            return this.#on;
        }

        get off () {
            return this.#off;
        }

        get isEnabled () {
            return this.#isEnabled ?? this.#ansi.isEnabled;
        }

        // public
        enable ( enabled ) {

            // clone named style
            if ( this.#name ) {
                return this._addStyle( {
                    "on": "",
                    "off": "",
                    enabled,
                } );
            }

            // update style
            else {
                this.#isEnabled = parseEnabled( enabled );

                return makeCallable( this, "applyStyle" );
            }
        }

        color ( color ) {
            return this._addStyle( {
                "on": this.#ansi.createColor( 38, color ),
                "off": RESET_FOREGROUND,
            } );
        }

        onColor ( color ) {
            return this._addStyle( {
                "on": this.#ansi.createColor( 48, color ),
                "off": RESET_BACKGROUND,
            } );
        }

        applyStyle ( string ) {

            // stringify
            string = String( string );

            if ( !this.isEnabled ) return string;

            if ( !string ) return "";

            if ( string.includes( "\n" ) ) {
                return this.#on + string.replaceAll( /\r*\n/g, `${ this.#off }$&${ this.#on }` ) + this.#off;
            }
            else {
                return this.#on + string + this.#off;
            }
        }

        // protected
        _addStyle ( { on, off, enabled } ) {

            // clone named style
            if ( this.#name ) {
                return makeCallable(
                    new this.constructor( {
                        "on": this.#on + on,
                        "off": off + this.#off,
                        enabled,
                    } ),
                    "applyStyle"
                );
            }

            // update style
            else {
                this.#on = this.#on + on;
                this.#off = off + this.#off;

                return makeCallable( this, "applyStyle" );
            }
        }
    };

export class Ansi {
    static #globalEnabled = true;

    #AnsiStyle;
    #isEnabled;

    constructor () {
        this.#AnsiStyle = ansiStyle( this );

        // define default styles
        for ( const [ name, [ on, off ] ] of Object.entries( DEFAULT_STYLES ) ) {
            this.defineStyle( name, {
                "configurable": false,
                "on": on
                    ? CSI + on + "m"
                    : null,
                "off": off
                    ? CSI + off + "m"
                    : null,
            } );
        }
    }

    // static
    static get isEnabled () {
        return this.#globalEnabled;
    }

    static setEnabled ( enabled, callback ) {
        const wasEnabled = this.#globalEnabled;

        this.#globalEnabled = Boolean( parseEnabled( enabled ) );

        if ( callback ) {
            try {
                callback();

                this.#globalEnabled = wasEnabled;
            }
            catch ( e ) {
                this.#globalEnabled = wasEnabled;

                throw e;
            }
        }
    }

    // properties
    get RESET () {
        return RESET;
    }

    get isEnabled () {
        return this.#isEnabled ?? this.constructor.isEnabled;
    }

    get regExp () {
        return ANSI_REGEXP;
    }

    // public
    setEnabled ( enabled, callback ) {
        const wasEnabled = this.#isEnabled;

        this.#isEnabled = parseEnabled( enabled );

        if ( callback ) {
            try {
                callback();

                this.#isEnabled = wasEnabled;
            }
            catch ( e ) {
                this.#isEnabled = wasEnabled;

                throw e;
            }
        }
    }

    defineStyle ( name, { configurable, on, off } ) {
        configurable = configurable == null
            ? true
            : Boolean( configurable );

        const style = this.#createStyle( name, { on, off } );

        Object.defineProperty( this, name, {
            configurable,
            "writable": false,
            "value": style,
        } );

        Object.defineProperty( this.#AnsiStyle.prototype, name, {
            configurable,
            get () {
                return this._addStyle( style );
            },
        } );

        return this;
    }

    defineStyles ( styles ) {
        for ( const [ name, style ] of Object.entries( styles ) ) {
            this.defineStyle( name, style );
        }

        return this;
    }

    enable ( enabled ) {
        return this.#createStyle( null, { enabled } );
    }

    color ( color ) {
        return this.#createStyle( null, {
            "on": this.createColor( 38, color ),
            "off": RESET_FOREGROUND,
        } );
    }

    onColor ( color ) {
        return this.#createStyle( null, {
            "on": this.createColor( 48, color ),
            "off": RESET_BACKGROUND,
        } );
    }

    link ( url, text ) {
        if ( this.isEnabled ) {
            return OSC + "8;;" + url + ST + ( text ?? url ) + OSC + "8;;" + ST;
        }
        else {
            return this.#linkToString( url, text );
        }
    }

    reset ( string ) {
        return string + RESET;
    }

    remove ( string, { keepStyles } = {} ) {
        if ( keepStyles ) {
            string = string.replaceAll( ANSI_KEEP_STYLES_REGEXP, "" );
        }
        else {
            string = string.replaceAll( ANSI_REGEXP, "" );
        }

        // remove links
        string = string.replaceAll( ANSI_LINK_REGEXP, ( match, url, text ) => this.#linkToString( url, text ) );

        return string;
    }

    createColor ( prefix, color ) {

        // array
        if ( Array.isArray( color ) ) {
            return CSI + `${ prefix };2;${ color.join( ";" ) }m`;
        }

        // number
        else if ( typeof color === "number" ) {
            COLOR_BUFFER.writeUInt32BE( color );
        }

        // hex string
        else if ( typeof color === "string" ) {
            COLOR_BUFFER.write( color, 1, 3, "hex" );
        }

        // invalid value
        else {
            throw new Error( "ANSI color value is invalid" );
        }

        return CSI + `${ prefix };2;${ COLOR_BUFFER.readUInt8( 1 ) };${ COLOR_BUFFER.readUInt8( 2 ) };${ COLOR_BUFFER.readUInt8( 3 ) }m`;
    }

    // private
    #createStyle ( name, { on, off, enabled } = {} ) {
        on = on == null
            ? ""
            : String( on );

        off = off == null
            ? ""
            : String( off );

        return makeCallable(
            new this.#AnsiStyle( {
                name,
                on,
                off,
                enabled,
            } ),
            "applyStyle"
        );
    }

    #linkToString ( url, text ) {
        if ( !text || url === text ) {
            return `<${ url }>`;
        }
        else {
            return `[${ text }](${ url })`;
        }
    }
}

const ansi = new Ansi();

export default ansi;

ansi.defineStyles( {
    "hl": ansi.brightWhite,
    "ok": ansi.bold.brightWhite.onColor( 0x64_00 ),
    "warn": ansi.color( 0x0 ).onColor( 0xCC_CC_00 ),
    "error": ansi.bold.brightWhite.onRed,
    "dark": ansi.white.onColor( 0x33_33_33 ),
} );
