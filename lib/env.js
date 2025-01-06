import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const XDG_DEFAULTS = {
    "default": {
        "CONFIG_HOME": path.join( os.homedir(), ".config" ),
        "DATA_HOME": path.join( os.homedir(), ".local", "share" ),
        "CACHE_HOME": path.join( os.homedir(), ".cache" ),
        "RUNTIME_DIR": os.tmpdir(),
    },
    "linux": {
        "CONFIG_DIRS": [ "/etc/xdg" ],
        "DATA_DIRS": [ "/usr/local/share", "/usr/share" ],
    },
    "win32": {
        "CONFIG_DIRS": [],
        "DATA_DIRS": [],
    },
};

XDG_DEFAULTS.aix = structuredClone( XDG_DEFAULTS.linux );
XDG_DEFAULTS.darwin = structuredClone( XDG_DEFAULTS.linux );
XDG_DEFAULTS.freebsd = structuredClone( XDG_DEFAULTS.linux );
XDG_DEFAULTS.openbsd = structuredClone( XDG_DEFAULTS.linux );
XDG_DEFAULTS.sunos = structuredClone( XDG_DEFAULTS.linux );

const PATH_SEP = process.platform === "win32"
    ? ";"
    : ":";

const XDG = {
    "CONFIG_HOME": process.env.XDG_CONFIG_HOME || XDG_DEFAULTS.default.CONFIG_HOME || XDG_DEFAULTS[ process.platform ].CONFIG_HOME,
    "DATA_HOME": process.env.XDG_DATA_HOME || XDG_DEFAULTS.default.DATA_HOME || XDG_DEFAULTS[ process.platform ].DATA_HOME,
    "CACHE_HOME": process.env.XDG_CACHE_HOME || XDG_DEFAULTS.default.CACHE_HOME || XDG_DEFAULTS[ process.platform ].CACHE_HOME,
    "RUNTIME_DIR": process.env.XDG_RUNTIME_DIR || XDG_DEFAULTS.default.RUNTIME_DIR || XDG_DEFAULTS[ process.platform ].RUNTIME_DIR,
    "CONFIG_DIRS": process.env.XDG_CONFIG_DIRS
        ? process.env.XDG_CONFIG_DIRS.split( PATH_SEP )
        : XDG_DEFAULTS.default.CONFIG_DIRS || XDG_DEFAULTS[ process.platform ].CONFIG_DIRS,
    "DATA_DIRS": process.env.XDG_DATA_DIRS
        ? process.env.XDG_DATA_DIRS.split( PATH_SEP )
        : XDG_DEFAULTS.default.DATA_DIRS || XDG_DEFAULTS[ process.platform ].DATA_DIRS,
};

class Env {

    // public
    getXdgConfigDir ( name ) {
        if ( path.sep !== "/" ) name = name.replaceAll( "/", path.sep );

        return XDG.CONFIG_HOME + path.sep + name;
    }

    getXdgDataDir ( name ) {
        if ( path.sep !== "/" ) name = name.replaceAll( "/", path.sep );

        return XDG.DATA_HOME + path.sep + name;
    }

    getXdgCacheDir ( name ) {
        if ( path.sep !== "/" ) name = name.replaceAll( "/", path.sep );

        return XDG.CACHE_HOME + path.sep + name;
    }

    getXdgRuntimeDir ( name ) {
        if ( path.sep !== "/" ) name = name.replaceAll( "/", path.sep );

        return XDG.RUNTIME_DIR + path.sep + name;
    }

    findXdgConfig ( name ) {
        if ( path.sep !== "/" ) name = name.replaceAll( "/", path.sep );

        for ( const configDir of [ XDG.CONFIG_HOME, ...XDG.CONFIG_DIRS ] ) {
            if ( fs.existsSync( configDir + path.sep + name ) ) return configDir + path.sep + name;
        }
    }
}

export default new Env();
