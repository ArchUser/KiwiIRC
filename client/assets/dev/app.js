// Holds anything kiwi client specific (ie. front, gateway, _kiwi.plugs..)
/**
*   @namespace
*/
var _kiwi = {};

_kiwi.model = {};
_kiwi.view = {};
_kiwi.applets = {};


/**
 * A global container for third party access
 * Will be used to access a limited subset of kiwi functionality
 * and data (think: plugins)
 */
_kiwi.global = {
	settings: undefined,
	plugins: undefined,
	utils: undefined, // TODO: Re-usable methods
	gateway: undefined, // TODO: Access to gateway
	user: undefined, // TODO: Limited user methods
	server: undefined, // TODO: Limited server methods
	command: undefined,  // The control box

	// TODO: think of a better term for this as it will also refer to queries
	channels: (function () {
		var channels = function (name, fn) {
			var chans = [];

			// If only a callback function has been set, set a blank name
			if (typeof name === 'function') {
				fn = name;
				name = null;
			}

			// Get 1 channel only
			if (typeof name === 'string') {
				chans.push(_kiwi.app.panels.getByName(name));

			} else if (typeof name === 'object' && name) {
				// Find each of the specified channels
				_.each(name, function (name) {
					var tmp = _kiwi.app.panels.getByName(name);
					if (tmp && tmp.isChannel()) chans.push(tmp);
				});
			} else {
				// Otherwise.. just get them all
				_.each(_kiwi.app.panels.models, function (panel) {
					if (panel && panel.isChannel()) chans.push(panel);
				});
			}

			// If a callback function has been set, call it with each channel
			if (typeof fn === 'function') {
				_.each(chans, fn);
			}

			return chans;
		};


		channels.join = function (chans) { _kiwi.gateway.join(chans); };
		channels.part = function (chans) { _kiwi.gateway.part(chans); };

		// TODO: Add knock support to gateway
		//channels.knock = function (chan) { kiwi.gateway.knock(chan); };

		return channels;
	})(),

	// Entry point to start the kiwi application
	start: function (opts) {
		opts = opts || {};

        // Load the plugin manager
        _kiwi.global.plugins = new _kiwi.model.PluginManager();

        // Set up the settings datastore
        _kiwi.global.settings = _kiwi.model.DataStore.instance('kiwi.settings');
        _kiwi.global.settings.load();

		_kiwi.app = new _kiwi.model.Application(opts);

		if (opts.kiwi_server) {
			_kiwi.app.kiwi_server = opts.kiwi_server;
		}

		// Start the client up
		_kiwi.app.start();

		return true;
	}
};



// If within a closure, expose the kiwi globals
if (typeof global !== 'undefined') {
	global.kiwi = _kiwi.global;
} else {
	// Not within a closure so set a var in the current scope
	var kiwi = _kiwi.global;
}