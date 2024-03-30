/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
export default PubNub;

// ---------------------------------------------------------------------------
// PubNub
// ---------------------------------------------------------------------------
function PubNub( url, protocols ) {
    var self     = this
    ,   url      = self.url      = url || ''
    ,   protocol = self.protocol = protocols || 'Sec-WebSocket-Protocol'
    ,   bits     = url.split('/')
    ,   setup    = {
         'tls'           : bits[0] === 'wss:'
        ,'origin'        : bits[2]
        ,'publish_key'   : bits[3]
        ,'subscribe_key' : bits[4]
        ,'channel'       : bits[5]
    };

    // READY STATES
    self['CONNECTING'] = 0; // The connection is not yet open.
    self['OPEN']       = 1; // The connection is open and ready to communicate.
    self['CLOSING']    = 2; // The connection is in the process of closing.
    self['CLOSED']     = 3; // The connection is closed or couldn't be opened.

    // CLOSE STATES
    self['CLOSE_NORMAL']         = 1000; // Normal Intended Close; completed.
    self['CLOSE_GOING_AWAY']     = 1001; // Closed Unexpecttedly.
    self['CLOSE_PROTOCOL_ERROR'] = 1002; // Server: Not Supported.
    self['CLOSE_UNSUPPORTED']    = 1003; // Server: Unsupported Protocol.
    self['CLOSE_TOO_LARGE']      = 1004; // Server: Too Much Data.
    self['CLOSE_NO_STATUS']      = 1005; // Server: No reason.
    self['CLOSE_ABNORMAL']       = 1006; // Abnormal Disconnect.

    // Events Default
    self['onclose']   = self['onerror'] = 
    self['onmessage'] = self['onopen']  =
    self['onsend']    =  function(){};

    // Attributes
    self['binaryType']     = '';
    self['extensions']     = '';
    self['bufferedAmount'] = 0;
    self['trasnmitting']   = false;
    self['buffer']         = [];
    self['readyState']     = self['CONNECTING'];

    // Close if no setup.
    if (!url) {
        self['readyState'] = self['CLOSED'];
        self['onclose']({
            'code'     : self['CLOSE_ABNORMAL'],
            'reason'   : 'Missing URL',
            'wasClean' : true
        });
        return self;
    }

    // PubNub WebSocket Emulation
    self.pubnub       = PUBNUB(setup);
    self.pubnub.setup = setup;
    self.setup        = setup;

    self.pubnub['subscribe']({
        'channel'    : setup['channel'],
        'disconnect' : self['onerror'],
        'reconnect'  : self['onopen'],
        'error'      : function() {
            self['onclose']({
                'code'     : self['CLOSE_ABNORMAL'],
                'reason'   : 'Missing URL',
                'wasClean' : false
            });
        },
        'messages'   : function(message) {
            const decodedMessage = new Uint8Array(atob(message).split(','));
            self['onmessage']({ 'data' : decodedMessage });
        },
        'connect'    : function() {
            self['readyState'] = self['OPEN'];
            self['onopen']();
        }
    });
}

// ---------------------------------------------------------------------------
// WEBSOCKET SEND
// ---------------------------------------------------------------------------
PubNub.prototype.send = async function(data) {
    let self = this;
    let response = await self.pubnub['publish']({
        'channel'  : self.pubnub.setup['channel'],
        'message'  : btoa(data),
    });
    self['onsend']({ 'data' : response });
};

// ---------------------------------------------------------------------------
// WEBSOCKET CLOSE
// ---------------------------------------------------------------------------
PubNub.prototype.close = function() {
    var self = this;
    self.pubnub['unsubscribe']({ 'channel' : self.pubnub.setup['channel'] });
    self['readyState'] = self['CLOSED'];
    self['onclose']({});
};

// ---------------------------------
// HTTP/3 and IPv6 PubNub Client
// ---------------------------------

// This SDK streams each subscription on a separate HTTP/3 session.
// It won't merge channel streams by default.
// This provides dedicated queues and streams for each channel.

const PUBNUB = (setup) => {
    for (let key of Object.keys(setup)) PUBNUB[key] = setup[key];
    return PUBNUB;
};

(async ()=>{ 

const defaultSubkey  = 'demo-36';
const defaultPubkey  = 'demo-36';
const defaultChannel = 'pubnub';
const defaultOrigin  = 'v6.pubnub3.com'; // HTTP/3 and IPv6
const defaultUUID    = `uuid-${+new Date()}`;

const subscribe = PUBNUB.subscribe = (setup={}) => {
    let subkey     = setup.subkey     || PUBNUB.subscribeKey || defaultSubkey;
    let channel    = setup.channel    || PUBNUB.channel      || defaultChannel;
    let origin     = setup.origin     || PUBNUB.origin       || defaultOrigin;
    let messages   = setup.messages   || PUBNUB.messages     || (m => m);
    let connect    = setup.connect    || PUBNUB.connect      || (c => c);
    let connected  = false;
    let filter     = setup.filter     || PUBNUB.filter       || '';
    let authkey    = setup.authkey    || PUBNUB.authKey      || '';
    let timetoken  = setup.timetoken  || '0';
    let filterExp  = `${filter?'&filter-expr=':''}${encodeURIComponent(filter)}`;
    let params     = `auth=${authkey}${filterExp}`;
    let decoder    = new TextDecoder();
    let boundry    = /[\n]/g;
    let resolver   = null;
    let promissory = () => new Promise(resolve => resolver = (data) => resolve(data) ); 
    let receiver   = promissory();
    let reader     = null;
    let response   = null;
    let buffer     = '';
    let subscribed = true;
    let controller = new AbortController();
    let signal     = controller.signal;

    // Start Stream
    startStream();

    async function startStream() {
        let uri = `https://${origin}/stream/${subkey}/${channel}/0/${timetoken}`;
        buffer  = '';

        try      { response = await fetch(`${uri}?${params}`, {signal}) }
        catch(e) { return continueStream(1000)                          }

        try      { reader = response.body.getReader()                   }
        catch(e) { return continueStream(1000)                          }

        try      { readStream()                                         }
        catch(e) { return continueStream(1000)                          }
    }

    function continueStream(delay) {
        if (!subscribed) return;
        setTimeout( () => startStream(), delay || 1 );
    }

    async function readStream() {
        let chunk   = await reader.read().catch(error => {
            continueStream();
        });
        if (!chunk) return;

        buffer   += decoder.decode(chunk.value || new Uint8Array);
        let parts = buffer.split(boundry);

        parts.forEach( (message, num) => {
            if (!message) return;
            try {
                let jsonmsg = JSON.parse(message);
                if (jsonmsg[1]) {
                    if (timetoken == '0' && !connected) {
                        connected = true;
                        connect(jsonmsg);
                    }
                    setup.timetoken = timetoken = jsonmsg[1];
                }

                // Send message to receivers/callbacks
                jsonmsg[0].forEach(m => {
                    messages(m, jsonmsg);
                    resolver(m, jsonmsg);
                    receiver = promissory();
                });

                // Free successfully consumed message
                parts[num] = '';
                buffer = parts.filter(p => p).join('\n');
            }
            catch(error) {
                // This is an unfinished chunk
                // And JSON is unfinished in buffer.
                // Need to wait for next chunck to construct full JSON.
            }
        });

        if (!chunk.done) readStream();
        else             continueStream();
    }

    // Subscription Structure
    async function* subscription() {
        while (subscribed) yield await receiver;
    }

    subscription.messages    = receiver => messages = setup.messages = receiver;
    subscription.unsubscribe = () => {
        subscribed = false;
        controller.abort();
    };

    return subscription;
};

const publish = PUBNUB.publish = async (setup={}) => {
    let pubkey    = setup.pubkey     || PUBNUB.publishKey   || defaultPubkey;
    let subkey    = setup.subkey     || PUBNUB.subscribeKey || defaultSubkey;
    let channel   = setup.channel    || PUBNUB.channel      || defaultChannel;
    let uuid      = setup.uuid       || PUBNUB.uuid         || defaultUUID;
    let origin    = setup.origin     || PUBNUB.origin       || defaultOrigin;
    let authkey   = setup.authkey    || PUBNUB.authKey      || '';
    let message   = setup.message    || 'missing-message';
    let metadata  = setup.metadata   || PUBNUB.metadata     || {};
    let uri       = `https://${origin}/publish/${pubkey}/${subkey}/0/${channel}/0`;
    let params    = `auth=${authkey}&meta=${encodeURIComponent(JSON.stringify(metadata))}`;
    let payload   = { method: 'POST', body: JSON.stringify(message) };

    try      { return await fetch(`${uri}?${params}`, payload) }
    catch(e) { return false }
};

})();

