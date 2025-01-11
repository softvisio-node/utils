import os from "node:os";
import path from "node:path";

// https://specifications.freedesktop.org/basedir-spec/latest/#variables

const USER_INFO = os.userInfo();

class Env {

    // public
    getConfigDir ( name ) {
        if ( process.platform === "darwin" ) {
            return path.join( os.homedir(), "Library/Preferences", name );
        }
        else if ( process.platform === "win32" ) {
            return path.join( process.env.APPDATA, name, "Config" );
        }
        else {
            if ( process.env.XDG_CONFIG_HOME ) {
                return path.join( process.env.XDG_CONFIG_HOME, name );
            }
            else {
                return path.join( os.homedir(), ".config", name );
            }
        }
    }

    getDataDir ( name ) {
        if ( process.platform === "darwin" ) {
            return path.join( os.homedir(), "Library/Application Support", name );
        }
        else if ( process.platform === "win32" ) {
            return path.join( process.env.LOCALAPPDATA, name, "Data" );
        }
        else {
            if ( process.env.XDG_DATA_HOME ) {
                return path.join( process.env.XDG_DATA_HOME, name );
            }
            else {
                return path.join( os.homedir(), ".local/share", name );
            }
        }
    }

    getCacheDir ( name ) {
        if ( process.platform === "darwin" ) {
            return path.join( os.homedir(), "Library/Caches", name );
        }
        else if ( process.platform === "win32" ) {
            return path.join( process.env.LOCALAPPDATA, name, "Cache" );
        }
        else {
            if ( process.env.XDG_CACHE_HOME ) {
                return path.join( process.env.XDG_CACHE_HOME, name );
            }
            else {
                return path.join( os.homedir(), ".cache", name );
            }
        }
    }

    getStateDir ( name ) {
        if ( process.platform === "darwin" ) {
            return path.join( os.homedir(), "Library/Logs", name );
        }
        else if ( process.platform === "win32" ) {
            return path.join( process.env.LOCALAPPDATA, name, "Log" );
        }
        else {
            if ( process.env.XDG_STATE_HOME ) {
                return path.join( process.env.XDG_STATE_HOME, name );
            }
            else {
                return path.join( os.homedir(), ".local/state", name );
            }
        }
    }

    getRuntimeDir ( name ) {
        if ( process.platform === "darwin" ) {
            return path.join( os.tmpdir(), name );
        }
        else if ( process.platform === "win32" ) {
            return path.join( process.env.LOCALAPPDATA, "Temp", name );
        }
        else {
            if ( process.env.XDG_RUNTIME_DIR ) {
                return path.join( process.env.XDG_RUNTIME_DIR, name );
            }
            else {
                return path.join( os.tmpdir(), USER_INFO.username, name );
            }
        }
    }
}

export default new Env();
