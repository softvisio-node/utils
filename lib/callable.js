const PROXY = {
    apply ( target, that, args ) {
        return target.instance[ target.method ]( ...args );
    },

    get ( target, property, receiver ) {
        return target.instance[ property ];
    },

    set ( target, property, value ) {
        target.instance[ property ] = value;
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
