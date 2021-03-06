import {Actor, createActor} from './createActor';
import {createStateActor} from './createStateActor';
import getMailbox from "./getMailbox";
import uuid = require('uuid/v4');
import debug = require('debug');
import {System} from "./System";
import {Observable} from "rxjs/Observable";
import "rxjs/add/observable/merge";
import {IScheduler} from "rxjs/Scheduler";
import {IActorFactory, SystemActor} from "./SystemActor";
import {IActorRegister, addActor, removeActor} from "./ActorRegister";
import {ActorRef} from "./ActorRef";
const logger = debug('staunch');

const log = (ns) => (message) => logger(`${ns}`, message);

export interface ICreateOptions {
    messageScheduler?: IScheduler
    factory?: IActorFactory
}

type RegisterFn = (register: {[index: string]: Actor}, IActor) => {[index: string]: Actor};


export function createSystem(opts: ICreateOptions = {}): System {

    const system = new System(opts);

    // Create a global actorRegister containing actors by address

    Observable.merge(
        system.incomingActors.map((incoming) => ({
            actor: incoming,
            fn: addActor as RegisterFn
        })),
        system.outgoingActors.map((incoming) => ({
            actor: incoming,
            fn: removeActor as RegisterFn
        })),
    )
        .scan(function (acc, {actor, fn}) {
            return fn(acc, actor);
        }, {} as IActorRegister)
        // .do(x => console.log(x))
        .subscribe(system.actorRegister);

    // for incoming actors, create a mailbox for each
    const actorsWithMailboxes = system.incomingActors
        .map(actor => {
            const mailbox = getMailbox(actor, actor.mailboxType, system);
            return {
                mailbox,
                actor
            }
        }).share();

    actorsWithMailboxes.scan((acc, { actor, mailbox }) => {
        acc[actor.address] = mailbox;
        return acc;
    }, <Actor>{}).subscribe(system.mailboxes);

    // for each registered mailbox, subscribe to
    // it's outgoing messages and pump the output
    // into the 'responses' stream
    actorsWithMailboxes.flatMap(x => {
        return x.mailbox
            .outgoing
            .do((incoming: MessageResponse) => {
                if (incoming.errors.length) {
                    const address = x.actor.address;
                    const factory = x.actor._factoryMethod;
                    return Observable.concat(
                        system.restartActor(x.actor),
                        system.removeActor(new ActorRef(x.actor.address, system)),
                        system.reincarnate(address, factory)
                    ).subscribe();
                }
            })
    }).subscribe(x => system.responses.next(x as any));

    // the arbiter takes all incoming messages throughout
    // the entire system and distributes them as needed into
    // the correct mailboxes
    system.arbiter
        .withLatestFrom(system.actorRegister, system.mailboxes, function ({action, messageID}, register, mailboxes) {
            const [ name ] = action.address.split('.');
            return {
                action,
                actor: register[name],
                mailbox: mailboxes[name],
                register,
                name,
                messageID
            }
        })
        .filter(x => {
            return x.actor && x.mailbox;
        })
        .do(x => {
            x.mailbox.incoming.next({action: x.action, messageID: x.messageID});
        })
        .subscribe();

    // register the /system actor
    system.actorOf(opts.factory || SystemActor, '/system');

    return system;
}

export {
    createActor,
    createStateActor
};

