export default class PubNub {
    private url: string;
    private protocol: string | string[] | undefined;

    static readonly CONNECTING: number = 0; // The connection is not yet open.
    static readonly OPEN: number = 1; // The connection is open and ready to communicate.
    static readonly CLOSING: number = 2; // The connection is in the process of closing.
    static readonly CLOSED: number = 3; // The connection is closed or couldn't be opened.

    static readonly CLOSE_NORMAL: number = 1000;
    static readonly CLOSE_GOING_AWAY: number = 1001;
    static readonly CLOSE_PROTOCOL_ERROR: number = 1002;
    static readonly CLOSE_UNSUPPORTED: number = 1003;
    static readonly CLOSE_TOO_LARGE: number = 1004;
    static readonly CLOSE_NO_STATUS: number = 1005;
    static readonly CLOSE_ABNORMAL: number = 1006;

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

    constructor(url: string | URL, protocols?: string | string[] | undefined) {
        this.url = (url ?? "wss://v6.pubnub3.com?subscribeKey=demo-36&publishKey=demo-36&channel=pubnub").toString();
        this.protocol = (protocols ?? "Sec-WebSocket-Protocol").toString();
        console.info(`Opening PubNub WebSocket: ${this.url} | ${this.protocol}`);
        let params: { [key: string]: string } = {};
        params = extractParams(this.url);
        const bits = this.url.split('/');
        this.setup = {
            origin: bits[2],
            publishKey: params.publishKey,
            subscribeKey: params.subscribeKey,
            channel: params.channel,
            authkey: params.auth,
            uuid: params.userId,
        };

        // Events Default
        this.onclose = this.onerror = this.onmessage = this.onopen = this.onsend = () => {};

        // Attributes
        this.binaryType = '';
        this.extensions = '';
        this.bufferedAmount = 0;
        this.transmitting = false;
        this.buffer = [];
        this.readyState = PubNub.CONNECTING;

        // Close if no setup.
        if (!this.url) {
            this.readyState = PubNub.CLOSED;
            this.onclose({
                code: PubNub.CLOSE_ABNORMAL,
                reason: 'Missing URL',
                wasClean: true
            });
        } else {
            // PubNub WebSocket
            this.pubnub = PUBNUB(this.setup);
            this.pubnub.setup = this.setup;

            this.pubnub.subscribe({
                channel: this.setup.channel,
                disconnect: this.onerror,
                reconnect: this.onopen,
                error: () => {
                    this.onclose({
                        code: PubNub.CLOSE_ABNORMAL,
                        reason: 'Missing URL',
                        wasClean: false
                    });
                },
                messages: (message: string) => {
                    const decodedMessage = new Uint8Array(atob(message).split(',').map((item: string) => parseInt(item, 10)));
                    this.onmessage({ data: decodedMessage });
                },
                connect: () => {
                    this.readyState = PubNub.OPEN;
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
        console.info('Closing PubNub WebSocket');
        this.pubnub.unsubscribe({ channel: this.pubnub.setup.channel });
        this.readyState = PubNub.CLOSED;
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

// PubNub Subscriptions
let SUBSCRIPTIONS: { [key: string]: Array<any> } = {};

// Channels Object with an Array of Subscriptions
const PUBNUB = ((setup: Setup): typeof PUBNUB => {
    let key: string;
    for (key of Object.keys(setup)) {
        //(PUBNUB as any)[key] = setup[key];
        (PUBNUB as any)[key] = setup[key as keyof Setup];
    }
    return PUBNUB;
}) as any;

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
    let resolver: (msg: any, payload: any) => void = () => {};
    let promissory = (): Promise<any> => new Promise(resolve => resolver = (data: object) => resolve(data)); 
    let receiver: Promise<any> = promissory();
    let encoder: TextDecoder = new TextDecoder();
    let boundary: RegExp = /[\n]/g;
    let reader: ReadableStreamDefaultReader | null = null;
    let response: Response | null = null;
    let buffer: string = '';
    let subscribed: boolean = true;
    let controller: AbortController = new AbortController();
    let signal: AbortSignal = controller.signal;

    // Check for comma in channel and return error if found
    if (channel.includes(',')) {
        throw new Error('Only one channel is allowed. Comma symbol "," found in channel name.');
    }

    async function startStream(): Promise<void> {
        let uri: string = `https://${origin}/stream/${subkey}/${channel}/0/${timetoken}`;
        buffer = '';

        try {
            response = await fetch(`${uri}?${params}`, {signal});
        } catch (e) {
            return continueStream(1000);
        }

        try {
            //reader = response.body?.getReader();
            reader = (response.body?.getReader() as ReadableStreamDefaultReader<any> | null);
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
        let chunk: ReadableStreamReadResult<Uint8Array> | undefined = await reader?.read().catch(_ => {
            continueStream();
            return undefined;
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
                    //SUBSCRIPTIONS[channel].forEach( sub => sub.messages(m, jsonmsg) );
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

    // Subscription Generator
    async function* generateSubscription(): AsyncGenerator<any, void, unknown> {
        while (subscribed) yield await receiver;
    }
    function createSubscription(): AsyncGenerator<any, void, unknown> & { messages: Function; unsubscribe: Function; } {
        const generator = generateSubscription(); // The original async generator function
        return {
            next: (...args) => generator.next(...args),
            return: (...args) => generator.return(...args),
            throw: (...args) => generator.throw(...args),
            [Symbol.asyncIterator]: function() { return this; },
            // Additional methods
            messages: (receiver: (m: any) => void) => (setup.messages = receiver),
            unsubscribe: () => {
                delete SUBSCRIPTIONS[channel];
                subscribed = false;
                controller.abort();
            },
        };
    }

    // Prepare channel subscription and start stream
    const subscription = createSubscription();
    if (!(channel in SUBSCRIPTIONS)) {
        SUBSCRIPTIONS[channel] = [];
        startStream();
    }

    SUBSCRIPTIONS[channel].push(subscription);
    return subscription;
};

// PubNub Unsubscribe
PUBNUB.unsubscribe = (setup: Setup = {}): void => {
    let channel: string = setup.channel ?? PUBNUB.channel ?? defaultChannel;
    if (channel in SUBSCRIPTIONS) {
        SUBSCRIPTIONS[channel].forEach((sub: any) => sub.unsubscribe());
    }
};

// PubNub Publish
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

// Extract URI Parameters
function extractParams(uri: string): { [key: string]: string } {
    let params: { [key: string]: string } = {};
    let parts: string[] = uri.split('?');
    if (parts.length > 1) {
        parts[1].split('&').forEach(part => {
            let pair: string[] = part.split('=');
            params[pair[0]] = decodeURIComponent(pair[1]);
        });
    }
    return params;
}
