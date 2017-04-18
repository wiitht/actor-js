interface Window {
    staunch: any
}

type AskFn = (name: string, payload: any, id?: string) => any
type TellFn = (name: string, payload: any, id?: string) => any

interface ActorRef {
    name: string,
    ask: AskFn,
    tell: TellFn
    hasAddress(name: string): boolean
    addresses: {
        methods: string[]
        effects: string[]
    }
}
type MessageId = string;

interface IncomingMessage {
    id: MessageId
    action: IOutgoingMessage
}

interface IOutgoingMessage {
    type: string,
    payload?: any
}

interface MessageResponse {
    response: any
    respId: string
}

type Method = (payload: any, message: IncomingMessage) => any;