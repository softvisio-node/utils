export default class Callable extends Function {
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
    return new Proxy( () => {}, {
        apply ( target, that, args ) {
            return instance[ method ]( ...args );
        },

        get ( target, property, receiver ) {
            const value = instance[ property ];

            if ( typeof value === "function" ) {
                if ( value.bind ) {
                    return value.bind( instance );
                }
                else {
                    return value;
                }
            }
            else {
                return value;
            }
        },
    } );
}
