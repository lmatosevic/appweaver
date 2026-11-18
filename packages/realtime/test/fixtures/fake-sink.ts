import {
  StreamFrameLike,
  StreamFrameMessage,
  StreamSink,
  StreamStart
} from '../../stream/types';

/** A subscriber of a stream recording what it receives. */
export class FakeSink implements StreamSink {
  public readonly starts: StreamStart[] = [];
  public readonly frames: StreamFrameLike[] = [];
  public readonly gaps: [number, number, number][] = [];
  public readonly finished: number[] = [];
  public overflowed: boolean = false;
  public buffered: number = 0;

  /** The messages of the frames received. */
  public get messages(): StreamFrameMessage[] {
    return this.frames.map((frame) => frame.message);
  }

  /** The data of the chunks received. */
  public get chunks(): unknown[] {
    return this.messages
      .filter((message) => message.type === 'chunk')
      .map((message) => (message as { data: unknown }).data);
  }

  public start(start: StreamStart): void {
    this.starts.push(start);
  }

  public write(frame: StreamFrameLike): void {
    this.frames.push(frame);
  }

  public gap(sid: number, from: number, to: number): void {
    this.gaps.push([sid, from, to]);
  }

  public bufferedAmount(): number {
    return this.buffered;
  }

  public overflow(): void {
    this.overflowed = true;
  }

  public finish(sid: number): void {
    this.finished.push(sid);
  }
}
