import { makeCallable } from "#lib/callable";

const ANSI_REGEXP = new RegExp( /(?:\x1B\[|\u009B)[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/, "g" ),

    // ANSI SGR code ends with the "m"
    ANSI_KEEP_STYLES_REGEXP = new RegExp( /(?:\x1B\[|\u009B)[\x30-\x3F]*[\x20-\x2F]*[\x40-\x6Cn~]/, "g" ),
    RESET = "\x1B[0m",
    RESET_FOREGROUND = "\x1B[39m",
    RESET_BACKGROUND = "\x1B[49m",
    COLOR_BUFFER = Buffer.alloc( 4 ),
    DEFAULT_STYLES = {
        "reset": [ 0, null ],

        "bold": [ 1, 22 ],
        "dim": [ 2, 22 ],
        "italic": [ 3, 23 ],
        "underline": [ 4, 24 ],
        "inverse": [ 7, 27 ],
        "hidden": [ 8, 28 ],
        "strikethrough": [ 9, 29 ],

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

const ansiStyle = ansi =>
    class AnsiStyle {
        #ansi = ansi;
        #name;
        #on;
        #off;

        constructor ( name, on, off ) {
            this.#name = name;
            this.#on = on;
            this.#off = off;
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

        // public
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

            if ( !this.ansi.isEnabled ) return string;

            if ( !string ) return "";

            if ( string.includes( "\n" ) ) {
                return this.#on + string.replaceAll( /\r*\n/g, `${ this.#off }$&${ this.#on }` ) + this.#off;
            }
            else {
                return this.#on + string + this.#off;
            }
        }

        // protected
        _addStyle ( { on, off } ) {
            if ( this.#name ) {
                return makeCallable( new this.constructor( null, this.#on + on, off + this.#off ), "applyStyle" );
            }
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
                "on": on
                    ? "\x1B[" + on + "m"
                    : null,
                "off": off
                    ? "\x1B[" + off + "m"
                    : null,
            } );
        }
    }

    // static
    static get isEnabled () {
        return this.#globalEnabled;
    }

    static set isEnabled ( value ) {
        this.#globalEnabled = Boolean( value );
    }

    static enable () {
        this.#globalEnabled = true;
    }

    static disable () {
        this.#globalEnabled = false;
    }

    // properties
    get RESET () {
        return RESET;
    }

    get isEnabled () {
        return this.#isEnabled ?? this.constructor.isEnabled;
    }

    set isEnabled ( value ) {
        this.#isEnabled = value == null
            ? null
            : Boolean( value );
    }

    get regExp () {
        return ANSI_REGEXP;
    }

    // public
    enable () {
        this.#isEnabled = true;
    }

    disable () {
        this.#isEnabled = false;
    }

    defineStyle ( name, style ) {
        style = this.#createStyle( name, style );

        Object.defineProperty( this, name, {
            "configurable": true,
            "writable": false,
            "value": style,
        } );

        Object.defineProperty( this.#AnsiStyle.prototype, name, {
            "configurable": true,
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

    reset ( string ) {
        return string + RESET;
    }

    remove ( string, { keepStyles } = {} ) {
        if ( keepStyles ) {
            return string.replaceAll( ANSI_KEEP_STYLES_REGEXP, "" );
        }
        else {
            return string.replaceAll( ANSI_REGEXP, "" );
        }
    }

    createColor ( prefix, color ) {

        // array
        if ( Array.isArray( color ) ) {
            return `\x1B[${ prefix };2;${ color.join( ";" ) }m`;
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

        return `\x1B[${ prefix };2;${ COLOR_BUFFER.readUInt8( 1 ) };${ COLOR_BUFFER.readUInt8( 2 ) };${ COLOR_BUFFER.readUInt8( 3 ) }m`;
    }

    // private
    #createStyle ( name, { on, off } ) {
        on = on == null
            ? ""
            : String( on );

        off = off == null
            ? ""
            : String( off );

        return makeCallable( new this.#AnsiStyle( name, on, off ), "applyStyle" );
    }
}

const ansi = new Ansi();

export default ansi;

ansi.defineStyles( {
    "hl": ansi.brightWhite,
    "dim": ansi.gray,
    "ok": ansi.bold.brightWhite.onColor( 0x64_00 ),
    "warn": ansi.color( 0x0 ).onColor( 0xCC_CC_00 ),
    "error": ansi.bold.brightWhite.onRed,
    "dark": ansi.white.onColor( 0x33_33_33 ),
} );
