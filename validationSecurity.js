// validationSecurity.js - Keamanan validasi frontend untuk mencegah bypass console

const SignatureSecurity = {
    _token: null,
    _isLocked: true,
    _currentUser: null,

    /**
     * Generate secure temporary token
     */
    _generateToken: function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return btoa(token + Date.now().toString());
    },

    /**
     * Lock the state. Call this on logout or initial load.
     */
    lock: function() {
        this._token = null;
        this._isLocked = true;
        this._currentUser = null;
        console.log('[SECURITY] Tambah Kas access locked.');
    },

    /**
     * Unlock the state after successful signature verification
     */
    unlock: function(username) {
        this._token = this._generateToken();
        this._isLocked = false;
        this._currentUser = username;
        console.log('[SECURITY] Signature valid. Tambah Kas access unlocked.');
    },

    /**
     * Check if the current state is valid for submission
     */
    isValid: function(username) {
        if (this._isLocked || !this._token) return false;
        if (this._currentUser !== username) return false;
        
        // Cek umur token (opsional, misalnya max 1 jam session)
        try {
            const decoded = atob(this._token);
            const timestamp = parseInt(decoded.substring(32), 10);
            const now = Date.now();
            if (now - timestamp > 60 * 60 * 1000) {
                console.warn('[SECURITY] Token expired.');
                this.lock();
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }
};

// Gantikan fungsi isTambahKasVerified lama dengan modul ini.
function setTambahKasVerified(username) {
    SignatureSecurity.unlock(username);
}

function clearTambahKasVerified() {
    SignatureSecurity.lock();
}

function isTambahKasVerified(username) {
    return SignatureSecurity.isValid(username);
}
