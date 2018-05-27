var redis = require('redis');
var util = require('util');
var EventEmitter = require('eventemitter2').EventEmitter2;

/**
 * Create a new NodeRedisPubsub instance that can subscribe to channels and publish messages
 * @param {Object} options Options for the client creations:
 *                 port - Optional, the port on which the Redis server is launched.
 *                 scope - Optional, two NodeRedisPubsubs with different scopes will not share messages
 *                 url - Optional, a correctly formed redis connection url
 */
function NodeRedisPubsub(options) {
    this.emitter = redis.createClient(options.port, options.host);
    this.receiver = redis.createClient(options.port, options.host);
    this.receiver.setMaxListeners(0);
    this.events = new EventEmitter({
        wildcard : true
    });
    if (options.auth) {
        this.emitter.auth(options.auth);
        this.receiver.auth(options.auth);
    }
    this.receiver.on('pmessage', this.pmessage.bind(this));
    this.prefix = options.prefix ? options.prefix + ':' : '';

}

NodeRedisPubsub.prototype.on = function(event, listener) {
    var self = this;
    this.events.on(event, listener);
    if (!this.emitter.connected) {
        this.emitter.once('connect', function() {
            self.receiver.psubscribe(self.prefix + event);
        });
    } else {
        this.receiver.psubscribe(this.prefix + event);
    }
    return this;
};

NodeRedisPubsub.prototype.once = function(event, listener) {
    var self = this;

    if(!listener){
        return new Promise(function (resolve) {
            function once(data) {
                self.removeListener(event, once);
                resolve(data);
            }


            self.events.on(event, once);
        })
    }
    function once(data) {
        self.removeListener(event, once);
        listener(data);
    }


    this.events.on(event, once);
    return this;
};

NodeRedisPubsub.prototype.removeListener = function(event, listener) {
    this.events.removeListener(event, listener);

    if (this.events.listeners(event).length === 0) {
        this.receiver.punsubscribe(this.prefix + event);
    }
    return this;
};

NodeRedisPubsub.prototype.emit = function(event, data) {
    var self = this;
    var args = [].splice.call(arguments, 0);
    console.log(event,data)
    args.shift();

    if (!this.emitter.connected) {
        this.emitter.once('connect', function() {
            self.emitter.publish(self.prefix + event, JSON.stringify({
                args : args
            }));
        });
    } else {
        this.emitter.publish(this.prefix + event, JSON.stringify({
            args : args
        }));
    }

    return this;
};

NodeRedisPubsub.prototype.pmessage = function(pattern, event, data) {
    try {
        data = JSON.parse(data);
    } catch(e) {
        return;
    }

    var args = data.args;
    args.unshift(event.replace(this.prefix, ''));
    this.events.emit.apply(this.events, args);
    return this;
};

/**
 * Safely close the redis connections 'soon'
 */
NodeRedisPubsub.prototype.quit = function() {
    this.emitter.quit();
    this.receiver.quit();
    return this;
};

/**
 * Dangerously close the redis connections immediately
 */
NodeRedisPubsub.prototype.end = function() {
    this.emitter.end();
    this.receiver.end();
    return this;
};

module.exports = NodeRedisPubsub;