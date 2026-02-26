import {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

export type Server = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export type Router = Pick<
  Server,
  'route' | 'get' | 'post' | 'patch' | 'put' | 'delete'
>;
