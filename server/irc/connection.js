var net     = require('net'),
    tls     = require('tls'),
    events  = require('events'),
    util    = require('util'),
    _       = require('lodash');

var IrcConnection = function (hostname, port, ssl, nick, user, pass) {
    var that = this;
    events.EventEmitter.call(this);
    
    this.connected = false;
    this.registered = false;
    this.cap_negotiation = true;
    this.nick = nick;
    this.user = user;  // Contains users real hostname and address
    this.username = this.nick.replace(/[^0-9a-zA-Z\-_.]/, ''),
    this.irc_host = {hostname: hostname, port: port};
    this.ssl = !(!ssl);
    this.options = Object.create(null);
    this.cap = {requested: [], enabled: []};
    this.sasl = false;
    
    this.password = pass;
    this.hold_last = false;
    this.held_data = '';

    global.modules.emit('irc:connecting', {connection: this}).done(function () {
        that.connect();
    });
};
util.inherits(IrcConnection, events.EventEmitter);

module.exports.IrcConnection = IrcConnection;


IrcConnection.prototype.connect = function () {
    var that = this;

    if (this.ssl) {
        this.socket = tls.connect({
            host: this.irc_host.hostname,
            port: this.irc_host.port,
            rejectUnauthorized: global.config.reject_unauthorised_certificates
        }, function () {
            connect_handler.apply(that, arguments);
        });
    } else {
        this.socket = net.createConnection(this.irc_host.port, this.irc_host.hostname);
        this.socket.on('connect', function () {
            connect_handler.apply(that, arguments);
        });
    }
    
    this.socket.on('error', function (event) {
        that.emit('error', event);
    });
    
    this.socket.setEncoding('utf-8');
    
    this.socket.on('data', function () {
        parse.apply(that, arguments);
    });
    
    this.socket.on('close', function () {
        that.emit('close');
    });
};

IrcConnection.prototype.write = function (data, callback) {
    write.call(this, data + '\r\n', 'utf-8', callback);
};

IrcConnection.prototype.end = function (data, callback) {
    end.call(this, data + '\r\n', 'utf-8', callback);
};

IrcConnection.prototype.dispose = function () {
    this.removeAllListeners();
};


var write = function (data, encoding, callback) {
    this.socket.write(data, encoding, callback);
};

var end = function (data, encoding, callback) {
    this.socket.end(data, encoding, callback);
};


var connect_handler = function () {
    var that = this,
        connect_data;

    // Build up data to be used for webirc/etc detection
    connect_data = {
        connection: this,

        // Array of lines to be sent to the IRCd before anything else
        prepend_data: []
    };

    // Let the webirc/etc detection modify any required parameters
    connect_data = findWebIrc.call(this, connect_data);

    global.modules.emit('irc:authorize', connect_data).done(function () {
        // Send any initial data for webirc/etc
        if (connect_data.prepend_data) {
            _.each(connect_data.prepend_data, function(data) {
                that.write(data);
            });
        }

        that.write('CAP LS');

        if (that.password) {
            that.write('PASS ' + that.password);
        }
        that.write('NICK ' + that.nick);
        that.write('USER ' + that.username + ' 0 0 :' + '[www.kiwiirc.com] ' + that.nick);
        
        that.connected = true;
        that.emit('connected');
    });
};


function findWebIrc(connect_data) {
    var webirc_pass = global.config.webirc_pass;
    var ip_as_username = global.config.ip_as_username;
    var tmp;

    // Do we have a WEBIRC password for this?
    if (webirc_pass && webirc_pass[this.irc_host.hostname]) {
        tmp = 'WEBIRC ' + webirc_pass[this.irc_host.hostname] + ' KiwiIRC ';
        tmp += this.user.hostname + ' ' + this.user.address;
        connect_data.prepend_data = [tmp];
    }


    // Check if we need to pass the users IP as its username/ident
    if (ip_as_username && ip_as_username.indexOf(this.irc_host.hostname) > -1) {
        // Get a hex value of the clients IP
        this.username = this.user.address.split('.').map(function(i, idx){
            return parseInt(i, 10).toString(16);
        }).join('');

    }

    return connect_data;
}



parse_regex = /^(?:(?:(?:(@[^ ]+) )?):(?:([a-z0-9\x5B-\x60\x7B-\x7D\.\-]+)|([a-z0-9\x5B-\x60\x7B-\x7D\.\-]+)!([a-z0-9~\.\-_|]+)@?([a-z0-9\.\-:\/_]+)?) )?(\S+)(?: (?!:)(.+?))?(?: :(.+))?$/i;
var parse = function (data) {
    var i,
        msg,
        msg2,
        trm,
        j,
        tags = [],
        tag;
    
    if ((this.hold_last) && (this.held_data !== '')) {
        data = this.held_data + data;
        this.hold_last = false;
        this.held_data = '';
    }
    if (data.substr(-1) !== '\n') {
        this.hold_last = true;
    }
    data = data.split("\n");
    for (i = 0; i < data.length; i++) {
        if (data[i]) {
            if ((this.hold_last) && (i === data.length - 1)) {
                this.held_data = data[i];
                break;
            }

            // We have a complete line of data, parse it!
            msg = parse_regex.exec(data[i].replace(/^\r+|\r+$/, ''));
            if (msg) {
                if (msg[1]) {
                    tags = msg[1].split(';');
                    for (j = 0; j < tags.length; j++) {
                        tag = tags[j].split('=');
                        tags[j] = {tag: tag[0], value: tag[1]};
                    }
                }
                msg = {
                    tags:       tags,
                    prefix:     msg[2],
                    nick:       msg[3],
                    ident:      msg[4],
                    hostname:   msg[5] || '',
                    command:    msg[6],
                    params:     msg[7] || '',
                    trailing:   (msg[8]) ? msg[8].trim() : ''
                };
                msg.params = msg.params.split(' ');

                this.emit('irc_' + msg.command.toUpperCase(), msg);
            } else {
                console.log("Malformed IRC line: " + data[i].replace(/^\r+|\r+$/, ''));
            }
        }
    }
};
