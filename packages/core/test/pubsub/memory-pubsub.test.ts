import { testPubSubContract } from '@appweaver/testing';
import { MemoryPubSub } from '../../pubsub/memory-pubsub';

testPubSubContract('MemoryPubSub', () => new MemoryPubSub());
