const PROXY = {
    apply ( target, that, args ) {
        if ( typeof target.method === "function" ) {
            return Reflect.apply( target.method, target.instance, args );
        }
        else {
            return target.instance[ target.method ]( ...args );
        }
    },

    get ( target, property, receiver ) {
        const value = Reflect.get( target.instance, property );

        if ( typeof value === "function" ) {
            return new Proxy( value, {
                apply ( value, that, args ) {
                    return Reflect.apply( value, target.instance, args );
                },
            } );
        }
        else {
            return value;
        }
    },

    set ( target, property, value ) {
        Reflect.set( target.instance, property, value );
    },
};

// public
export class Callable extends Function {
    constructor ( method ) {
        super();

        const self = new Proxy( this, {
            "apply": ( target, that, args ) => self[ method ]( ...args ),
        } );

        // eslint-disable-next-line no-constructor-return
        return self;
    }
}

export function makeCallable ( instance, method ) {
    const target = () => {};

    target.instance = instance;
    target.method = method;

    return new Proxy( target, PROXY );
}
