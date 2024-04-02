export default class PubNub {
    private url: string;
    private protocol: string;
    public CONNECTING: number;
    public OPEN: number;
    public CLOSING: number;
    public CLOSED: number;
    public CLOSE_NORMAL: number;
    public CLOSE_GOING_AWAY: number;
    public CLOSE_PROTOCOL_ERROR: number;
    public CLOSE_UNSUPPORTED: number;
    public CLOSE_TOO_LARGE: number;
    public CLOSE_NO_STATUS: number;
    public CLOSE_ABNORMAL: number;
    public onclose: Function;
    public onerror: Function;
    public onmessage: Function;
    public onopen: Function;
    public onsend: Function;
    public binaryType: string;
    public extensions: string;
    public bufferedAmount: number;
    public transmitting: boolean;
    public buffer: any[];
    public readyState: number;
    public pubnub: any;
    public setup: any;

    constructor(url?: string, protocols?: string) {
        this.url = url || '';
        this.protocol = protocols || 'Sec-WebSocket-Protocol';
        const bits = this.url.split('/');
        this.setup = {
            tls: bits[0] === 'wss:',
            origin: bits[2],
            publish_key: bits[3],
            subscribe_key: bits[4],
            channel: bits[5]
        };

        // READY STATES
        this.CONNECTING = 0;
        this.OPEN = 1;
        this.CLOSING = 2;
        this.CLOSED = 3;

        // CLOSE STATES
        this.CLOSE_NORMAL = 1000;
        this.CLOSE_GOING_AWAY = 1001;
        this.CLOSE_PROTOCOL_ERROR = 1002;
        this.CLOSE_UNSUPPORTED = 1003;
        this.CLOSE_TOO_LARGE = 1004;
        this.CLOSE_NO_STATUS = 1005;
        this.CLOSE_ABNORMAL = 1006;

        // Events Default
        this.onclose = this.onerror = this.onmessage = this.onopen = this.onsend = () => {};

        // Attributes
        this.binaryType = '';
        this.extensions = '';
        this.bufferedAmount = 0;
        this.transmitting = false;
        this.buffer = [];
        this.readyState = this.CONNECTING;

        // Close if no setup.
        if (!this.url) {
            this.readyState = this.CLOSED;
            this.onclose({
                code: this.CLOSE_ABNORMAL,
                reason: 'Missing URL',
                wasClean: true
            });
        } else {
            // PubNub WebSocket Emulation
            this.pubnub = PUBNUB(this.setup);
            this.pubnub.setup = this.setup;

            this.pubnub.subscribe({
                channel: this.setup.channel,
                disconnect: this.onerror,
                reconnect: this.onopen,
                error: () => {
                    this.onclose({
                        code: this.CLOSE_ABNORMAL,
                        reason: 'Missing URL',
                        wasClean: false
                    });
                },
                messages: (message: string) => {
                    const decodedMessage = new Uint8Array(atob(message).split(',').map((item: string) => parseInt(item, 10)));
                    this.onmessage({ data: decodedMessage });
                },
                connect: () => {
                    this.readyState = this.OPEN;
                    this.onopen();
                }
            });
        }
    }

    send = async (data: string) => {
        let response = await this.pubnub.publish({
            channel: this.pubnub.setup.channel,
            message: btoa(data),
        });
        this.onsend({ data: response });
    };

    close = () => {
        this.pubnub.unsubscribe({ channel: this.pubnub.setup.channel });
        this.readyState = this.CLOSED;
        this.onclose({});
    };
}

// HTTP/3 and IPv6 PubNub Connectivity
type Setup = {
    subkey?: string;
    channel?: string;
    origin?: string;
    messages?: (m: any) => void;
    connect?: (c: any) => void;
    filter?: string;
    authkey?: string;
    timetoken?: string;
    uuid?: string;
    pubkey?: string;
    message?: any;
    metadata?: object;
};

const CHANNELS = {};
const PUBNUB = (setup: Setup): typeof PUBNUB => {
    for (let key of Object.keys(setup)) {
        (PUBNUB as any)[key] = setup[key];
    }
    return PUBNUB;
};

const defaultSubkey: string = 'demo-36';
const defaultPubkey: string = 'demo-36';
const defaultChannel: string = 'pubnub';
const defaultOrigin: string = 'v6.pubnub3.com'; // HTTP/3 and IPv6
const defaultUUID: string = `uuid-${+new Date()}`;

PUBNUB.subscribe = (setup: Setup = {}): AsyncGenerator<any, void, unknown> => {
    let subkey: string = setup.subkey ?? PUBNUB.subscribeKey ?? defaultSubkey;
    let channel: string = setup.channel ?? PUBNUB.channel ?? defaultChannel;
    let origin: string = setup.origin ?? PUBNUB.origin ?? defaultOrigin;
    let messages: (m: any, jsonmsg?: any) => void = setup.messages ?? PUBNUB.messages ?? ((m: any) => m);
    let connect: (c: any) => void = setup.connect ?? PUBNUB.connect ?? ((c: any) => c);
    let connected: boolean = false;
    let filter: string = setup.filter ?? PUBNUB.filter ?? '';
    let authkey: string = setup.authkey ?? PUBNUB.authKey ?? '';
    let timetoken: string = setup.timetoken ?? '0';
    let filterExp: string = `${filter ? '&filter-expr=' : ''}${encodeURIComponent(filter)}`;
    let uuid: string = setup.uuid ?? PUBNUB.uuid ?? defaultUUID;
    let params: string = `uuid=${uuid}&auth=${authkey}${filterExp}`;
    let encoder: TextDecoder = new TextDecoder();
    let boundary: RegExp = /[\n]/g;
    let resolver: (msg: any, payload: any) => void = () => {};
    let promissory = (): Promise<any> => new Promise(resolve => resolver = (data) => resolve(data)); 
    let receiver: Promise<any> = promissory();
    let reader: ReadableStreamDefaultReader | null = null;
    let response: Response | null = null;
    let buffer: string = '';
    let subscribed: boolean = true;
    let controller: AbortController = new AbortController();
    let signal: AbortSignal = controller.signal;

    // Start Stream
    startStream();

    async function startStream(): Promise<void> {
        let uri: string = `https://${origin}/stream/${subkey}/${channel}/0/${timetoken}`;
        buffer = '';

        try {
            response = await fetch(`${uri}?${params}`, {signal});
        } catch (e) {
            return continueStream(1000);
        }

        try {
            reader = response.body?.getReader();
        } catch (e) {
            return continueStream(1000);
        }

        try {
            readStream();
        } catch (e) {
            return continueStream(1000);
        }
    }

    function continueStream(delay: number = 1): void {
        if (!subscribed) return;
        setTimeout(() => startStream(), delay);
    }

    async function readStream(): Promise<void> {
        let chunk: ReadableStreamReadResult<Uint8Array> | undefined = await reader?.read().catch(error => {
            continueStream();
        });
        if (!chunk) return;

        buffer += encoder.decode(chunk.value || new Uint8Array);
        let parts: string[] = buffer.split(boundary);

        parts.forEach((message, num) => {
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
                jsonmsg[0].forEach((m: any) => {
                    messages(m, jsonmsg);
                    resolver(m, jsonmsg);
                    receiver = promissory();
                });

                // Free successfully consumed message
                parts[num] = '';
                buffer = parts.filter(p => p).join('\n');
            } catch (error) {
                // This is an unfinished chunk
                // And JSON is unfinished in buffer.
                // Need to wait for next chunk to construct full JSON.
            }
        });

        if (!chunk.done) readStream();
        else continueStream();
    }

    // Subscription Structure
    async function* subscription(): AsyncGenerator<any, void, unknown> {
        while (subscribed) yield await receiver;
    }

    subscription.messages = (receiver: (m: any) => void) => (messages = setup.messages = receiver);
    subscription.unsubscribe = () => {
        delete CHANNELS[channel];
        subscribed = false;
        controller.abort();
    };

    // Prevent Duplicate Subscriptions
    let duplicates = channel.split(',').filter((channel: string) => {
        if (channel in CHANNELS) {
            console.log(`Already subscribed to ${channel}, resubscribing...`);
            //subscription.unsubscribe();
        }
        CHANNELS[channel] = subscription;
    });

    return subscription;
};

PUBNUB.publish = async (setup: Setup = {}): Promise<Response | false> => {
    let pubkey: string = setup.pubkey ?? PUBNUB.publishKey ?? defaultPubkey;
    let subkey: string = setup.subkey ?? PUBNUB.subscribeKey ?? defaultSubkey;
    let channel: string = setup.channel ?? PUBNUB.channel ?? defaultChannel;
    let uuid: string = setup.uuid ?? PUBNUB.uuid ?? defaultUUID;
    let origin: string = setup.origin ?? PUBNUB.origin ?? defaultOrigin;
    let authkey: string = setup.authkey ?? PUBNUB.authKey ?? '';
    let message: any = setup.message ?? 'missing-message';
    let metadata: object = setup.metadata ?? PUBNUB.metadata ?? {};
    let uri: string = `https://${origin}/publish/${pubkey}/${subkey}/0/${channel}/0`;
    let params: string = `uuid=${uuid}&auth=${authkey}&meta=${encodeURIComponent(JSON.stringify(metadata))}`;
    let payload: RequestInit = { method: 'POST', body: JSON.stringify(message) };

    try {
        return await fetch(`${uri}?${params}`, payload);
    } catch (e) {
        return false;
    }
};
